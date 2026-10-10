// Reads an n8n workflow's connections and turns it into an ordered walkthrough.
import { describeNode, isStickyNote, isTriggerType, switchOutputs, parseType, own } from "./nodes.js";

// Accepts a workflow, an n8n.io template wrapper, or an array export. Throws a friendly error otherwise.
export function normaliseWorkflow(data) {
  let wf = data;
  let note = "";
  if (Array.isArray(wf)) {
    if (!wf.length) throw new Error("That file is an empty list, not a workflow.");
    if (wf.length > 1) note = `This file holds ${wf.length} workflows. Showing the first one.`;
    wf = wf[0];
  }
  if (wf && typeof wf === "object" && !Array.isArray(wf.nodes) && wf.workflow && Array.isArray(wf.workflow.nodes)) wf = wf.workflow;
  if (wf && typeof wf === "object" && !Array.isArray(wf.nodes) && wf.data && Array.isArray(wf.data.nodes)) wf = wf.data;
  if (!wf || typeof wf !== "object" || !Array.isArray(wf.nodes)) {
    throw new Error("This doesn't look like an n8n workflow. Export it from n8n with Download, or select nodes and copy them.");
  }
  if (!wf.connections || typeof wf.connections !== "object") wf = { ...wf, connections: {} };
  return { workflow: wf, note };
}

function nodeMap(wf) {
  const byName = new Map();
  for (const n of wf.nodes) if (n && typeof n.name === "string") byName.set(n.name, n);
  return byName;
}

// Main-flow edges and AI attachments.
export function buildGraph(wf) {
  const byName = nodeMap(wf);
  const out = new Map(); // name -> [[targets for output 0], [output 1], ...]
  const incoming = new Map(); // name -> count of main inputs
  const attachments = new Map(); // agent name -> [{kind, node}]
  const subNodes = new Set();
  for (const [source, types] of Object.entries(wf.connections || {})) {
    if (!types || typeof types !== "object") continue;
    for (const [type, outputs] of Object.entries(types)) {
      if (!Array.isArray(outputs)) continue;
      outputs.forEach((targets, index) => {
        if (!Array.isArray(targets)) return;
        for (const t of targets) {
          if (!t || typeof t.node !== "string" || !byName.has(t.node) || !byName.has(source)) continue;
          if (type === "main") {
            if (!out.has(source)) out.set(source, []);
            const list = out.get(source);
            while (list.length <= index) list.push([]);
            if (!list[index].includes(t.node)) list[index].push(t.node);
            incoming.set(t.node, (incoming.get(t.node) || 0) + 1);
          } else {
            subNodes.add(source);
            if (!attachments.has(t.node)) attachments.set(t.node, []);
            attachments.get(t.node).push({ kind: type.replace(/^ai_/, ""), node: byName.get(source) });
          }
        }
      });
    }
  }
  return { byName, out, incoming, attachments, subNodes };
}

const KIND_LABELS = {
  languageModel: "Model", memory: "Memory", tool: "Tool", outputParser: "Answer format",
  embedding: "Embeddings", vectorStore: "Document store", document: "Documents", textSplitter: "Text splitter",
  retriever: "Retriever", reranker: "Reranker",
};

function outputLabels(node, count) {
  const key = parseType(node.type).key;
  if (key === "if") return ["If yes", "If no"];
  if (key === "filter") return ["Kept", "Discarded"];
  if (key === "switch") {
    const labels = switchOutputs(node);
    return Array.from({ length: count }, (_, i) => labels[i] || `Path ${i + 1}`);
  }
  if (key === "splitInBatches") return ["When done", "Each batch"];
  if (count > 1) return Array.from({ length: count }, (_, i) => `Output ${i + 1}`);
  return ["Then"];
}

function byPosition(a, b) {
  const pa = Array.isArray(a.position) ? a.position : [0, 0];
  const pb = Array.isArray(b.position) ? b.position : [0, 0];
  return pa[0] - pb[0] || pa[1] - pb[1];
}

