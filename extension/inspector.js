// Page logic. Everything happens in this tab: no network requests, no storage.
// All text from the workflow is inserted with textContent, never as HTML.
import { normaliseWorkflow, walkWorkflow } from "./lib/walk.js";
import { scanWorkflow, summarise, redactForDisplay as r } from "./lib/scan.js";
import { cleanWorkflow } from "./lib/clean.js";
import { buildSample } from "./lib/sample.js";

const MAX_BYTES = 25 * 1024 * 1024;
const $ = (id) => document.getElementById(id);

let current = null; // { workflow, name }

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

function showError(message) {
  const box = $("error");
  box.textContent = message;
  box.hidden = false;
}

function clearError() {
  $("error").hidden = true;
  $("error").textContent = "";
}

function fail(message) {
  current = null;
  $("results").hidden = true;
  showError(message);
}

function parseText(text, label) {
  clearError();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    if (e instanceof RangeError) fail("That file is nested too deeply to read.");
    else fail("That isn't valid JSON. In n8n, use Download on the workflow, or select the nodes and copy them, then try again.");
    return false;
  }
  let normalised;
  try {
    normalised = normaliseWorkflow(data);
  } catch (e) {
    fail(e.message || "Couldn't read that workflow.");
    return false;
  }
  return load(normalised.workflow, normalised.note, label);
}

// Works everything out first, then shows it, so a bad file never leaves old results on screen.
function load(workflow, note, label) {
  try {
    const walk = walkWorkflow(workflow);
    const findings = scanWorkflow(workflow);
    current = { workflow, note, name: walk.overview.name };
    render(walk, findings, label);
    return true;
  } catch (e) {
    console.warn("Workflow Inspector could not read this workflow", e);
    fail("Something in this workflow couldn't be read. It may be from a very old or unusual version of n8n.");
    return false;
  }
}

