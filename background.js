// LLM Cliché Highlighter — background service worker.
//
// Original code (Copyright 2026 Bruno Renié, Apache License 2.0 — see
// LICENSE); the pattern engine it injects is derived from Simon
// Willison's llm-cliche-highlighter (see core.js and LICENSE).
//
// Modified 2026 by Haider Alwasiti (Apache License 2.0 — see LICENSE):
// added the `api` namespace shim and Promise.resolve() normalisation, and
// loosened the URL guard — see the comments on each below.
//
// Clicking the toolbar button grants activeTab for that tab and injects
// core.js + content.js into its top frame; no host permissions are held
// between clicks. The content script reports the resulting match count,
// which is shown as the action badge.

// Firefox puts the promise-based WebExtension API on `browser`; its `chrome`
// is a callback-flavoured compatibility alias, so chaining .catch() straight
// onto a chrome.* return value is not guaranteed to work there — and if that
// return value is undefined, the listener throws and the extension does
// nothing at all. Prefer `browser` where it exists (Firefox), fall back to
// `chrome` (Chromium), and normalise with Promise.resolve() before chaining.
const api = typeof browser !== 'undefined' ? browser : chrome;

let lastTabId = null;

api.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  // Bail only on a URL we know we cannot inject into. `tab.url` requires
  // activeTab/host access to be readable, so treat a missing value as
  // "unknown, try it" rather than "skip": executeScript rejects harmlessly
  // on privileged pages, and the .catch() below swallows it. Testing
  // /^https?:/ against '' would instead make every click a silent no-op.
  if (tab.url && !/^https?:/i.test(tab.url)) return;
  lastTabId = tab.id;
  api.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#92400e' });
  Promise.resolve(
    api.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['core.js', 'content.js']
    })
  ).catch((err) => console.error('LLM Cliché Highlighter:', err));
});

api.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'cliche-toggled') return;
  const text = msg.active ? String(msg.count) : '';
  api.action.setBadgeText(
    typeof lastTabId === 'number' ? { tabId: lastTabId, text } : { text });
});
