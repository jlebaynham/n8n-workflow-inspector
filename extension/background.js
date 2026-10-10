// Clicking the toolbar button opens the inspector in its own tab.
// The extension asks for no permissions and makes no network requests.
const PAGE = "inspector.html";

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL(PAGE) });
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL(PAGE) });
});
