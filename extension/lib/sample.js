// A made-up workflow for the "Try a sample" button.
// Every key, email and number in it is fake. The key-like strings are joined at runtime
// so no real-looking secret sits in the source code.
const j = (...parts) => parts.join("");

export function buildSample() {
  const fakeOpenAiKey = j("sk-", "proj-", "DEMOonlyNOTaREALkey", "1234567890abcd");
  const fakeTelegram = j("700000000", ":", "AAFakeTokenForTheDemoOnly1234567890");
  return {
    name: "Lead follow-up (sample)",
    id: "q1W2e3R4t5Y6u7I8",
    versionId: "3f6c2a9e-1b7d-4e2a-9c51-0d8e7f6a5b4c",
    active: true,
    meta: { instanceId: "8a1f0c3b5d7e9f2a4c6e8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a" },
    pinData: {
      "New lead": [{ json: { body: { name: "Sam Taylor", email: "sam.taylor@harbour-plumbing.test", phone: "+61 491 570 156", message: "Can you quote a hot water system?" } } }],
    },
    nodes: [
      { id: "b1", name: "New lead", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [0, 300], webhookId: "c0ffee00-1111-2222-3333-444455556666", parameters: { httpMethod: "POST", path: "new-lead" } },
      { id: "b2", name: "Settings", type: "n8n-nodes-base.set", typeVersion: 3.4, position: [220, 300], parameters: { assignments: { assignments: [
        { id: "s1", name: "ownerEmail", value: "jane@harbour-plumbing.test", type: "string" },
        { id: "s2", name: "bookingLink", value: "https://example.com/book", type: "string" },
        { id: "s3", name: "telegramToken", value: fakeTelegram, type: "string" },
      ] }, options: {} } },
      { id: "b3", name: "Score the lead (OpenAI)", type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [440, 300], parameters: {
        method: "POST", url: "https://api.openai.com/v1/chat/completions", sendHeaders: true,
        headerParameters: { parameters: [{ name: "Authorization", value: `=Bearer ${fakeOpenAiKey}` }] },
        sendBody: true, specifyBody: "json", jsonBody: "={ \"model\": \"gpt-4o-mini\" }", options: {},
      } },
      { id: "b4", name: "Good fit?", type: "n8n-nodes-base.if", typeVersion: 2.2, position: [660, 300], parameters: { conditions: { conditions: [{ leftValue: "={{ $json.score }}", rightValue: 7, operator: { type: "number", operation: "gte" } }] }, options: {} } },
      { id: "b5", name: "Write a reply", type: "@n8n/n8n-nodes-langchain.agent", typeVersion: 1.7, position: [880, 180], parameters: { promptType: "define", text: "=Write a short, friendly reply to {{ $json.name }}" } },
      { id: "b6", name: "OpenAI model", type: "@n8n/n8n-nodes-langchain.lmChatOpenAi", typeVersion: 1.2, position: [860, 400], credentials: { openAiApi: { id: "Xc9Vb8Nm7", name: "Jane's OpenAI" } }, parameters: { model: { __rl: true, value: "gpt-4o-mini", mode: "list" }, options: {} } },
      { id: "b7", name: "Send the reply", type: "n8n-nodes-base.gmail", typeVersion: 2.1, position: [1100, 180], webhookId: "a1b2c3d4-0000-1111-2222-333344445555", credentials: { gmailOAuth2: { id: "Gm4Il5Cr3d", name: "jane@harbour-plumbing.test" } }, parameters: { sendTo: "={{ $('New lead').item.json.body.email }}", subject: "Thanks for getting in touch", message: "={{ $json.output }}", options: {} } },
      { id: "b8", name: "Log the lead", type: "n8n-nodes-base.googleSheets", typeVersion: 4.5, position: [1320, 300], credentials: { googleSheetsOAuth2Api: { id: "Gs6Cr3d7", name: "Harbour Plumbing Google" } }, parameters: {
        operation: "append",
        documentId: { __rl: true, value: "1Q2w3E4r5T6y7U8i9O0pAsDfGhJkLzXcVbNm123456", mode: "list", cachedResultName: "Leads 2026" },
        sheetName: { __rl: true, value: "gid=0", mode: "list", cachedResultName: "Sheet1" },
        columns: { mappingMode: "autoMapInputData", value: {} }, options: {},
      } },
      { id: "b9", name: "Note", type: "n8n-nodes-base.stickyNote", typeVersion: 1, position: [-40, 60], parameters: { content: "## Lead follow-up\nScores each new lead with OpenAI, replies to good fits by email and logs everything to a Google Sheet.", width: 420, height: 180 } },
    ],
    connections: {
      "New lead": { main: [[{ node: "Settings", type: "main", index: 0 }]] },
      Settings: { main: [[{ node: "Score the lead (OpenAI)", type: "main", index: 0 }]] },
      "Score the lead (OpenAI)": { main: [[{ node: "Good fit?", type: "main", index: 0 }]] },
      "Good fit?": { main: [[{ node: "Write a reply", type: "main", index: 0 }], [{ node: "Log the lead", type: "main", index: 0 }]] },
      "Write a reply": { main: [[{ node: "Send the reply", type: "main", index: 0 }]] },
      "OpenAI model": { ai_languageModel: [[{ node: "Write a reply", type: "ai_languageModel", index: 0 }]] },
      "Send the reply": { main: [[{ node: "Log the lead", type: "main", index: 0 }]] },
    },
    staticData: null,
  };
}
