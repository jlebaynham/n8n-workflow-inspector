import assert from "node:assert/strict";
import { normaliseWorkflow, walkWorkflow } from "../extension/lib/walk.js";
import { scanWorkflow } from "../extension/lib/scan.js";
import { cleanWorkflow } from "../extension/lib/clean.js";
import { describeNode } from "../extension/lib/nodes.js";

// Junk nodes and ghost connections don't crash anything
const junk = { nodes: [null, {}, { name: 5 }, { name: "A", type: null, parameters: null }, { name: "B", type: "n8n-nodes-base.noOp" }],
  connections: { A: { main: [[{ node: "B" }, { node: "Ghost" }]] }, Ghost: { main: [[{ node: "A" }]] }, B: { main: [[{ node: "A" }]] }, Bad: null } };
const w = walkWorkflow(normaliseWorkflow(junk).workflow);
assert.ok(w.steps.length >= 1);
scanWorkflow(junk); cleanWorkflow(junk);

// Loops terminate
const loop = { nodes: [
  { name: "Start", type: "n8n-nodes-base.manualTrigger", position: [0, 0] },
  { name: "Loop", type: "n8n-nodes-base.splitInBatches", position: [200, 0], parameters: { batchSize: 10 } },
  { name: "Work", type: "n8n-nodes-base.noOp", position: [400, 0] },
], connections: { Start: { main: [[{ node: "Loop" }]] }, Loop: { main: [[], [{ node: "Work" }]] }, Work: { main: [[{ node: "Loop" }]] } } };
const lw = walkWorkflow(loop);
assert.equal(lw.steps.length, 3);
assert.equal(lw.steps[1].next[0].label, "Each batch");
assert.match(lw.steps[1].text, /batches of 10/);

// Wrappers
assert.equal(normaliseWorkflow({ workflow: loop }).workflow, loop);
const arr = normaliseWorkflow([loop, loop]);
assert.match(arr.note, /2 workflows/);
assert.throws(() => normaliseWorkflow({ foo: 1 }), /doesn't look like an n8n workflow/);
assert.throws(() => normaliseWorkflow([]), /empty list/);
const empty = walkWorkflow({ nodes: [], connections: {} });
assert.equal(empty.steps.length, 0);

// No trigger: starts from nodes with no inputs
const noTrig = { nodes: [{ name: "X", type: "n8n-nodes-base.set", position: [0, 0] }, { name: "Y", type: "n8n-nodes-base.noOp", position: [1, 0] }], connections: { X: { main: [[{ node: "Y" }]] } } };
assert.deepEqual(walkWorkflow(noTrig).steps.map((s) => s.name), ["X", "Y"]);

// Descriptions for a spread of node types
const d = (type, parameters = {}) => describeNode({ type, parameters }).text;
const cases = [
  ["n8n-nodes-base.scheduleTrigger", { rule: { interval: [{ field: "hours", hoursInterval: 2 }] } }, /every 2 hours/],
  ["n8n-nodes-base.scheduleTrigger", { rule: { interval: [{ field: "days", triggerAtHour: 9 }] } }, /every day at 09:00/],
  ["n8n-nodes-base.slackTrigger", {}, /Starts when something happens in Slack/],
  ["n8n-nodes-base.slack", { resource: "message", operation: "post" }, /Slack: post message/],
  ["n8n-nodes-base.notion", { resource: "databasePage", operation: "create" }, /Notion: create database page/],
  ["n8n-nodes-base.hubspot", { resource: "contact", operation: "upsert" }, /HubSpot: create or update contact/],
  ["n8n-nodes-base.code", { language: "python", pythonCode: "a=1\nb=2" }, /Python code \(2 lines\)/],
  ["n8n-nodes-base.httpRequest", { url: "={{ $json.url }}" }, /set by an expression/],
  ["n8n-nodes-base.httpRequest", { method: "POST", url: "https://api.anthropic.com/v1/messages" }, /Anthropic/],
  ["@n8n/n8n-nodes-langchain.lmChatAnthropic", { model: { __rl: true, value: "claude-sonnet-4" } }, /Anthropic chat model \(claude-sonnet-4\)/],
  ["@n8n/n8n-nodes-langchain.embeddingsOpenAi", {}, /embeddings \(OpenAI\)/],
  ["@n8n/n8n-nodes-langchain.vectorStorePinecone", {}, /Pinecone/],
  ["@n8n/n8n-nodes-langchain.toolHttpRequest", {}, /Tool the AI can use: call a web address/],
  ["n8n-nodes-mycompany.widget", {}, /community node/],
  ["n8n-nodes-base.openAi", { operation: "message", model: "gpt-4o" }, /OpenAI: message \(gpt-4o\)/],
  ["n8n-nodes-base.webhook", { path: "={{ $json.p }}" }, /^Starts when a GET request arrives at a webhook$/],
  ["n8n-nodes-base.formTrigger", { formTitle: "Book a call" }, /form "Book a call"/],
];
for (const [type, p, re] of cases) assert.match(d(type, p), re, `${type}: ${d(type, p)}`);

// Performance on a big workflow
const big = { nodes: [], connections: {} };
for (let i = 0; i < 3000; i++) {
  big.nodes.push({ name: `N${i}`, type: i ? "n8n-nodes-base.set" : "n8n-nodes-base.manualTrigger", position: [i, 0], parameters: { assignments: { assignments: [{ name: "x", value: "hello world, nothing secret here at all" }] } } });
  if (i) big.connections[`N${i - 1}`] = { main: [[{ node: `N${i}` }]] };
}
let t = Date.now();
walkWorkflow(big); scanWorkflow(big); cleanWorkflow(big);
const ms = Date.now() - t;
assert.ok(ms < 3000, `too slow: ${ms}ms`);
console.log(`EDGE CHECKS PASS (3000 nodes in ${ms}ms)`);