// Returns { steps, unconnected, notes, overview }.
export function walkWorkflow(wf) {
  const g = buildGraph(wf);
  const real = wf.nodes.filter((n) => n && typeof n.name === "string" && !isStickyNote(n));
  const notes = wf.nodes.filter((n) => n && isStickyNote(n));
  const flowNodes = real.filter((n) => !g.subNodes.has(n.name));

  let starts = flowNodes.filter((n) => isTriggerType(n.type));
  if (!starts.length) starts = flowNodes.filter((n) => !g.incoming.get(n.name));
  starts = starts.slice().sort(byPosition);
  // Everything sits in a loop with no clear start: begin at the leftmost node.
  if (!starts.length && flowNodes.length) starts = [flowNodes.slice().sort(byPosition)[0]];

  const order = [];
  const seen = new Set();
  const queue = starts.map((n) => n.name);
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    order.push(name);
    const outs = g.out.get(name) || [];
    for (const targets of outs) {
      const sorted = targets.map((t) => g.byName.get(t)).filter(Boolean).sort(byPosition);
      for (const t of sorted) if (!seen.has(t.name)) queue.push(t.name);
    }
  }

  const number = new Map(order.map((name, i) => [name, i + 1]));
  const steps = order.map((name) => {
    const node = g.byName.get(name);
    const d = describeNode(node);
    const outs = g.out.get(name) || [];
    const labels = outputLabels(node, outs.length);
    const next = outs
      .map((targets, i) => ({ label: labels[i] || `Output ${i + 1}`, targets: targets.map((t) => ({ name: t, step: number.get(t) })) }))
      .filter((o) => o.targets.length);
    const attached = (g.attachments.get(name) || []).map((a) => ({
      label: own(KIND_LABELS, a.kind) || a.kind,
      name: a.node.name,
      text: describeNode(a.node).text,
      disabled: !!a.node.disabled,
    }));
    return { step: number.get(name), name, type: node.type, text: d.text, trigger: d.trigger, disabled: !!node.disabled, next, attached };
  });

  const unconnected = flowNodes
    .filter((n) => !seen.has(n.name))
    .sort(byPosition)
    .map((n) => ({ name: n.name, text: describeNode(n).text, disabled: !!n.disabled }));

  // Overview facts
  const apps = new Set();
  const hosts = new Set();
  let aiCount = 0;
  let codeCount = 0;
  for (const n of real) {
    const d = describeNode(n);
    if (d.app) apps.add(d.app);
    if (d.ai) aiCount++;
    if (d.code) codeCount++;
    const t = parseType(n.type).key;
    if ((t === "httpRequest" || t === "toolHttpRequest" || t === "httpRequestTool") && n.parameters) {
      const url = typeof n.parameters.url === "string" ? n.parameters.url : "";
      const m = url.replace(/^=/, "").match(/^https?:\/\/([^/?#:\s{}]+)/i);
      hosts.add(m ? m[1].toLowerCase() : "an address set by an expression");
    }
  }
  const triggers = steps.filter((s) => s.trigger).map((s) => s.text);
  const overview = {
    name: typeof wf.name === "string" && wf.name.trim() ? wf.name.trim() : "Untitled workflow",
    nodeCount: real.length,
    noteCount: notes.length,
    triggers: triggers.length ? triggers : starts.map((n) => describeNode(n).text),
    apps: [...apps].sort((a, b) => a.localeCompare(b)),
    hosts: [...hosts],
    aiCount,
    codeCount,
    disabledCount: real.filter((n) => n.disabled).length,
  };

  const noteTexts = notes
    .sort(byPosition)
    .map((n) => (n.parameters && typeof n.parameters.content === "string" ? n.parameters.content : ""))
    .filter((t) => t.trim());

  return { steps, unconnected, notes: noteTexts, overview };
}
