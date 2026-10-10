// Builds a share-ready copy of a workflow. Never changes the original object.
import { findInString, isSensitiveName, looksLikeLiteralSecret, isAccountPick, MAX_DEPTH } from "./scan.js";
import { own } from "./nodes.js";

const SECRET_PLACEHOLDER = {
  "private-key": "PASTE_YOUR_PRIVATE_KEY_HERE",
  anthropic: "PASTE_YOUR_ANTHROPIC_API_KEY_HERE",
  openrouter: "PASTE_YOUR_OPENROUTER_API_KEY_HERE",
  openai: "PASTE_YOUR_API_KEY_HERE",
  stripe: "PASTE_YOUR_STRIPE_KEY_HERE",
  "stripe-webhook": "PASTE_YOUR_STRIPE_WEBHOOK_SECRET_HERE",
  github: "PASTE_YOUR_GITHUB_TOKEN_HERE",
  "slack-token": "PASTE_YOUR_SLACK_TOKEN_HERE",
  "slack-webhook": "https://hooks.slack.com/services/PASTE_YOUR_WEBHOOK_HERE",
  "discord-webhook": "https://discord.com/api/webhooks/PASTE_YOUR_WEBHOOK_HERE",
  "google-key": "PASTE_YOUR_GOOGLE_API_KEY_HERE",
  "google-oauth": "PASTE_YOUR_GOOGLE_CLIENT_SECRET_HERE",
  "aws-key": "PASTE_YOUR_AWS_ACCESS_KEY_HERE",
  "telegram-token": "PASTE_YOUR_TELEGRAM_BOT_TOKEN_HERE",
  sendgrid: "PASTE_YOUR_SENDGRID_KEY_HERE",
  "twilio-key": "PASTE_YOUR_TWILIO_KEY_HERE",
  airtable: "PASTE_YOUR_AIRTABLE_TOKEN_HERE",
  notion: "PASTE_YOUR_NOTION_SECRET_HERE",
  huggingface: "PASTE_YOUR_HUGGING_FACE_TOKEN_HERE",
  mailchimp: "PASTE_YOUR_MAILCHIMP_KEY_HERE",
  jwt: "PASTE_YOUR_TOKEN_HERE",
  bearer: "PASTE_YOUR_TOKEN_HERE",
  "url-password": "PASTE_YOUR_PASSWORD_HERE",
  "url-key": "PASTE_YOUR_KEY_HERE",
  "inline-secret": "PASTE_YOUR_SECRET_HERE",
};

export const DEFAULT_OPTIONS = { emails: false, phones: false, picks: false };

// Node fields that are n8n plumbing, or that must not change.
const NODE_KEEP = new Set(["id", "name", "type", "typeVersion", "position", "disabled", "credentials", "webhookId", "alwaysOutputData", "executeOnce", "retryOnFail", "maxTries", "waitBetweenTries", "onError", "continueOnFail"]);
const PLUMBING = new Set(["id", "webhookId", "versionId", "instanceId", "type", "typeVersion", "position"]);

function placeholderFor(hit, options) {
  if (hit.secret) return own(SECRET_PLACEHOLDER, hit.kind) || "PASTE_YOUR_SECRET_HERE";
  if (hit.kind === "email" && options.emails) return "you@example.com";
  if (hit.kind === "phone" && options.phones) return "PASTE_PHONE_NUMBER_HERE";
  if (hit.kind === "twilio-sid" && options.picks) return "PASTE_YOUR_TWILIO_ACCOUNT_SID_HERE";
  if (hit.kind === "google-file" && options.picks) return "https://docs.google.com/spreadsheets/d/PASTE_YOUR_FILE_ID_HERE";
  return null;
}

function namedPlaceholder(name) {
  const slug = String(name).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").toUpperCase().slice(0, 40) || "SECRET";
  return `PASTE_YOUR_${slug}_HERE`;
}

// Keeps "Bearer ", "Basic " or "Token " in front of a replaced header value.
function withPrefix(original, placeholder) {
  const m = String(original).match(/^=?\s*(Bearer|Basic|Token)\s+/i);
  return m ? `${m[1]} ${placeholder}` : placeholder;
}