function readFile(file) {
  if (!file) return;
  if (file.size > MAX_BYTES) {
    showError("That file is over 25 MB, which is far bigger than a normal workflow. Check it's the right file.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => parseText(String(reader.result), file.name);
  reader.onerror = () => showError("Couldn't read that file.");
  reader.readAsText(file);
}

function fact(label, value, big) {
  return el("div", { class: "fact" }, [el("dt", { text: label }), el("dd", {}, big ? [el("span", { class: "big", text: String(value) })] : [String(value)])]);
}

function renderOverview(walk) {
  const o = walk.overview;
  $("ov-title").textContent = r(o.name);
  const note = $("ov-note");
  note.hidden = !current.note;
  note.textContent = current.note || "";
  const facts = $("facts");
  facts.replaceChildren(
    fact("Nodes", o.nodeCount, true),
    fact("Starts when", o.triggers.length ? r(o.triggers.join(" · ")) : "No starting step found"),
    fact("Apps and services", o.apps.length ? o.apps.join(", ") : "None, it only uses n8n's own tools"),
    fact("AI steps", o.aiCount, true),
    fact("Custom code steps", o.codeCount, true),
    ...(o.hosts.length ? [fact("Sends data to", o.hosts.join(", "))] : []),
    ...(o.disabledCount ? [fact("Switched off", o.disabledCount, true)] : []),
  );
}

function stepLink(t) {
  if (!t.step) return el("span", { text: r(t.name) });
  return el("a", { href: `#step-${t.step}`, text: `${t.step}. ${r(t.name)}` });
}

function renderSteps(walk) {
  const list = $("steps");
  list.replaceChildren();
  if (!walk.steps.length) list.append(el("li", { class: "muted", text: "No connected steps found." }));
  for (const s of walk.steps) {
    const tags = [];
    if (s.trigger) tags.push(el("span", { class: "tag start", text: "Start" }));
    if (s.disabled) tags.push(el("span", { class: "tag off", text: "Switched off" }));
    const body = [el("div", { class: "step-name" }, [r(s.name), ...tags]), el("p", { class: "step-text", text: r(s.text) })];
    if (s.attached.length) {
      body.push(el("ul", { class: "attached" }, s.attached.map((a) => el("li", {}, [el("strong", { text: `${a.label}: ` }), `${r(a.text)}${a.disabled ? " (switched off)" : ""}`]))));
    }
    for (const n of s.next) {
      const links = [];
      n.targets.forEach((t, i) => {
        if (i) links.push(", ");
        links.push(stepLink(t));
      });
      body.push(el("p", { class: "next" }, [el("span", { class: "lbl", text: `${n.label} → ` }), ...links]));
    }
    const li = el("li", { class: `step${s.trigger ? " trigger" : ""}${s.disabled ? " disabled" : ""}`, id: `step-${s.step}` }, [
      el("span", { class: "num", "aria-hidden": "true", text: String(s.step) }),
      el("div", {}, body),
    ]);
    list.append(li);
  }
  const ub = $("unconnected-box");
  ub.hidden = !walk.unconnected.length;
  $("unconnected").replaceChildren(...walk.unconnected.map((u) => el("li", {}, [el("strong", { text: r(u.name) }), ` · ${r(u.text)}${u.disabled ? " (switched off)" : ""}`])));
  const nb = $("notes-box");
  nb.hidden = !walk.notes.length;
  $("notes").replaceChildren(...walk.notes.map((t) => el("p", { class: "note-text", text: r(t) })));
}

const GROUPS = [
  { key: "high", label: "Remove before sharing" },
  { key: "medium", label: "Check before sharing" },
  { key: "low", label: "Tidy up" },
];

function renderFindings(findings) {
  const { count, verdict } = summarise(findings);
  const v = $("verdict");
  const tone = count.high ? "high" : count.medium ? "medium" : "good";
  v.className = `verdict ${tone}`;
  v.replaceChildren(
    el("span", { "aria-hidden": "true", text: tone === "good" ? "✓" : "!" }),
    el("span", { text: verdict }),
    el("span", { class: "counts", text: `${count.high} high · ${count.medium} medium · ${count.low} low` }),
  );
  const box = $("findings");
  box.replaceChildren();
  if (!findings.length) {
    box.append(el("p", { class: "muted", text: "No keys, passwords, personal details or account IDs found." }));
    return;
  }
  for (const g of GROUPS) {
    const items = findings.filter((f) => f.severity === g.key);
    if (!items.length) continue;
    const group = el("div", { class: "group" }, [
      el("h3", { class: "group-title" }, [el("span", { class: `sev ${g.key}`, text: g.key }), g.label]),
    ]);
    for (const f of items) {
      group.append(
        el("div", { class: "finding" }, [
          el("div", { class: "finding-title", text: f.title }),
          el("div", { class: "finding-where", text: `${f.where} · ${f.field}` }),
          f.preview ? el("code", { class: "finding-preview", text: f.preview }) : null,
          el("div", { class: "finding-fix muted", text: f.fix }),
        ]),
      );
    }
    box.append(group);
  }
}

function options() {
  return { emails: $("opt-emails").checked, phones: $("opt-phones").checked, picks: $("opt-picks").checked };
}

function slug(name) {
  return (name || "workflow").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "workflow";
}

function makeClean() {
  if (!current) return null;
  let result;
  try {
    result = cleanWorkflow(current.workflow, options());
  } catch (e) {
    console.warn("Workflow Inspector could not build a clean copy", e);
    showError("Couldn't build a clean copy of this workflow.");
    return null;
  }
  const left = scanWorkflow(result.workflow);
  const changes = $("changes");
  changes.hidden = false;
  changes.replaceChildren(...result.changes.map((c) => el("li", { text: c })));
  const lb = $("left-box");
  lb.hidden = !left.length;
  $("left").replaceChildren(...left.map((f) => el("li", {}, [el("span", { class: `sev ${f.severity}`, text: f.severity }), ` ${f.title} · ${f.where}`])));
  return result.workflow;
}

function render(walk, findings, label) {
  $("loaded-name").textContent = label ? `Loaded: ${r(label)}` : "";
  renderOverview(walk);
  renderSteps(walk);
  renderFindings(findings);
  $("changes").hidden = true;
  $("left-box").hidden = true;
  $("copied").hidden = true;
  $("results").hidden = false;
  const calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  $("results").scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
}

// Wiring
const drop = $("drop");
$("file").addEventListener("change", (e) => readFile(e.target.files && e.target.files[0]));
["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => readFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]));
// Dropping anywhere else on the page shouldn't open the file in the tab.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  if (e.target !== drop && !drop.contains(e.target)) readFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
});

$("paste-go").addEventListener("click", () => {
  const text = $("paste").value.trim();
  if (!text) { showError("Paste the workflow JSON into the box first."); return; }
  if (parseText(text, "pasted JSON")) $("paste").value = "";
});

$("sample").addEventListener("click", () => {
  clearError();
  load(buildSample(), "This is a made-up sample. Every key, email and number in it is fake.", "sample workflow");
});

$("download").addEventListener("click", () => {
  const wf = makeClean();
  if (!wf) return;
  let text;
  try { text = JSON.stringify(wf, null, 2); } catch { showError("Couldn't save this clean copy."); return; }
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: `${slug(r(current.name))}-clean.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
});

$("copy").addEventListener("click", async () => {
  const wf = makeClean();
  if (!wf) return;
  const msg = $("copied");
  try {
    await navigator.clipboard.writeText(JSON.stringify(wf, null, 2));
    msg.textContent = "Copied. Paste it straight into an n8n canvas or a file.";
  } catch {
    msg.textContent = "Your browser blocked copying. Use Download instead.";
  }
  msg.hidden = false;
});
