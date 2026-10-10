// Turns n8n node types and settings into plain English.
// Pure functions, no DOM, so they can be tested in Node.

const ACRONYMS = {
  ai: "AI", api: "API", aws: "AWS", crm: "CRM", csv: "CSV", ftp: "FTP", html: "HTML", http: "HTTP",
  id: "ID", imap: "IMAP", json: "JSON", jwt: "JWT", llm: "LLM", mcp: "MCP", pdf: "PDF", qa: "Q&A",
  rss: "RSS", s3: "S3", sftp: "SFTP", sms: "SMS", smtp: "SMTP", sql: "SQL", ssh: "SSH", url: "URL", xml: "XML",
};

// Display names for app nodes, keyed by the last part of the node type.
const APP_NAMES = {
  activeCampaign: "ActiveCampaign", airtable: "Airtable", anthropic: "Anthropic", asana: "Asana",
  awsS3: "AWS S3", awsSes: "AWS SES", baserow: "Baserow", box: "Box", brevo: "Brevo", calendly: "Calendly",
  clickUp: "ClickUp", clockify: "Clockify", discord: "Discord", dropbox: "Dropbox", facebookGraphApi: "Facebook",
  freshdesk: "Freshdesk", github: "GitHub", gitlab: "GitLab", gmail: "Gmail", googleCalendar: "Google Calendar",
  googleContacts: "Google Contacts", googleDocs: "Google Docs", googleDrive: "Google Drive",
  googleGemini: "Google Gemini", googleSheets: "Google Sheets", googleSlides: "Google Slides",
  googleTasks: "Google Tasks", hubspot: "HubSpot", intercom: "Intercom", jira: "Jira", linear: "Linear",
  linkedIn: "LinkedIn", mailchimp: "Mailchimp", mailgun: "Mailgun", mattermost: "Mattermost",
  microsoftExcel: "Microsoft Excel", microsoftOneDrive: "OneDrive", microsoftOutlook: "Outlook",
  microsoftSql: "Microsoft SQL", microsoftTeams: "Microsoft Teams", microsoftToDo: "Microsoft To Do",
  mondayCom: "monday.com", mongoDb: "MongoDB", mySql: "MySQL", nocoDb: "NocoDB", notion: "Notion",
  odoo: "Odoo", openAi: "OpenAI", perplexity: "Perplexity", pipedrive: "Pipedrive", postgres: "Postgres",
  quickbooks: "QuickBooks", redis: "Redis", salesforce: "Salesforce", sendGrid: "SendGrid",
  sendInBlue: "Brevo", shopify: "Shopify", slack: "Slack", spotify: "Spotify", stripe: "Stripe",
  supabase: "Supabase", telegram: "Telegram", todoist: "Todoist", trello: "Trello", twilio: "Twilio",
  twitter: "X (Twitter)", typeform: "Typeform", webflow: "Webflow", whatsApp: "WhatsApp",
  wooCommerce: "WooCommerce", wordpress: "WordPress", xero: "Xero", youTube: "YouTube", zendesk: "Zendesk",
  zoom: "Zoom",
};

// Known API hosts, so an HTTP Request node can say which service it talks to.
const HOST_NAMES = {
  "api.openai.com": "OpenAI", "api.anthropic.com": "Anthropic", "api.twilio.com": "Twilio",
  "api.telegram.org": "Telegram", "hooks.slack.com": "Slack", "slack.com": "Slack",
  "generativelanguage.googleapis.com": "Google Gemini", "api.stripe.com": "Stripe",
  "graph.microsoft.com": "Microsoft 365", "api.notion.com": "Notion", "api.airtable.com": "Airtable",
  "api.github.com": "GitHub", "api.hubapi.com": "HubSpot", "api.mistral.ai": "Mistral",
  "api.groq.com": "Groq", "openrouter.ai": "OpenRouter", "api.perplexity.ai": "Perplexity",
  "api.deepseek.com": "DeepSeek", "api.elevenlabs.io": "ElevenLabs", "api.sendgrid.com": "SendGrid",
  "discord.com": "Discord", "sheets.googleapis.com": "Google Sheets", "www.googleapis.com": "Google",
  "gmail.googleapis.com": "Gmail", "api.calendly.com": "Calendly", "api.cal.com": "Cal.com",
  "abr.business.gov.au": "ABN Lookup", "api.apify.com": "Apify", "api.firecrawl.dev": "Firecrawl",
  "serpapi.com": "SerpApi", "api.tavily.com": "Tavily",
};

