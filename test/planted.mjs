// Builds a workflow full of fake secrets at runtime (pieces joined so no real-looking key sits in the repo),
// then checks the scanner finds every one, ignores placeholders, and the clean copy removes them.
import fs from "node:fs";
import assert from "node:assert/strict";
import { normaliseWorkflow, walkWorkflow } from "../extension/lib/walk.js";
import { scanWorkflow, summarise } from "../extension/lib/scan.js";
import { cleanWorkflow } from "../extension/lib/clean.js";

const j = (...p) => p.join("");
const fake = {
  openai: j("sk-", "proj-", "abcDEF1234567890", "ghiJKL0987654321mnop"),
  anthropic: j("sk-", "ant-", "api03-", "ZZZZyyyyXXXXwwww1111"),
  stripe: j("sk", "_live_", "51Habcdefghijklmnop", "QRSTU"),
  github: j("gh", "p_", "aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789"),
  slackHook: j("https://hooks.", "slack.com/services/", "T0A1B2C3D/B0E4F5G6H/", "aB3dE5fG7hJ9kL1mN3pQ5rS7"),
  google: j("AI", "za", "SyA1234567890abcdefghijklmnopqrstuv"),
  aws: j("AK", "IA", "IOSFODNN7EXAMPLQ"),
  telegram: j("123456789", ":", "AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawZ"),
  sendgrid: j("SG", ".", "abcdefghijklmnopqrstuv", ".", "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq"),
  jwt: j("ey", "JhbGciOiJIUzI1NiJ9", ".", "ey", "JzdWIiOiIxMjM0NTY3ODkwIn0", ".", "dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"),
  bearer: j("Bearer ", "a1b2c3d4e5f6g7h8i9j0k1l2m3n4"),
  pg: j("postgres://", "admin:", "Sup3rS3cret", "@db.example.net:5432/app"),
  pem: j("-----BEGIN ", "RSA PRIVATE KEY-----\n", "MIIEowIBAAKCAQEA1x2y3z4ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop0123456789+/qrstuvwx", "\n-----END ", "RSA PRIVATE KEY-----"),
  twilioSid: j("AC", "0123456789abcdef0123456789abcdef"),
  literalKey: "q8w7e6r5t4y3u2i1",
};

