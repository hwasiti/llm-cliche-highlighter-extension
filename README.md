# LLM Cliché Highlighter

A browser extension (Chromium + Firefox) that highlights LLM clichés on the
page you're reading. Click the toolbar icon to light up the main content;
click again to remove the highlights exactly as they were.

Each match gets an amber `<mark>` with a hover tooltip naming the pattern it
hit, and chain-style patterns ("No fluff, no filler, no jargon") additionally
carry a small badge counting the items. The total match count appears as the
toolbar icon's badge while active.

### What the tooltip says

The tooltip names the **detector that fired**, not a suggested rewrite. The
names are templates: `X` and `Y` are slots for whatever words the page used,
`VERB` is any verb, `…` is a variable middle.

| Highlighted on the page | Tooltip on hover |
| --- | --- |
| No sign-ups, no downloads, no hassle | `“No X, no Y” chains · 3 “no” items` |
| Don't call it a rewrite — call it | `“Don’t VERB it … VERB it”` |
| Sit with that for a moment | `“Sit with that”` |

Anything after the middle dot is the badge detail, which only chain-style
detectors carry. All 38 are listed in [docs/PATTERNS.md](docs/PATTERNS.md).

## Credits

The detection engine is a verbatim port of the `impl` section of
[llm-cliche-highlighter](https://github.com/simonw/tools/blob/main/llm-cliche-highlighter.html)
by **Simon Willison** — ~38 pattern detectors covering rhetorical tics and the
tells catalogued in Wikipedia's
[Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)
guide. The original tool and its license are Apache-2.0; `core.js` carries an
attribution header, and the original's self-tests — minus the four covering
the URL-loading helpers — are ported unmodified into
[tests/run.js](tests/run.js).

The original is a page you paste text into. This extension scans a live web
page instead, which is where all the actual work (and the tradeoffs below)
happens.

## Fork

This repository is a fork of
[brutasse/llm-cliche-highlighter-extension](https://github.com/brutasse/llm-cliche-highlighter-extension)
by **Bruno Renié**, who wrote the extension around Simon Willison's engine.
Everything above this line is his design, and it is unchanged.

Maintained here by **Haider Alwasiti** (<wasiti14@gmail.com>) for publication on
the Chrome Web Store and addons.mozilla.org. What this fork adds:

- **Per-browser builds.** `tools/build.mjs` emits `dist/chrome/` and
  `dist/firefox/` so neither store sees a manifest key its browser does not
  implement, plus `npm run package` for the store zips.
- **Idempotent re-injection.** `core.js` is now wrapped in an IIFE. It is
  re-injected into the same isolated world on every click, and its top-level
  `const` bindings persisted there, so from the second click on the file died
  with `SyntaxError: Identifier 'CHAIN_BODY' has already been declared` and
  never ran. Toggling still worked — `window.LLMCliche` survived from the first
  injection — which is exactly why nobody noticed.
- **Firefox API safety.** `background.js` and `content.js` prefer the `browser`
  namespace and normalise with `Promise.resolve()`, so a callback-style return
  value under Gecko cannot throw; and the click handler no longer treats an
  unreadable `tab.url` as "skip", which would have made every click a no-op.
- **A new add-on ID.** `browser_specific_settings.gecko.id` is now
  `llm-cliche-highlighter@wasiti14.gmail.com`; keeping upstream's UUID would
  collide on AMO if upstream ever lists it.
- **Store assets and docs** — see [docs/](docs/) below.

## Install

**Chromium (Chrome / Edge / Brave):**

1. `chrome://extensions` (or `edge://extensions`)
2. Enable *Developer mode*
3. *Load unpacked* → select this directory
4. Pin the icon to the toolbar; click it on any page

**Firefox:** `about:debugging` → *This Firefox* → *Load Temporary Add-on…* →
select `manifest.json`. (Temporarily loaded; re-add per session, or zip the
directory and load the `.zip` — or package it properly for AMO.)

Loaded straight from this directory, each browser also reports the one
background key it does not implement — Chromium's extensions page notes
"'background.scripts' requires manifest version of 2 or lower". The
extension loads and works regardless; the notice is cosmetic and appears only
for unpacked developer-mode loads (see *Dual MV3 background* below). For
copies that carry no such notice:

```sh
node tools/build.mjs   # writes dist/chrome/ and dist/firefox/
```

Then load `dist/chrome` unpacked, or `dist/firefox/manifest.json` as the
temporary add-on. These are also what to upload to the stores.

**Try it on a fixture page:**

```sh
python3 -m http.server 8123
# open http://localhost:8123/test-page.html
```

`test-page.html` contains the original tool's example text spread across
headings, spans and lists, plus clichés deliberately placed in the header,
footer and a hidden div — none of which should light up.

## Design choices

- **MV3, `activeTab` + `scripting` only.** No host permissions, no storage,
  no network access. The extension can do nothing until you click its icon,
  at which point the browser grants access to that tab only.
- **The DOM is the state.** Highlighting = a set of `<mark class="llm-cliche">`
  elements. The background worker simply re-injects `core.js` + `content.js`
  on every click; the injected script finds existing marks → removes them,
  finds none → adds them. No per-tab bookkeeping in the service worker, which
  makes double-clicks, navigation and browser restarts all behave the same.
- **Files, not `func`.** Chromium/Firefox require *exactly one* of `files` or
  `func` on `executeScript`, so the content script self-runs its toggle on
  injection and reports the count back via `chrome.runtime.sendMessage`,
  which the worker shows as the action badge.
- **Dual MV3 background.** The manifest declares both `background.scripts`
  and `background.service_worker` (the documented cross-browser pattern):
  Chromium runs the service worker and ignores `scripts`, while Firefox —
  which doesn't support `service_worker` (bug 1573659) — runs the same
  `background.js` as an event page. Firefox 121 is the floor because earlier
  versions refuse to start the background page when `service_worker` is
  present. The cost is that each browser flags the key it ignores;
  `tools/build.mjs` strips the other one per target when that matters.
- **Main content only.** The scanner roots at `<article>`, then `<main>`,
  then `[role="main"]`, then `<body>`. Site chrome (nav, footer) is never
  scanned.
- **Phrase-level marks, one per text node.** A match spanning
  `No <strong>downloads</strong>, no <em>hassle</em>` becomes one mark per
  underlying text node (that's how you wrap across element boundaries
  without cloning), with the badge attached to the last fragment. Match count
  ≠ mark count.
- **Lossless removal.** Each mark stores its original text in
  `data-text`; removal restores exactly that string and normalizes the parent,
  so the page's text is byte-identical after a round trip (the badge `<sup>`
  must not leak into the text). This is asserted in the E2E test.
- **Verbatim engine, verbatim tests.** `core.js` is the upstream `impl`
  section minus the URL-loading helpers (irrelevant on a live page — the text
  *is* the page). All 188 upstream self-test cases run unmodified.

## Tradeoffs and known limitations

- **Block-boundary heuristic.** The patterns are built on a plain string where
  `\n` separates sentences. The extension reconstructs that string by walking
  text nodes and inserting `\n` when the nearest block-level ancestor
  changes (or a `<br>` intervenes). Pages that fight the defaults — a
  `display:block` `<span>`, floated or inline-block divs, grid/flex rows of
  block-level elements — can get a boundary in the wrong place, so a match
  may be missed or split. Correctness in the general case requires computed
  styles per node; that's deliberately not paid for.
- **`<pre>`/`<code>` are scanned.** Chat logs and pasted transcripts often put
  the AI text in code blocks, so skipping them wasn't an option. Consequence:
  in technical documentation the upstream `colon-triple` pattern (already
  noted by its author as "noisy in technical writing") will fire on lists.
  There is no per-pattern toggle — the original tool's checkbox panel was
  dropped in favor of a one-button extension.
- **Hidden text.** Only the `[hidden]` attribute filters; inline
  `style="display:none"` and collapsible sections are not walked (checking
  `getComputedStyle` per node is expensive on large pages). Matches inside
  such text are missed, not falsely shown.
- **Top frame only.** Iframes are not scanned.
- **SpAs and dynamic content.** Scanning is snapshot-based: click after the
  content you care about has rendered.
- **Very long pages** are capped at the first 1,000,000 characters of main
  content.
- **The badge is best-effort.** If the background restarts (service worker in
  Chromium, event page in Firefox) between an injection and the content
  script's report, the count falls back to the global badge. Losing the badge
  never affects highlighting itself.
- **Rapid double-clicks** can race (two injections both deciding "add"). The
  parity of clicks still wins out in practice; a locking protocol wasn't
  worth it.

## Repo layout

```
manifest.json      MV3 manifest (action + service worker)
core.js            pattern engine, ported from simonw's tool, dual export
content.js         DOM walk, match wrapping, toggle/removal, styles
background.js      click → inject → badge
icons/             generated by tools/gen-icons.sh (ImageMagick 7)
test-page.html     manual fixture page
tests/             see below (jsdom is the only dev dependency, tests/ only)
tools/             gen-icons.sh (icons), build.mjs, gen-patterns-doc.mjs
docs/              pattern reference, privacy policy, publishing guide
dist/              build output, gitignored: chrome/ and firefox/
```

## Docs

- [docs/PATTERNS.md](docs/PATTERNS.md) — every detector and the tooltip it
  shows. Generated from `core.js` by `node tools/gen-patterns-doc.mjs`.
- [docs/PRIVACY.md](docs/PRIVACY.md) — privacy policy. Nothing is collected,
  stored or transmitted; also the URL to hand the stores.
- [docs/PUBLISHING.md](docs/PUBLISHING.md) — store submission guide: builds,
  listing copy, permission justifications, reviewer notes.

## Tests

```sh
cd tests
npm install
npm test      # 188 pattern-core tests (port of the upstream self-tests) + 6 jsdom DOM checks
npm run e2e   # loads the real extension in headless Chromium, drives the service
              # worker over CDP, verifies toggle on/off on the live test page
```

The E2E uses a copy of the manifest with `host_permissions: <all_urls>`:
that only changes the permission model (a real click grants `activeTab` for
the same access) and lets headless Chromium inject without a UI gesture. The
extension code it runs is the shipped code, unmodified.

Regenerate icons with `sh tools/gen-icons.sh`. Write the per-browser copies
with `node tools/build.mjs`; both tests run against the shared root manifest,
which is the single source the builds are derived from.

## License

Apache License 2.0 — see [LICENSE](LICENSE). Three parties hold copyright, in
the order the work was built:

- `core.js` and its tests — derived from
  [llm-cliche-highlighter.html](https://github.com/simonw/tools/blob/main/llm-cliche-highlighter.html),
  Copyright 2026 Simon Willison
- the extension wrapper (`content.js`, `background.js`, manifest, icons,
  fixtures) — Copyright 2026 Bruno Renié
- this fork — cross-browser build and packaging, store assets and docs, and the
  fixes listed under *Fork* above — Copyright 2026 Haider Alwasiti

Every modified file carries the change notice required by Apache-2.0 §4(b), and
the notices of earlier authors are retained as §4(c) requires. The LICENSE body
is the upstream license text, byte-identical; the shipped packages include it,
which is what §4(a) asks of a distribution.
