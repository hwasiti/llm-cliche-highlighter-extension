// LLM Cliché Highlighter — background service worker.
//
// Original code (Copyright 2026 Bruno Renié, Apache License 2.0 — see
// LICENSE); the pattern engine it injects is derived from Simon
// Willison's llm-cliche-highlighter (see core.js and LICENSE).
//
// Clicking the toolbar button grants activeTab for that tab and injects
// core.js + content.js into its top frame; no host permissions are held
// between clicks. The content script reports the resulting match count,
// which is shown as the action badge.

let lastTabId = null;

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id || !/^https?:/i.test(tab.url || '')) return;
  lastTabId = tab.id;
  chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#92400e' });
  chrome.scripting
    .executeScript({
      target: { tabId: tab.id },
      files: ['core.js', 'content.js']
    })
    .catch((err) => console.error('LLM Cliché Highlighter:', err));
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'cliche-toggled') return;
  const text = msg.active ? String(msg.count) : '';
  chrome.action.setBadgeText(
    typeof lastTabId === 'number' ? { tabId: lastTabId, text } : { text });
});
