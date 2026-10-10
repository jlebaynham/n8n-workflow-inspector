# Chrome Web Store listing: Workflow Inspector for n8n

## Store listing tab

Note: the first submission (10 Oct 2026) was rejected for "keyword spam" (violation reference Yellow Argon) because the description listed 16 service names. Keep brand names out of the description.

**Name** (from the manifest): Workflow Inspector for n8n

**Summary** (from the manifest, 116 of 132 characters):
Explains any n8n workflow in plain English and checks it for API keys, personal details and IDs before you share it.

**Category:** Developer Tools
**Language:** English

**Description:**

Workflow Inspector explains any n8n workflow in plain English and checks it for secrets before you share it.

Drop in a workflow file, or paste the JSON, and you get:

• An overview: what starts it, which apps and services it uses, how many AI and custom-code steps it has, and where it sends data.
• A step-by-step walkthrough in plain English that follows the connections from each starting step, including Yes and No branches, switch paths, and the models, memory and tools attached to AI agents.
• A safety check that flags API keys, access tokens, passwords and private keys (including ones hidden in web addresses or code), links to your saved credentials, pinned test data, email addresses, phone numbers, sheets and channels picked from your account, and n8n IDs.
• A clean copy: one click replaces the keys and passwords it finds with placeholders and removes credential links, pinned data and n8n IDs, with options to also replace emails, phone numbers and account picks. Download it, or copy it straight back into n8n.

Private by design
Everything runs inside the extension's own page. It asks for no permissions, can't read the websites you visit, makes no network requests and stores nothing. Your workflow never leaves your computer, and any secret it finds is masked on screen.

Who it's for
• Template creators checking a workflow before publishing it to the n8n template library or a marketplace
• Freelancers and agencies handing workflows over to clients
• Anyone given a workflow who wants to know what it does before importing it

The safety check looks for common formats. It can't promise to catch everything, so give the file a final look before you share it.

Made by Jon Baynham (baynhams.dev). Not affiliated with or endorsed by n8n GmbH. n8n is a trademark of n8n GmbH.

**Graphics:**
- Store icon: extension/icons/icon-128.png
- Screenshots (1280 x 800): store/screenshot-1-walkthrough.png, store/screenshot-2-safety-check.png, store/screenshot-3-clean-copy.png, store/screenshot-4-dark.png
- Small promo tile (440 x 280): store/promo-tile-440x280.png

**Official URL:** none (needs Search Console verification, skip)
**Homepage URL:** https://github.com/jlebaynham/n8n-workflow-inspector
**Support URL:** https://github.com/jlebaynham/n8n-workflow-inspector/issues

## Privacy tab

**Single purpose:**
Explains n8n workflow files in plain English and checks them for secrets and personal details before they are shared.

**Permission justification:** none needed. The extension requests no permissions and no host access.

**Remote code:** No, I am not using remote code. All JavaScript is packaged in the extension.

**Data usage:** tick none of the data types. The extension doesn't collect or transmit any user data. Tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://github.com/jlebaynham/n8n-workflow-inspector/blob/main/PRIVACY.md

## Distribution tab
- Payments: free
- Visibility: Public
- Regions: all regions

## Test instructions (for the reviewer)
No login needed. Click the toolbar button to open the inspector, then click "Try a sample workflow". Every key, email and number in the sample is fake.
