// "Before you share" safety check for n8n workflow JSON.
// Finds secrets, personal details and account-specific IDs. Pure functions, no DOM.
// Every pattern has bounded repeats so a huge or hostile string can't freeze the page.
import { humanize, appName, own } from "./nodes.js";

export const SEVERITY = { high: 3, medium: 2, low: 1 };

// Text longer than this is reported as "not checked" rather than scanned.
export const MAX_SCAN_LENGTH = 200000;
// Data nested deeper than this is reported rather than walked.
export const MAX_DEPTH = 120;

const SAFE_NAME_KEYWORDS = /^(?:password|passwd|pass|secret|pwd|token|example|changeme|key|apikey)$/i;

// Secret formats. Order matters: more specific patterns first.
const SECRET_PATTERNS = [
  { kind: "private-key", label: "Private key", re: /-----BEGIN ((?:[A-Z]{2,10} ){0,3}PRIVATE KEY(?: BLOCK)?)-----[A-Za-z0-9+/=\s\\:,.-]{40,12000}?-----END \1-----/g },
  { kind: "anthropic", label: "Anthropic API key", re: /(?<![\w/-])sk-ant-[A-Za-z0-9_-]{20,200}/g },
  { kind: "openrouter", label: "OpenRouter API key", re: /(?<![\w/-])sk-or-v1-[A-Za-z0-9]{32,128}/g },
  { kind: "openai", label: "OpenAI (or similar) API key", re: /(?<![\w/-])sk-(?!ant-|or-v1-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,200}/g, needsDigit: true },
  { kind: "stripe", label: "Stripe secret key", re: /(?<![\w/-])(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,200}/g },
  { kind: "stripe-webhook", label: "Stripe webhook secret", re: /(?<![\w/-])whsec_[A-Za-z0-9]{20,100}/g },
  { kind: "github", label: "GitHub token", re: /(?<![\w/-])(?:(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,100}|github_pat_[A-Za-z0-9_]{40,200})/g },
  { kind: "slack-token", label: "Slack token", re: /(?<![\w/-])(?:xox[abposr]-[A-Za-z0-9-]{10,200}|xapp-\d-[A-Za-z0-9-]{20,200})/g },
  { kind: "slack-webhook", label: "Slack webhook address", re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{20,200}/g },
  { kind: "discord-webhook", label: "Discord webhook address", re: /https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[A-Za-z0-9_-]{20,200}/g },
  { kind: "google-key", label: "Google API key", re: /(?<![\w-])AIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g },
  { kind: "google-oauth", label: "Google OAuth client secret", re: /(?<![\w-])GOCSPX-[A-Za-z0-9_-]{20,60}/g },
  { kind: "aws-key", label: "AWS access key", re: /(?<![A-Z0-9])(?:AKIA|ASIA)[0-9A-Z]{16}(?![A-Z0-9])/g },
  { kind: "telegram-token", label: "Telegram bot token", re: /(?:(?<=\/bot)|(?<![A-Za-z0-9]))\d{8,10}:[A-Za-z0-9_-]{35}(?![A-Za-z0-9_-])/g },
  { kind: "sendgrid", label: "SendGrid API key", re: /(?<![\w-])SG\.[A-Za-z0-9_-]{16,40}\.[A-Za-z0-9_-]{20,80}/g },
  { kind: "twilio-key", label: "Twilio API key", re: /(?<![\w-])SK[0-9a-f]{32}(?![\w-])/g },
  { kind: "airtable", label: "Airtable access token", re: /(?<![\w-])pat[A-Za-z0-9]{14}\.[a-f0-9]{64}(?![\w-])/g },
  { kind: "notion", label: "Notion integration secret", re: /(?<![\w-])(?:ntn_|secret_)[A-Za-z0-9]{40,60}(?![\w-])/g },
  { kind: "huggingface", label: "Hugging Face token", re: /(?<![\w-])hf_[A-Za-z0-9]{30,60}(?![\w-])/g },
  { kind: "mailchimp", label: "Mailchimp API key", re: /(?<![\w-])[a-f0-9]{32}-us\d{1,2}(?![\w-])/g },
  { kind: "jwt", label: "Access token (JWT)", re: /(?<![\w-])eyJ[A-Za-z0-9_-]{10,2000}\.eyJ[A-Za-z0-9_-]{10,4000}\.[A-Za-z0-9_-]{10,1000}/g },
  { kind: "bearer", label: "Bearer token", re: /\bBearer\s{1,5}([A-Za-z0-9._~+/-]{20,500}={0,3})/g, group: 1 },
  { kind: "url-password", label: "Password inside a web address", re: /\b[a-z][a-z0-9+.-]{0,30}:\/\/[^\s/:@{}"']{1,128}:([^\s/@{}"']{1,256})@/gi, group: 1 },
  { kind: "url-key", label: "Key inside a web address", re: /[?&](?:api[_-]?key|apikey|key|token|access[_-]?token|auth|secret|password|sig|signature|client[_-]?secret)=([^&#\s"'{}<>]{8,300})/gi, group: 1 },
  { kind: "inline-secret", label: "Hard-coded key or password", re: /["']?\b(?:[A-Za-z]{0,20}[_-]?)?(?:api[_-]?key|apikey|api[_-]?token|access[_-]?token|auth[_-]?token|client[_-]?secret|secret[_-]?key|private[_-]?key|password|passwd)["']?\s{0,5}[:=]\s{0,5}["']([^"'\s{}$<>]{8,300})["']/gi, group: 1 },
];

const OTHER_PATTERNS = [
  { kind: "twilio-sid", label: "Twilio account ID", severity: "medium", re: /(?<![\w-])AC[0-9a-f]{32}(?![\w-])/g },
  { kind: "google-file", label: "Link to one of your Google files", severity: "medium", re: /https:\/\/(?:docs|drive)\.google\.com\/(?:spreadsheets|document|presentation|forms|file|drive\/folders)\/(?:d\/)?[A-Za-z0-9_-]{20,100}[^\s"'<>]{0,300}/g },
  { kind: "email", label: "Email address", severity: "medium", re: /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}(?![A-Za-z0-9-])/g },
  { kind: "phone", label: "Phone number", severity: "medium", re: /(?<![\w+.])\+\d{1,3}(?:[\s-]?\(?\d\)?){7,13}(?!\d)|(?<!\d)04\d{2}[\s-]?\d{3}[\s-]?\d{3}(?!\d)|(?<!\d)07\d{3}[\s-]?\d{6}(?!\d)/g, minDigits: 10 },
  { kind: "internal", label: "Address on your own network", severity: "low", re: /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b|\bhttps?:\/\/[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){0,6}\.(?:local|internal|lan)\b/gi },
];

for (const p of SECRET_PATTERNS) { p.severity = "high"; p.secret = true; }
const PATTERNS = [...SECRET_PATTERNS, ...OTHER_PATTERNS];

// Values people use as stand-ins. These are fine to share.
export function isPlaceholder(s) {
  if (typeof s !== "string") return false;
  if (SAFE_NAME_KEYWORDS.test(s.trim())) return true;
  return /PASTE|YOUR[_-]|_HERE\b|REPLACE[_-]?ME|CHANGE[_-]?ME|PLACEHOLDER|<[^>]{1,60}>|x{6}|\*{4}|\.\.\.|\{\{/i.test(s);
}

// Example domains and well-known non-personal addresses.
const SAFE_EMAIL_DOMAIN = /@(?:example\.(?:com|org|net)|[a-z0-9-]{1,63}\.example|example|your-?domain\.[a-z.]{2,10}|your-?company\.[a-z.]{2,10})$/i;
const GIT_ADDRESS = /^git@(?:github|gitlab|bitbucket)\.(?:com|org)$/i;

// Shows at most 4 characters of a secret, never more than about a quarter of it.
export function maskSecret(s) {
  const t = String(s).replace(/\s+/g, " ");
  if (t.length < 12) return `${t.slice(0, 1)}••••`;
  return `${t.slice(0, 3)}••••${t.slice(-1)}`;
}

function shorten(s, max = 80) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// Every match in one string, overlaps removed (earlier and longer wins, higher severity beats lower).
export function findInString(s) {
  if (typeof s !== "string" || s.length < 6 || s.length > MAX_SCAN_LENGTH) return [];
  const found = [];
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(s))) {
      if (m[0].length === 0) { p.re.lastIndex++; continue; }
      const value = p.group ? m[p.group] : m[0];
      if (!value) continue;
      const start = p.group ? m.index + m[0].lastIndexOf(value) : m.index;
      if (p.secret && isPlaceholder(value)) continue;
      if (p.needsDigit && !/\d/.test(value)) continue;
      if ((p.kind === "url-key" || p.kind === "inline-secret") && (/^\$|^=/.test(value) || /\s/.test(value))) continue;
      if (p.kind === "email" && (SAFE_EMAIL_DOMAIN.test(value) || GIT_ADDRESS.test(value) || isPlaceholder(value) || /\.(?:png|jpe?g|gif|svg|webp)$/i.test(value))) continue;
      if (p.kind === "phone" && value.replace(/\D/g, "").length < p.minDigits) continue;
      if (p.kind === "google-file" && isPlaceholder(value)) continue;
      found.push({ kind: p.kind, label: p.label, severity: p.severity, secret: !!p.secret, value, start, end: start + value.length });
    }
  }
  found.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start) || SEVERITY[b.severity] - SEVERITY[a.severity]);
  const kept = [];
  for (const f of found) {
    const clashes = kept.filter((k) => f.start < k.end && f.end > k.start);
    if (!clashes.length) kept.push(f);
    else if (clashes.every((k) => SEVERITY[f.severity] > SEVERITY[k.severity])) {
      for (const k of clashes) kept.splice(kept.indexOf(k), 1);
      kept.push(f);
    }
  }
  return kept.sort((a, b) => a.start - b.start);
}

// Masks any secrets inside text before it is shown on screen (node names, notes and so on).
export function redactForDisplay(text) {
  if (typeof text !== "string" || !text) return typeof text === "string" ? text : "";
  if (text.length > MAX_SCAN_LENGTH) return `${text.slice(0, 200)}… (very long text not shown)`;
  const hits = findInString(text).filter((h) => h.secret);
  let out = text;
  for (const h of hits.slice().reverse()) out = out.slice(0, h.start) + maskSecret(h.value) + out.slice(h.end);
  return out;
}

const SENSITIVE_SUFFIX = /(?:apikey|apitoken|accesstoken|authtoken|refreshtoken|clientsecret|secretkey|privatekey|accesskey|signingsecret|subscriptionkey|password|passwd|bearertoken)$/;
const SENSITIVE_EXACT = new Set(["token", "secret", "pwd", "pass", "bearer", "authorization", "key", "auth"]);

export function isSensitiveName(name) {
  if (typeof name !== "string") return false;
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!n || n.length > 60) return false;
  return SENSITIVE_EXACT.has(n) || SENSITIVE_SUFFIX.test(n);
}

// A literal (not an expression, not a placeholder, no spaces) worth treating as a secret.
export function looksLikeLiteralSecret(value) {
  if (typeof value !== "string" || value.length > 5000) return false;
  const v = value.replace(/^=/, "");
  const literal = v.replace(/\{\{[\s\S]*?\}\}/g, "").replace(/^(?:Bearer|Basic|Token)\s+/i, "").trim();
  if (literal.length < 8) return false;
  if (/\s/.test(literal)) return false;
  if (isPlaceholder(literal)) return false;
  if (/^\$(?:env|vars)\b/.test(literal)) return false;
  if (/^https?:\/\//i.test(literal)) return false;
  return true;
}

// Keys that hold n8n's own plumbing, never user content.
const SKIP_KEYS = new Set(["id", "webhookId", "versionId", "instanceId", "type", "typeVersion", "position", "__rl", "mode", "cachedResultUrl"]);

const PATH_WORDS = { headerParameters: "headers", queryParameters: "query", bodyParameters: "body", jsCode: "code", pythonCode: "code" };
const PATH_SKIP = new Set(["nodes", "parameters", "values", "assignments", "json", "options"]);

function friendlyPath(path) {
  const parts = [];
  for (const p of path) {
    if (typeof p === "number") continue;
    if (p && typeof p === "object" && typeof p.raw === "string") { parts.push(redactForDisplay(p.raw)); continue; }
    if (typeof p !== "string" || PATH_SKIP.has(p)) continue;
    const word = own(PATH_WORDS, p);
    parts.push(word || humanize(p));
  }
  return parts.slice(-3).join(" › ") || "settings";
}

const RL_THING = [
  [/document|spreadsheet|file/i, "file"], [/sheet/i, "sheet"], [/channel/i, "channel"], [/database/i, "database"],
  [/base/i, "base"], [/table/i, "table"], [/calendar/i, "calendar"], [/folder/i, "folder"], [/board/i, "board"],
  [/list/i, "list"], [/project/i, "project"], [/workflow/i, "workflow"], [/label/i, "label"], [/page/i, "page"],
  [/user/i, "user"],
];

function rlThing(key) {
  for (const [re, word] of RL_THING) if (re.test(key || "")) return word;
  return "item";
}

// n8n "resource locator" picks that point at something in the author's own account.
export function isAccountPick(obj, key) {
  if (!obj || typeof obj !== "object" || obj.__rl !== true) return false;
  if (/model/i.test(key || "")) return false;
  // A tab or item chosen by its plain name (mode "name") isn't tied to the author's account.
  if (obj.mode === "name") return false;
  const v = typeof obj.value === "string" ? obj.value : typeof obj.value === "number" ? String(obj.value) : "";
  if (!v || v.startsWith("=") || isPlaceholder(v)) return false;
  // The first tab of a sheet is "gid=0" in every file, nothing personal.
  if (/^gid=\d{1,12}$/.test(v) && !obj.cachedResultUrl) return false;
  return true;
}

// Main entry. Returns an array of findings, highest severity first.
export function scanWorkflow(wf) {
  const findings = [];
  const seen = new Set();
  const add = (f) => {
    const sig = `${f.kind}|${f.where}|${f.field}|${f.preview}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    findings.push(f);
  };
  let tooDeep = false;
  let tooLong = 0;

  const nodes = Array.isArray(wf && wf.nodes) ? wf.nodes : [];

  const fixFor = (h, key, path) => {
    if (key === "name" && path.length === 3 && path[0] === "nodes") return "Rename this node by hand. The clean copy keeps node names so links between steps don't break";
    if (h.secret) return "Replaced with a placeholder in the clean copy";
    if (h.kind === "internal") return "Check it. Anyone you share with can't reach your network";
    return "Optional: replace it in the clean copy";
  };

  // Strings anywhere in the file.
  const visit = (value, path, where, key, depth) => {
    if (depth > MAX_DEPTH) { tooDeep = true; return; }
    if (typeof value === "string") {
      if (SKIP_KEYS.has(key)) return;
      if (value.length > MAX_SCAN_LENGTH) { tooLong++; return; }
      const hits = findInString(value);
      for (const h of hits) {
        add({
          kind: h.kind,
          severity: h.severity,
          title: h.label,
          where: redactForDisplay(where),
          field: friendlyPath(path),
          preview: h.secret || h.kind === "twilio-sid" ? maskSecret(h.value) : shorten(h.value, 60),
          fix: fixFor(h, key, path),
        });
      }
      if (!hits.some((h) => h.secret) && isSensitiveName(key) && looksLikeLiteralSecret(value)) {
        add({ kind: "named-secret", severity: "high", title: `Hard-coded ${humanize(key)}`, where: redactForDisplay(where), field: friendlyPath(path), preview: maskSecret(value.replace(/^=/, "")), fix: "Replaced with a placeholder in the clean copy" });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => visit(v, [...path, i], where, key, depth + 1));
      return;
    }
    if (value && typeof value === "object") {
      if (isAccountPick(value, key)) {
        const name = typeof value.cachedResultName === "string" && value.cachedResultName ? `"${shorten(redactForDisplay(value.cachedResultName), 50)}"` : `ID ${shorten(String(value.value), 24)}`;
        add({ kind: "account-pick", severity: "medium", title: `Picks a ${rlThing(key)} in your account`, where: redactForDisplay(where), field: friendlyPath(path), preview: name, fix: "Optional: clear it in the clean copy" });
      }
      // n8n header/query/body pairs: { name: "Authorization", value: "Bearer ..." }
      const pairName = typeof value.name === "string" && value.name ? value.name : null;
      if (pairName && typeof value.value === "string" && isSensitiveName(pairName) && looksLikeLiteralSecret(value.value) && !findInString(value.value).some((h) => h.secret)) {
        add({ kind: "named-secret", severity: "high", title: `Hard-coded ${redactForDisplay(pairName)}`, where: redactForDisplay(where), field: friendlyPath([...path, { raw: pairName }]), preview: maskSecret(value.value.replace(/^=/, "")), fix: "Replaced with a placeholder in the clean copy" });
      }
      for (const k of Object.keys(value)) {
        if (k === "credentials" && path.length === 2 && path[0] === "nodes") continue;
        // For { name, value } pairs, label the value with its name (e.g. "Authorization").
        visit(value[k], k === "value" && pairName ? [...path, { raw: pairName }] : [...path, k], where, k, depth + 1);
      }
    }
  };

  nodes.forEach((n, i) => {
    if (!n || typeof n !== "object") return;
    const where = typeof n.name === "string" ? n.name : `Node ${i + 1}`;
    visit(n, ["nodes", i], where, "", 0);
    if (n.credentials && typeof n.credentials === "object") {
      for (const ctype of Object.keys(n.credentials)) {
        const c = n.credentials[ctype];
        const cname = c && typeof c.name === "string" ? c.name : humanize(ctype);
        const service = appName(ctype.replace(/(?:OAuth2Api|OAuth2|OAuthApi|Api|Auth)$/i, "")) || humanize(ctype);
        add({ kind: "credential", severity: "medium", title: "Linked to one of your saved credentials", where: redactForDisplay(where), field: `${service} login`, preview: `"${shorten(redactForDisplay(cname), 50)}"`, fix: "Removed in the clean copy (whoever imports it connects their own)" });
      }
    }
  });

  const webhookCount = nodes.filter((n) => n && typeof n.webhookId === "string").length;
  if (webhookCount) add({ kind: "webhook-id", severity: "low", title: `${webhookCount} webhook ID${webhookCount === 1 ? "" : "s"}`, where: "Workflow", field: "webhook IDs", preview: "n8n makes new ones on import", fix: "Removed in the clean copy" });

  if (wf && wf.pinData && typeof wf.pinData === "object" && Object.keys(wf.pinData).length) {
    const n = Object.keys(wf.pinData).length;
    add({ kind: "pin-data", severity: "high", title: `Pinned test data on ${n} step${n === 1 ? "" : "s"}`, where: "Workflow", field: "pinned data", preview: "Data from a real run, often names, emails or orders", fix: "Removed in the clean copy" });
    visit(wf.pinData, ["pinData"], "Pinned test data", "pinData", 0);
  }
  if (wf && wf.staticData && typeof wf.staticData === "object" && Object.keys(wf.staticData).length) {
    add({ kind: "static-data", severity: "low", title: "Saved workflow memory", where: "Workflow", field: "static data", preview: "For example the last email it processed", fix: "Removed in the clean copy" });
  }
  if (wf && wf.meta && typeof wf.meta === "object" && typeof wf.meta.instanceId === "string") {
    add({ kind: "instance-id", severity: "low", title: "Your n8n instance ID", where: "Workflow", field: "meta", preview: shorten(wf.meta.instanceId, 14), fix: "Removed in the clean copy" });
  }
  if (wf && (typeof wf.id === "string" || typeof wf.id === "number" || typeof wf.versionId === "string")) {
    add({ kind: "workflow-id", severity: "low", title: "Workflow and version IDs from your n8n", where: "Workflow", field: "id", preview: "Not secret, just tidy", fix: "Removed in the clean copy" });
  }
  if (wf && wf.settings && typeof wf.settings === "object" && (wf.settings.errorWorkflow || wf.settings.callerIds)) {
    add({ kind: "settings-id", severity: "low", title: "Links to other workflows in your n8n", where: "Workflow", field: "settings", preview: "Error workflow or allowed callers", fix: "Removed in the clean copy" });
  }
  if (wf) {
    for (const k of ["shared", "owner", "homeProject", "settings"]) if (wf[k]) visit(wf[k], [k], k === "settings" ? "Workflow settings" : "Sharing details", k, 0);
    if (typeof wf.name === "string") visit(wf.name, ["name"], "Workflow name", "workflowName", 0);
  }
  if (tooDeep) add({ kind: "too-deep", severity: "medium", title: "Some data is nested too deeply to check", where: "Workflow", field: "deeply nested data", preview: `More than ${MAX_DEPTH} levels`, fix: "Check it by hand" });
  if (tooLong) add({ kind: "too-long", severity: "medium", title: `${tooLong} very long text value${tooLong === 1 ? "" : "s"} not checked`, where: "Workflow", field: "long text", preview: "Over 200,000 characters", fix: "Check it by hand" });

  findings.sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity]);
  return findings;
}

export function summarise(findings) {
  const count = { high: 0, medium: 0, low: 0 };
  for (const f of findings) count[f.severity]++;
  let verdict = "Looks safe to share";
  if (count.high) verdict = "Don't share this yet";
  else if (count.medium) verdict = "Check these before you share";
  return { count, verdict };
}