export function cleanWorkflow(original, opts = {}) {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const wf = JSON.parse(JSON.stringify(original));
  const tally = {};
  const bump = (k, n = 1) => { tally[k] = (tally[k] || 0) + n; };

  const fixString = (s, key) => {
    if (PLUMBING.has(key)) return s;
    const hits = findInString(s);
    let out = s;
    let changed = false;
    // Replace from the end so earlier offsets stay valid.
    for (const h of hits.slice().sort((a, b) => b.start - a.start)) {
      const rep = placeholderFor(h, options);
      if (rep == null) continue;
      out = out.slice(0, h.start) + rep + out.slice(h.end);
      changed = true;
      bump(h.secret ? "secrets" : h.kind);
    }
    if (!hits.some((h) => h.secret) && isSensitiveName(key) && looksLikeLiteralSecret(out)) {
      bump("secrets");
      return withPrefix(out, namedPlaceholder(key));
    }
    return changed ? out : s;
  };

  const walk = (value, key, depth) => {
    if (depth > MAX_DEPTH) return value;
    if (typeof value === "string") return fixString(value, key);
    if (Array.isArray(value)) return value.map((v) => walk(v, key, depth + 1));
    if (value && typeof value === "object") {
      if (options.picks && isAccountPick(value, key)) {
        bump("picks");
        return { __rl: true, mode: "list", value: "" };
      }
      const pairSecret = typeof value.name === "string" && typeof value.value === "string" && isSensitiveName(value.name) && looksLikeLiteralSecret(value.value) && !findInString(value.value).some((h) => h.secret);
      // fromEntries keeps odd keys such as "__proto__" as plain data.
      const next = Object.fromEntries(Object.keys(value).map((k) => [k, walk(value[k], k, depth + 1)]));
      if (pairSecret) {
        next.value = withPrefix(value.value, namedPlaceholder(value.name));
        bump("secrets");
      }
      return next;
    }
    return value;
  };

  if (Array.isArray(wf.nodes)) {
    wf.nodes = wf.nodes.map((n) => {
      if (!n || typeof n !== "object" || Array.isArray(n)) return n;
      const node = Object.fromEntries(Object.keys(n).map((k) => [k, NODE_KEEP.has(k) ? n[k] : walk(n[k], k, 1)]));
      if (node.credentials) { delete node.credentials; bump("credentials"); }
      if (node.webhookId) { delete node.webhookId; bump("webhookIds"); }
      // Node names are left alone: connections and expressions refer to them, so renaming would break the workflow.
      return node;
    });
  }

  if (typeof wf.name === "string") wf.name = fixString(wf.name, "workflowName");
  if (wf.pinData && typeof wf.pinData === "object" && Object.keys(wf.pinData).length) bump("pinData");
  delete wf.pinData;
  if (wf.staticData && typeof wf.staticData === "object" && Object.keys(wf.staticData).length) bump("staticData");
  delete wf.staticData;
  if (wf.id != null || wf.versionId != null) bump("ids");
  for (const k of ["id", "versionId", "shared", "owner", "triggerCount", "createdAt", "updatedAt", "isArchived", "homeProject", "scopes", "tags", "usedCredentials", "sharedWithProjects"]) delete wf[k];
  if (wf.settings && typeof wf.settings === "object" && !Array.isArray(wf.settings)) {
    if (wf.settings.errorWorkflow || wf.settings.callerIds) bump("settingsIds");
    const { errorWorkflow, callerIds, ...rest } = wf.settings;
    wf.settings = walk(rest, "settings", 1);
  }
  if (wf.meta && wf.meta.instanceId) bump("instanceId");
  wf.meta = { templateCredsSetupCompleted: false };
  if (wf.active) wf.active = false;

  const changes = [];
  const say = (k, one, many) => { if (tally[k]) changes.push(tally[k] === 1 ? one : many.replace("{n}", tally[k])); };
  say("secrets", "Replaced 1 secret with a placeholder", "Replaced {n} secrets with placeholders");
  say("credentials", "Removed 1 link to a saved credential", "Removed {n} links to saved credentials");
  say("pinData", "Removed pinned test data", "Removed pinned test data");
  say("picks", "Cleared 1 pick from your account (sheet, channel or similar)", "Cleared {n} picks from your account (sheets, channels or similar)");
  say("email", "Replaced 1 email address", "Replaced {n} email addresses");
  say("phone", "Replaced 1 phone number", "Replaced {n} phone numbers");
  say("google-file", "Replaced 1 Google file link", "Replaced {n} Google file links");
  say("twilio-sid", "Replaced 1 Twilio account ID", "Replaced {n} Twilio account IDs");
  say("webhookIds", "Removed 1 webhook ID", "Removed {n} webhook IDs");
  say("staticData", "Removed saved workflow memory", "Removed saved workflow memory");
  say("instanceId", "Removed your n8n instance ID", "Removed your n8n instance ID");
  say("ids", "Removed the workflow and version IDs", "Removed the workflow and version IDs");
  say("settingsIds", "Removed links to other workflows in your n8n", "Removed links to other workflows in your n8n");
  if (!changes.length) changes.push("Nothing needed changing");

  return { workflow: wf, changes };
}