const AI_HOSTS = new Set(["OpenAI", "Anthropic", "Google Gemini", "Mistral", "Groq", "OpenRouter", "Perplexity", "DeepSeek"]);

// Safe table lookup: ignores inherited keys such as "__proto__" or "constructor".
export function own(table, key) {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

export function humanize(word) {
  if (!word || typeof word !== "string") return "";
  const spaced = word
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return spaced
    .split(/\s+/)
    .map((w) => own(ACRONYMS, w) || w)
    .join(" ");
}

function titleCase(text) {
  return text
    .split(" ")
    .map((w) => (w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export function parseType(type) {
  const raw = typeof type === "string" ? type : "";
  const dot = raw.lastIndexOf(".");
  const pkg = dot > -1 ? raw.slice(0, dot) : "";
  const key = dot > -1 ? raw.slice(dot + 1) : raw;
  const official = pkg === "n8n-nodes-base" || pkg === "@n8n/n8n-nodes-langchain";
  return { raw, pkg, key, official, ai: pkg === "@n8n/n8n-nodes-langchain" };
}

export function appName(key) {
  const base = key.replace(/Trigger$/, "").replace(/Tool$/, "");
  if (own(APP_NAMES, base)) return own(APP_NAMES, base);
  return titleCase(humanize(base));
}

export function hostName(host) {
  if (!host) return "";
  if (own(HOST_NAMES, host)) return own(HOST_NAMES, host);
  const parts = host.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    const tail = parts.slice(i).join(".");
    if (own(HOST_NAMES, tail)) return own(HOST_NAMES, tail);
  }
  return "";
}

// Pulls a host out of a URL or the literal start of an n8n expression.
export function urlHost(value) {
  if (typeof value !== "string") return "";
  const text = value.replace(/^=/, "").trim();
  const m = text.match(/^https?:\/\/([^/?#:\s{}]+)/i);
  return m ? m[1].toLowerCase() : "";
}

function str(v) {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && typeof v.value === "string") return v.value;
  return "";
}

function params(node) {
  const p = node && node.parameters;
  return p && typeof p === "object" && !Array.isArray(p) ? p : {};
}

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d{1,9}$/.test(v) ? Number(v) : null;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function listNames(names, max = 5) {
  const clean = names.filter(Boolean);
  if (clean.length <= max) return clean.join(", ");
  return `${clean.slice(0, max).join(", ")} and ${clean.length - max} more`;
}

function scheduleText(p) {
  const rule = p && p.rule && Array.isArray(p.rule.interval) ? p.rule.interval : null;
  if (!rule || !rule.length) return "on a schedule";
  const parts = rule.filter((r) => r && typeof r === "object").map((r) => {
    const field = typeof r.field === "string" ? r.field : "days";
    if (field === "cronExpression") return "on a cron schedule";
    const raw = r[`${field}Interval`];
    const every = typeof raw === "number" && raw > 0 ? raw : 1;
    const unit = field.replace(/s$/, "");
    let text = every === 1 ? `every ${unit}` : `every ${every} ${unit}s`;
    if (typeof r.triggerAtHour === "number") text += ` at ${String(r.triggerAtHour).padStart(2, "0")}:00`;
    return text;
  });
  return parts.length ? parts.join(" and ") : "on a schedule";
}

const TRIGGER_KEYS = new Set([
  "webhook", "formTrigger", "manualTrigger", "scheduleTrigger", "cron", "interval", "chatTrigger",
  "executeWorkflowTrigger", "errorTrigger", "emailReadImap", "start", "n8nTrigger", "mcpTrigger",
]);

export function isTriggerType(type) {
  const { key } = parseType(type);
  return TRIGGER_KEYS.has(key) || /Trigger$/.test(key);
}

export function isStickyNote(node) {
  return parseType(node && node.type).key === "stickyNote";
}

// Core and AI nodes: key -> function(params, node) returning a sentence.
const CORE = {
  manualTrigger: () => "Starts when you click Test workflow in n8n",
  start: () => "Starts when you run the workflow by hand",
  scheduleTrigger: (p) => `Starts ${scheduleText(p)}`,
  cron: () => "Starts on a schedule",
  interval: () => "Starts on a repeating timer",
  webhook: (p) => {
    const method = String(typeof p.httpMethod === "string" ? p.httpMethod : "GET").toUpperCase();
    const path = typeof p.path === "string" && !p.path.includes("{{") ? ` at /${p.path.replace(/^\//, "")}` : "";
    return `Starts when a ${method} request arrives at a webhook${path}`;
  },
  formTrigger: (p) => (str(p.formTitle) ? `Starts when someone submits the form "${str(p.formTitle)}"` : "Starts when someone submits an n8n form"),
  chatTrigger: () => "Starts when a chat message comes in",
  mcpTrigger: () => "Starts when an AI app calls it as an MCP server",
  executeWorkflowTrigger: () => "Starts when another workflow calls it",
  errorTrigger: () => "Starts when another workflow fails",
  n8nTrigger: () => "Starts when something happens in n8n itself",
  emailReadImap: () => "Starts when a new email arrives in an IMAP inbox",
  gmailTrigger: () => "Starts when a new email arrives in Gmail",
  set: (p) => {
    const a = p.assignments && Array.isArray(p.assignments.assignments) ? p.assignments.assignments : [];
    const names = a.map((x) => x && x.name).filter((n) => typeof n === "string");
    if (names.length) return `Sets ${plural(names.length, "field")}: ${listNames(names)}`;
    if (p.mode === "raw") return "Sets fields from a JSON block";
    return "Sets or edits fields";
  },
  if: () => "Checks a condition and splits into Yes and No paths",
  filter: () => "Keeps only the items that match a condition",
  switch: (p, node) => {
    const n = switchOutputs(node).length;
    return n ? `Sends each item down one of ${n} paths by rules` : "Sends items down different paths by rules";
  },
  merge: () => "Joins two streams of items together",
  code: (p) => {
    const lang = p.language === "python" || p.language === "pythonNative" ? "Python" : "JavaScript";
    const src = typeof p.pythonCode === "string" && lang === "Python" ? p.pythonCode : typeof p.jsCode === "string" ? p.jsCode : "";
    const lines = src ? src.split("\n").length : 0;
    return `Runs custom ${lang} code${lines ? ` (${plural(lines, "line")})` : ""}`;
  },
  function: () => "Runs custom JavaScript (older Function node)",
  functionItem: () => "Runs custom JavaScript on each item (older Function Item node)",
  httpRequest: (p) => {
    const method = String(typeof p.method === "string" ? p.method : typeof p.requestMethod === "string" ? p.requestMethod : "GET").toUpperCase();
    const host = urlHost(str(p.url));
    if (!host) return `Calls a web address (${method}) set by an expression`;
    const name = hostName(host);
    return `Calls ${method} ${host}${name ? ` (${name})` : ""}`;
  },
  wait: (p) => (num(p.amount) ? `Waits ${num(p.amount)} ${typeof p.unit === "string" ? p.unit : "seconds"} before carrying on` : "Waits before carrying on"),
  noOp: () => "Does nothing (a placeholder or the end of a branch)",
  splitInBatches: (p) => `Loops over items in batches${num(p.batchSize) ? ` of ${num(p.batchSize)}` : ""}`,
  splitOut: () => "Splits a list into separate items",
  aggregate: () => "Combines many items into one",
  sort: () => "Sorts the items",
  limit: (p) => { const n = num(p.maxItems) || 1; return `Keeps only the first ${n} item${n === 1 ? "" : "s"}`; },
  removeDuplicates: () => "Removes duplicate items",
  summarize: () => "Summarises items, like a pivot table",
  dateTime: () => "Works with dates and times",
  crypto: () => "Hashes, signs or encrypts a value",
  html: () => "Reads or builds HTML",
  xml: () => "Converts between XML and JSON",
  markdown: () => "Converts between Markdown and HTML",
  compression: () => "Zips or unzips files",
  respondToWebhook: () => "Sends the reply back to whoever called the webhook",
  executeWorkflow: () => "Runs another workflow",
  stopAndError: () => "Stops the workflow with an error",
  extractFromFile: () => "Reads data out of a file",
  convertToFile: () => "Turns data into a file",
  readWriteFile: () => "Reads or writes a file on the n8n server",
  readBinaryFile: () => "Reads a file from the n8n server",
  writeBinaryFile: () => "Writes a file to the n8n server",
  emailSend: () => "Sends an email over SMTP",
  executeCommand: () => "Runs a command on the n8n server",
  ssh: () => "Runs a command on another server over SSH",
  ftp: () => "Moves files over FTP or SFTP",
  n8n: () => "Manages n8n itself (workflows, executions, credentials)",
  form: () => "Shows the next page of an n8n form",
  renameKeys: () => "Renames fields",
  itemLists: () => "Splits, sorts or limits lists of items",
  rssFeedRead: () => "Reads an RSS feed",
  dataTable: () => "Reads or writes an n8n data table",
  // AI (LangChain) nodes
  agent: () => "AI agent that decides which tools to use",
  chainLlm: () => "Asks an AI model a question",
  chainSummarization: () => "Summarises text with AI",
  chainRetrievalQa: () => "Answers questions from your documents with AI",
  informationExtractor: () => "Pulls structured details out of text with AI",
  textClassifier: () => "Sorts text into categories with AI",
  sentimentAnalysis: () => "Rates the mood of text with AI",
  memoryBufferWindow: () => "Remembers the last few messages",
  memoryPostgresChat: () => "Remembers the chat in Postgres",
  memoryRedisChat: () => "Remembers the chat in Redis",
  outputParserStructured: () => "Makes the AI answer in a fixed format",
  outputParserAutofixing: () => "Fixes AI answers that come back in the wrong format",
  documentDefaultDataLoader: () => "Loads documents for the AI",
  toolCode: () => "Tool the AI can use: run code",
  toolWorkflow: () => "Tool the AI can use: run another workflow",
  toolHttpRequest: () => "Tool the AI can use: call a web address",
  mcpClientTool: () => "Tool the AI can use: an MCP server",
  toolCalculator: () => "Tool the AI can use: a calculator",
  toolWikipedia: () => "Tool the AI can use: search Wikipedia",
  toolSerpApi: () => "Tool the AI can use: Google search (SerpApi)",
  toolThink: () => "Tool the AI can use: think step by step",
};


const VENDORS = {
  OpenAi: "OpenAI", AzureOpenAi: "Azure OpenAI", Anthropic: "Anthropic", GoogleGemini: "Google Gemini",
  GoogleVertex: "Google Vertex AI", GooglePalm: "Google PaLM", Ollama: "Ollama", MistralCloud: "Mistral", Groq: "Groq",
  DeepSeek: "DeepSeek", OpenRouter: "OpenRouter", XAiGrok: "xAI Grok", AwsBedrock: "AWS Bedrock", Cohere: "Cohere",
  HuggingFaceInference: "Hugging Face", HuggingFace: "Hugging Face", Pinecone: "Pinecone", Qdrant: "Qdrant",
  Supabase: "Supabase", InMemory: "in-memory", PGVector: "Postgres pgvector", MongoDBAtlas: "MongoDB Atlas",
  Zep: "Zep", Weaviate: "Weaviate", Milvus: "Milvus", Vercel: "Vercel AI Gateway", Perplexity: "Perplexity",
};

function vendorName(raw) {
  if (!raw) return "";
  return own(VENDORS, raw) || titleCase(humanize(raw));
}

function modelName(p) {
  const m = p.model;
  if (typeof m === "string") return m;
  if (m && typeof m === "object") return str(m) || m.cachedResultName || "";
  return p.modelName || "";
}

function aiNodeText(key, p) {
  if (/^lmChat/.test(key) || /^lm[A-Z]/.test(key)) {
    const vendor = vendorName(key.replace(/^lmChat|^lm/, ""));
    const model = modelName(p);
    return `${vendor} chat model${model ? ` (${model})` : ""}`;
  }
  if (/^embeddings/.test(key)) return `Turns text into embeddings (${vendorName(key.replace(/^embeddings/, ""))})`;
  if (/^vectorStore/.test(key)) return `Searchable store of documents (${vendorName(key.replace(/^vectorStore/, ""))})`;
  if (/^textSplitter/.test(key)) return "Splits text into chunks for the AI";
  if (/Tool$/.test(key) || /^tool/.test(key)) return `Tool the AI can use: ${appName(key.replace(/^tool/, ""))}`;
  return "";
}

export function switchOutputs(node) {
  const p = params(node);
  const values = p.rules && Array.isArray(p.rules.values) ? p.rules.values : p.rules && Array.isArray(p.rules.rules) ? p.rules.rules : [];
  const labels = values.map((v, i) => (v && typeof v.outputKey === "string" && v.outputKey ? v.outputKey : `Path ${i + 1}`));
  if (p.options && (p.options.fallbackOutput === "extra" || p.options.fallbackOutput === 3)) labels.push("Fallback");
  return labels;
}

const OP_WORDS = {
  getAll: "get many", get: "get", create: "create", update: "update", delete: "delete", send: "send",
  append: "append", appendOrUpdate: "append or update", upsert: "create or update", search: "search",
  reply: "reply to", addLabels: "add labels to", removeLabels: "remove labels from", markAsRead: "mark as read",
  markAsUnread: "mark as unread", post: "post", postMessage: "post", upload: "upload", download: "download",
  move: "move", copy: "copy", share: "share", execute: "run", lookup: "look up", read: "read",
  clear: "clear", sendAndWait: "send and wait for a reply to",
};

const DEFAULT_RESOURCE = { gmail: "an email", slack: "message", telegram: "message", googleDrive: "file", microsoftOutlook: "message", discord: "message" };

function appActionText(key, p) {
  const name = appName(key);
  const op = typeof p.operation === "string" ? p.operation : "";
  const res = typeof p.resource === "string" ? p.resource : "";
  if (key === "googleSheets") {
    if (/appendOrUpdate/.test(op)) return `${name}: add or update a row`;
    if (/append/.test(op)) return `${name}: add a row`;
    if (/update/.test(op)) return `${name}: update a row`;
    if (/delete/.test(op)) return `${name}: delete rows`;
    if (/read|get|lookup/.test(op)) return `${name}: read rows`;
    if (/clear/.test(op)) return `${name}: clear a sheet`;
    if (/create/.test(op)) return `${name}: create a sheet`;
  }
  if (key === "gmail" && !op && (p.sendTo || p.toList)) return `${name}: send an email`;
  if (key === "gmail" && res === "draft" && (!op || op === "create")) return `${name}: save a draft`;
  if (key === "twilio" && !op && (p.to || p.message)) return `${name}: send a text message`;
  if (key === "slack" && !op && p.text) return `${name}: post a message`;
  if (key === "telegram" && !op && p.text) return `${name}: send a message`;
  if (!op && !res) return `Uses ${name}`;
  const verb = own(OP_WORDS, op) || humanize(op);
  let noun = res ? humanize(res) : own(DEFAULT_RESOURCE, key) || "";
  if (key === "gmail" && noun === "message") noun = "an email";
  if (/ (?:to|from)$/.test(verb) && noun && !/^(?:an?|the) /.test(noun)) noun = `a ${noun}`;
  return `${name}: ${[verb, noun].filter(Boolean).join(" ")}`.trim();
}

// Main entry: describe one node in plain English.
export function describeNode(node) {
  const t = parseType(node && node.type);
  const p = params(node);
  const trigger = isTriggerType(t.raw);
  let text = "";
  if (own(CORE, t.key)) text = own(CORE, t.key)(p, node);
  else if (t.ai) text = aiNodeText(t.key, p) || `Uses ${appName(t.key)}`;
  else if (trigger) {
    const event = typeof p.event === "string" ? humanize(p.event) : Array.isArray(p.events) && p.events.length ? listNames(p.events.map(humanize), 3) : Array.isArray(p.updates) && p.updates.length ? listNames(p.updates.map(humanize), 3) : "";
    text = `Starts when something happens in ${appName(t.key)}${event ? ` (${event})` : ""}`;
  } else text = appActionText(t.key, p);
  if (t.key === "openAi" && !t.ai) {
    const op = humanize(p.operation || "");
    text = `OpenAI${op ? `: ${op}` : ""}${modelName(p) ? ` (${modelName(p)})` : ""}`;
  }
  if (!t.official && t.pkg) text += " (community node)";
  const aiHost = (t.key === "httpRequest") && AI_HOSTS.has(hostName(urlHost(str(p.url))));
  return { text, trigger, app: appFor(node), ai: t.ai || t.key === "openAi" || aiHost, code: ["code", "function", "functionItem", "executeCommand", "ssh"].includes(t.key) };
}

// Which outside service a node talks to, if any (for the overview).
export function appFor(node) {
  const t = parseType(node && node.type);
  const p = params(node);
  if (t.key === "httpRequest" || t.key === "toolHttpRequest" || t.key === "httpRequestTool") {
    return hostName(urlHost(str(p.url))) || "";
  }
  if (own(CORE, t.key) && !/Trigger$/.test(t.key)) {
    if (t.key === "gmailTrigger") return "Gmail";
    if (t.key === "emailSend") return "Email (SMTP)";
    return "";
  }
  if (t.ai) {
    if (/^lmChat|^lm[A-Z]|^embeddings|^vectorStore/.test(t.key)) {
      const name = vendorName(t.key.replace(/^lmChat|^lm|^embeddings|^vectorStore/, ""));
      return name === "in-memory" ? "" : name;
    }
    if (t.key === "openAi") return "OpenAI";
    return "";
  }
  if (TRIGGER_KEYS.has(t.key)) return "";
  return appName(t.key);
}
