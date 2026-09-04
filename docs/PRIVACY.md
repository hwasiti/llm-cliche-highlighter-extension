# Privacy policy

**LLM Cliché Highlighter collects nothing, stores nothing, and sends nothing
anywhere.**

This is not a promise about intent. It is a property of what the extension is
allowed to do, and you can verify every claim below from the source in this
repository.

## What the extension does with your data

Nothing leaves your browser. When you click the toolbar button, the extension
reads the text of the page in that one tab, finds phrases matching its built-in
patterns, and wraps them in highlight elements in the page you are already
looking at. The text is examined in memory and discarded when the page is
closed or reloaded.

There is no server. There is no account. There is no analytics, telemetry,
crash reporting, or remote configuration of any kind.

## What it never touches

| | |
| --- | --- |
| Personally identifying information | Not collected |
| Authentication or credential data | Not collected |
| Financial or payment information | Not collected |
| Health information | Not collected |
| Location | Not collected |
| Browsing history or activity | Not collected |
| Search terms | Not collected |
| Bookmarks | Not collected |
| Personal communications | Not collected |
| Website content | Read in the active tab only, never transmitted or retained |

## Why it cannot collect data even if it wanted to

The extension holds two permissions and no host permissions at all:

- **`activeTab`** grants access to a single tab, only after you click the
  toolbar button, and only until you navigate away. The browser enforces this.
  Before your click, the extension has no access to any page.
- **`scripting`** is what lets it inject its own two files into that tab.

It requests no network permissions, so it cannot contact any server. It
requests no `storage` permission, so it has nowhere to persist anything between
clicks. The highlight state lives entirely in the page's own DOM, which is why
reloading the page clears it.

## Firefox data collection declaration

The manifest declares this formally for Firefox, in the form Mozilla requires
of new listings:

```json
"data_collection_permissions": {
  "required": ["none"]
}
```

`none` is Mozilla's designated value for an extension that collects no data.

## Verifying this yourself

The extension is open source under the Apache License 2.0 and is small enough
to audit in an afternoon. The parts relevant to this policy:

- `manifest.json` lists every permission requested.
- `background.js` handles the toolbar click and injects the content script.
- `content.js` walks the page and wraps matches.
- `core.js` is the pattern engine. It is pure text processing with no I/O.

Search the source for `fetch`, `XMLHttpRequest`, `sendBeacon` or
`chrome.storage` and you will find none of them.

## Contact

Report concerns as an issue on the project repository.

## Changes

If a future version ever collects anything, this document and the manifest
declaration will be updated before that version is published, and the change
will be called out in the release notes.
