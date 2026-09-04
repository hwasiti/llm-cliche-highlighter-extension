# Publishing guide

Paste-ready copy and the steps for submitting to the Chrome Web Store and
addons.mozilla.org (AMO). Nothing has been submitted yet.

## 1. Build and package

Never upload the repository root: it carries both browsers' background keys, so
each store flags the one it does not implement, plus tests and fixtures.

```sh
npm run package
```

That runs `tools/build.mjs`, then web-ext, leaving store-ready zips in
`dist/artifacts/` with `manifest.json` correctly at the archive root.

| Target | Build directory | Manifest difference |
| --- | --- | --- |
| Chrome Web Store | `dist/chrome/` | `service_worker` only, gecko keys dropped |
| AMO | `dist/firefox/` | `scripts` only, gecko keys kept |

Run the Firefox linter before submitting. It catches most of what AMO would
reject:

```sh
npm run lint:firefox
```

Load each build once and confirm it reports zero warnings.
`npm run start:firefox` opens a clean Firefox with the add-on installed.

## 2. Listing copy

**Name:** `LLM Cliché Highlighter`

**Short description** (Chrome, 132 char limit):

```
Highlight the tells of AI-written text on any page. One click to mark them, one click to clear.
```

**Summary** (AMO, 250 char limit):

```
Highlights the rhetorical tics of LLM-written prose on the page you are reading: "no X, no Y" chains, "that's the whole point", performative honesty, and 35 more. One click marks them, another clears them. No data collection, no network access.
```

**Detailed description:**

```
Click the toolbar icon on any page and the main content lights up: every match
gets an amber highlight, and hovering it names the pattern that fired. Chain
constructions such as "No sign-ups, no downloads, no hassle" also carry a badge
counting the items, and the total appears on the toolbar icon. Click again and
the page is restored exactly as it was.

38 detectors ship with the extension, covering rhetorical tics and the tells
catalogued in Wikipedia's "Signs of AI writing" guide. The detection engine is a
port of Simon Willison's llm-cliche-highlighter, used under the Apache License
2.0. The original is a page you paste text into; this scans a live page instead.

Built so that it cannot spy on you: no data collection, no analytics, no network
access, and no host permissions. It does nothing at all until you click the
button, at which point the browser grants access to that one tab and nothing
else. Open source under the Apache License 2.0.

Scope, stated honestly: it scans the main content of the top frame only, so
navigation, footers and iframes are skipped. Scanning is a snapshot, so on
single-page apps click after your content has rendered. Code blocks are scanned
deliberately, since pasted AI transcripts often live there, which makes the
colon-list detector noisier on technical documentation.
```

**Category:** Productivity (Chrome). Other or Web Development (AMO).

**Privacy policy URL:** point both stores at [PRIVACY.md](PRIVACY.md) on GitHub,
using whichever branch is your default.

## 3. Chrome Web Store

**Single purpose:**

```
To visually highlight phrases on the page the user is currently reading that
match known clichés of LLM-generated prose, and remove them on a second click.
```

**`activeTab` justification:**

```
The extension reads and modifies the DOM of the page the user is reading to find
cliché phrases and wrap them in highlight elements. activeTab restricts that to
the single tab where the user clicked the toolbar button, and only for that
visit. No access is held before the click or in the background.
```

**`scripting` justification:**

```
Injects the extension's two bundled files into the active tab on click: core.js,
the pattern engine, and content.js, which walks the DOM and wraps matches. The
extension declares no content_scripts, so nothing runs until the user clicks.
```

**Host permissions:** none requested. **Remote code:** no, everything is bundled.

**Data usage:** tick nothing. See [PRIVACY.md](PRIVACY.md) for how to verify it.

## 4. AMO

**Extension ID** is set in the manifest, and is fork-specific so it cannot
collide with the upstream add-on:

```
llm-cliche-highlighter@wasiti14.gmail.com
```

The manifest is authoritative. If it changes, change it here too.

**Data collection** is already declared as `"required": ["none"]`. Make the AMO
form's answers agree with the manifest; a mismatch is a rejection.

**Minimum version.** `strict_min_version` is `121.0`. The Firefox build no longer
contains `service_worker`, which was the original reason for that floor, and
event pages work from 109. But the data collection consent UI needs 140, so
older versions install without ever prompting. Decide this deliberately.

**Notes for reviewers:**

```
Source: https://github.com/hwasiti/llm-cliche-highlighter-extension

The submitted package is produced by `node tools/build.mjs` from the repository
root. That script performs no minification, bundling or transpilation. It copies
core.js, content.js, background.js, the icons and LICENSE byte for byte, and
writes a manifest derived from the repository's manifest.json with the
Chromium-only background.service_worker key removed. All JavaScript in the
package is identical to the repository's and is readable as shipped.

core.js is a port of the detection engine from Simon Willison's
llm-cliche-highlighter, used under the Apache License 2.0. Attribution headers
and the modification notices required by section 4(b) are present in the file.

The extension makes no network requests and uses no storage API.
```

**Licence:** Apache License 2.0, selected in the form. `LICENSE` is already in
the package.

## 5. Store assets

Generate these rather than capturing them by hand:

```sh
npm run assets
```

`tools/store-assets.mjs` writes into `store/`. The screenshots are real: it
applies `core.js` and `content.js` to `test-page.html` in an isolated world, the
same mechanism the toolbar click uses, so the pixels are what a user actually
sees.

| Asset | Size | Needed by |
| --- | --- | --- |
| Screenshots | 1280x800 | Chrome, one to five; recommended on AMO |
| Small promo tile | 440x280 | Chrome, optional |
| Marquee promo tile | 1400x560 | Chrome, optional |
| Store icon | 128x128 | Both, already in `icons/` |

Confirm current required sizes on each store's documentation at submission
time; they change.

## 6. Checklist

- [ ] `npm test` passes
- [ ] `npm run lint:firefox` clean
- [ ] `npm run package` run, both builds loaded with zero warnings
- [ ] Version bumped in `manifest.json` and `package.json`, matching the notes
- [ ] `npm run assets` run and `store/` reviewed
- [ ] Privacy policy URL live on the right branch
- [ ] Justifications and reviewer notes pasted from sections 3 and 4
- [ ] AMO data answers agree with the manifest
- [ ] `strict_min_version` decided deliberately
- [ ] Simon Willison credited in the listing description

## 7. Review risks

- **Attribution.** The engine is a port of someone else's Apache-2.0 work. The
  repository handles this correctly; the listing should credit it too.
- **The name** is close to the upstream tool's. Consider asking upstream before
  the listing goes live.
- **Broad text access.** `activeTab` reads whatever page the user is on. The
  justification above is the click-gated, minimal-scope argument reviewers want.
