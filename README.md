# Workflow Inspector for n8n

A Chrome extension that explains any n8n workflow in plain English and checks it for secrets before you share it.

![Step-by-step walkthrough](store/screenshot-1-walkthrough.png)

## What it does

Open a workflow file you downloaded from n8n, or paste the JSON you copied from the canvas, and you get:

- **Overview.** What starts it, which apps and services it uses, how many AI and custom-code steps it has, and where it sends data.
- **Step by step.** A plain-English walkthrough that follows the connections from each starting step, including Yes and No branches, switch paths, loops, and the models, memory and tools attached to AI agents. Nodes that aren't connected to anything are listed separately, and sticky notes are shown at the end.
- **Safety check.** Flags what you shouldn't share, sorted into "remove", "check" and "tidy up":
  - API keys and tokens: OpenAI-style `sk-` keys, Anthropic, OpenRouter, Stripe (secret keys and webhook secrets), GitHub, Slack (tokens and webhook addresses), Discord webhooks, Google (API keys and OAuth client secrets), AWS, Telegram bots, SendGrid, Twilio, Airtable, Notion, Hugging Face, Mailchimp, JWTs and bearer tokens
  - Keys and passwords inside web addresses (for example `?api_key=…` or `postgres://user:pass@host`), private keys, hard-coded values in code or JSON (`const API_KEY = "…"`, `"password": "…"`), and literal values in fields or headers named things like `apiKey`, `apiToken`, `password` or `Authorization`
  - Links to your saved n8n credentials, pinned test data, and saved workflow memory
  - Email addresses, phone numbers, Google file links, and sheets, channels or databases picked from your account
  - Addresses on your own network (`localhost`, `192.168.x.x` and similar), webhook IDs, your n8n instance ID, workflow IDs, and links to other workflows in your n8n
- **Clean copy.** One click replaces the keys and passwords it finds with placeholders such as `PASTE_YOUR_ANTHROPIC_API_KEY_HERE`, and removes links to saved credentials, pinned test data, and n8n instance, workflow and webhook IDs. Optional switches also replace emails and phone numbers and clear account picks. Node names and connections are left alone, so the copy imports straight back into n8n (a secret inside a node name has to be renamed by hand). The clean copy is checked again and anything left is listed for you to look at.

Any secret the check finds is masked wherever it appears on screen, including node names and sticky notes. At most four characters are shown.

![Safety check](store/screenshot-2-safety-check.png)

## Private by design

- No permissions. The extension can't read the websites you visit, your tabs or your history.
- No network requests, no analytics, no storage. Your workflow is read in memory inside the extension's own page.
- Text from the workflow is always inserted as plain text, never as HTML.

See [PRIVACY.md](PRIVACY.md).

## Install

- **Chrome Web Store:** link coming once it's approved.
- **From this repo:** download or clone it, open `chrome://extensions`, switch on Developer mode, click **Load unpacked** and choose the `extension` folder. The packaged zip that goes to the Chrome Web Store is in `release/`.

Click the toolbar button to open the inspector. **Try a sample workflow** loads a made-up example (every key, email and number in it is fake).

## How it's built

Plain JavaScript modules, no build step, no dependencies.

| File | Job |
| --- | --- |
| `extension/lib/nodes.js` | Turns node types and settings into plain English |
| `extension/lib/walk.js` | Follows the connections and orders the steps |
| `extension/lib/scan.js` | The safety check |
| `extension/lib/clean.js` | Builds the clean copy |
| `extension/inspector.*` | The page you see |

## Tests

```
node test/planted.mjs      # builds a workflow full of fake secrets and checks every one is found and cleaned
node test/edge.mjs         # junk input, loops, wrappers, node wording, 3,000-node speed test
node test/run.mjs test/speed-to-lead.json   # prints the walkthrough and findings for a real template
python3 test/browser_test.py                # loads the extension in Chromium and tests the page end to end
```

The fake secrets in the tests are assembled at runtime from pieces, so no real-looking key is stored in the repo.

## Limits

The safety check looks for common formats. It can't promise to catch everything (a password in a field called `foo` won't be spotted), so give the file a final look before you share it. Text values over 200,000 characters, and data nested more than 120 levels deep, are reported as "not checked" rather than scanned.

## Licence

MIT. Made by [Jon Baynham](https://baynhams.dev). Not affiliated with or endorsed by n8n GmbH. n8n is a trademark of n8n GmbH.