const wf = {
  id: "abc123", versionId: "v-1", name: "Planted test", active: true,
  meta: { instanceId: "deadbeefcafebabe1234567890" },
  pinData: { "Form": [{ json: { email: "real.customer@customer-mail.test", phone: "+61 491 570 156" } }] },
  staticData: { lastId: 42 },
  nodes: [
    { id: "11111111-2222-3333-4444-555555555555", name: "Form", type: "n8n-nodes-base.formTrigger", typeVersion: 2, position: [0, 0], webhookId: "w1", parameters: { formTitle: "Contact" } },
    { id: "n2", name: "Call OpenAI", type: "n8n-nodes-base.httpRequest", typeVersion: 4, position: [200, 0], parameters: { method: "POST", url: "https://api.openai.com/v1/chat/completions", sendHeaders: true, headerParameters: { parameters: [{ name: "Authorization", value: `=Bearer ${fake.openai}` }, { name: "x-api-key", value: fake.literalKey }] } } },
    { id: "n3", name: "Settings", type: "n8n-nodes-base.set", typeVersion: 3, position: [400, 0], parameters: { assignments: { assignments: [
      { id: "a1", name: "anthropicKey", value: fake.anthropic, type: "string" },
      { id: "a2", name: "apiKey", value: "PASTE_YOUR_KEY_HERE", type: "string" },
      { id: "a3", name: "token", value: "={{ $env.MY_TOKEN }}", type: "string" },
      { id: "a4", name: "ownerEmail", value: "you@example.com", type: "string" },
      { id: "a5", name: "realEmail", value: "jane@harbour-plumbing.test", type: "string" },
      { id: "a6", name: "mobile", value: "0491 570 156", type: "string" },
      { id: "a7", name: "password", value: "hunter2hunter2", type: "string" },
      { id: "a8", name: "when", value: "2026-10-10T10:45:00.000Z", type: "string" },
      { id: "a9", name: "sheetUrl", value: "https://docs.google.com/spreadsheets/d/1ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210/edit", type: "string" },
    ] } } },
    { id: "n4", name: "Code", type: "n8n-nodes-base.code", typeVersion: 2, position: [600, 0], parameters: { jsCode: [
      `const stripe = "${fake.stripe}";`, `const gh = "${fake.github}";`, `const g = "${fake.google}";`, `const aws = "${fake.aws}";`,
      `const sg = "${fake.sendgrid}";`, `const jwt = "${fake.jwt}";`, `const h = "${fake.bearer}";`, `const db = "${fake.pg}";`,
      `const pem = \`${fake.pem}\`;`, `const sid = "${fake.twilioSid}";`, `fetch("http://localhost:5678/webhook/x");`,
      `const uuid = "123e4567-e89b-12d3-a456-426614174000"; const v = "1.2.3";`,
    ].join("\n") } },
    { id: "n5", name: "Slack", type: "n8n-nodes-base.httpRequest", typeVersion: 4, position: [800, 0], parameters: { method: "POST", url: fake.slackHook } },
    { id: "n6", name: "Telegram", type: "n8n-nodes-base.httpRequest", typeVersion: 4, position: [1000, 0], parameters: { url: `=https://api.telegram.org/bot${fake.telegram}/sendMessage` } },
    { id: "n7", name: "Log", type: "n8n-nodes-base.googleSheets", typeVersion: 4, position: [1200, 0], credentials: { googleSheetsOAuth2Api: { id: "cred1", name: "Jon's Google" } }, parameters: {
      operation: "append",
      documentId: { __rl: true, value: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", mode: "list", cachedResultName: "Leads 2026", cachedResultUrl: "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit" },
      sheetName: { __rl: true, value: "gid=0", mode: "list", cachedResultName: "Sheet1" },
    } },
    { id: "n8", name: "Agent", type: "@n8n/n8n-nodes-langchain.agent", typeVersion: 1, position: [1400, 0], parameters: {} },
    { id: "n9", name: "Model", type: "@n8n/n8n-nodes-langchain.lmChatOpenAi", typeVersion: 1, position: [1400, 200], parameters: { model: { __rl: true, value: "gpt-4o-mini", mode: "list" } } },
    { id: "n10", name: "Memory", type: "@n8n/n8n-nodes-langchain.memoryBufferWindow", typeVersion: 1, position: [1500, 200], parameters: {} },
    { id: "n11", name: "Orphan", type: "n8n-nodes-base.noOp", typeVersion: 1, position: [0, 400], parameters: {} },
    { id: "n12", name: "Note", type: "n8n-nodes-base.stickyNote", typeVersion: 1, position: [0, -200], parameters: { content: "## Setup\nAsk me at owner@realdomain.test" } },
  ],
  connections: {
    Form: { main: [[{ node: "Call OpenAI", type: "main", index: 0 }]] },
    "Call OpenAI": { main: [[{ node: "Settings", type: "main", index: 0 }]] },
    Settings: { main: [[{ node: "Code", type: "main", index: 0 }]] },
    Code: { main: [[{ node: "Slack", type: "main", index: 0 }, { node: "Telegram", type: "main", index: 0 }]] },
    Telegram: { main: [[{ node: "Log", type: "main", index: 0 }]] },
    Log: { main: [[{ node: "Agent", type: "main", index: 0 }]] },
    Model: { ai_languageModel: [[{ node: "Agent", type: "ai_languageModel", index: 0 }]] },
    Memory: { ai_memory: [[{ node: "Agent", type: "ai_memory", index: 0 }]] },
  },
};

fs.mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("./out/planted.json", import.meta.url), JSON.stringify(wf, null, 2));

const { workflow } = normaliseWorkflow(wf);
const findings = scanWorkflow(workflow);
const kinds = findings.map((f) => f.kind);
const has = (k, n = 1) => assert.ok(kinds.filter((x) => x === k).length >= n, `expected ${n}+ ${k}, got ${kinds.filter((x) => x === k).length}`);
["openai", "anthropic", "stripe", "github", "slack-webhook", "google-key", "aws-key", "telegram-token", "sendgrid", "jwt", "bearer", "url-password", "private-key",
 "twilio-sid", "internal", "credential", "pin-data", "static-data", "instance-id", "workflow-id", "webhook-id", "account-pick", "google-file"].forEach((k) => has(k));
has("named-secret", 2); // x-api-key literal + password literal
has("email", 3); // pinData customer, jane@, sticky note
has("phone", 2); // pinData + Settings mobile

// No false alarms
const previews = findings.map((f) => f.preview).join(" | ");
assert.ok(!findings.some((f) => /you@example\.com/.test(f.preview)), "flagged you@example.com");
assert.ok(!findings.some((f) => f.field && /api key/i.test(f.field) && f.kind === "named-secret" && f.preview.startsWith("PA")), "flagged a placeholder");
assert.ok(!findings.some((f) => f.kind === "named-secret" && /token/i.test(f.title) && f.where === "Settings"), "flagged an $env expression");
assert.ok(!findings.some((f) => f.kind === "phone" && /2026/.test(f.preview)), "flagged a date as a phone");
assert.ok(!findings.some((f) => f.kind === "account-pick" && /gpt/.test(f.preview)), "flagged a model pick");
// Secrets never shown in full
for (const v of Object.values(fake)) assert.ok(!previews.includes(v), `full secret shown: ${v.slice(0, 8)}`);

const walk = walkWorkflow(workflow);
assert.equal(walk.unconnected.length, 1);
assert.equal(walk.unconnected[0].name, "Orphan");
const agent = walk.steps.find((s) => s.name === "Agent");
assert.deepEqual(agent.attached.map((a) => a.label).sort(), ["Memory", "Model"]);
assert.match(agent.attached.find((a) => a.label === "Model").text, /OpenAI chat model \(gpt-4o-mini\)/);

const { workflow: clean, changes } = cleanWorkflow(workflow, { emails: true, phones: true, picks: true });
const after = scanWorkflow(clean);
const s = summarise(after);
console.log("changes:", changes);
console.log("left after clean:", after.map((f) => `${f.severity}:${f.kind}:${f.where}`));
assert.equal(s.count.high, 0, "high findings left after clean");
const cleanText = JSON.stringify(clean);
for (const v of Object.values(fake)) {
  if (v === fake.pg) { assert.ok(!cleanText.includes("Sup3rS3cret"), "db password left"); continue; }
  assert.ok(!cleanText.includes(v.replace(/\n/g, "\\n")), `secret left in clean copy: ${v.slice(0, 8)}`);
}
assert.equal(clean.nodes.length, wf.nodes.length, "node count changed");
assert.deepEqual(Object.keys(clean.connections), Object.keys(wf.connections), "connections changed");
assert.ok(clean.nodes.every((n) => !n.credentials && !n.webhookId), "credentials/webhookId left");
assert.ok(!("pinData" in clean) && !("staticData" in clean) && !("id" in clean), "structure not stripped");
assert.equal(clean.active, false);
assert.deepEqual(clean.meta, { templateCredsSetupCompleted: false });
assert.equal(workflow.nodes[6].credentials.googleSheetsOAuth2Api.name, "Jon's Google", "original was changed");
// Without options, personal details stay but secrets still go
const light = cleanWorkflow(workflow).workflow;
assert.ok(JSON.stringify(light).includes("jane@harbour-plumbing.test"));
assert.equal(summarise(scanWorkflow(light)).count.high, 0);
fs.writeFileSync(new URL("./out/planted-clean.json", import.meta.url), JSON.stringify(clean, null, 2));
console.log("ALL PLANTED CHECKS PASS", summarise(findings));
