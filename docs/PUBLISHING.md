# Publishing guide

Paste-ready copy and the steps for submitting to the Chrome Web Store and
addons.mozilla.org (AMO).

## Current status

| Store | Status |
| --- | --- |
| AMO (Firefox) | **Submitted 2026-09-05, awaiting review.** Version 1.0.1, desktop + Android. |
| Chrome Web Store | **Not submitted.** Must be done by hand — see section 8. |

The AMO listing lives at
`https://addons.mozilla.org/en-US/developers/addon/llm-cliche-highlighter-ext/`.
The slug is `llm-cliche-highlighter-ext`, not `llm-cliche-highlighter`: AMO's
slug namespace is global, that shorter name is already taken by another add-on,
and the limit is 30 characters (so `llm-cliche-highlighter-extension`, at 32,
is also rejected).

Version 1.0.0 was submitted first, desktop only, and AMO marked it "Disabled by
Mozilla" automatically when 1.0.1 superseded it. Nothing to clean up.

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

**Summary** (AMO, 250 char limit) — this is what is live:

```
Ever read something online that sounds like AI wrote it? Click the toolbar button and this add-on highlights the phrases that gave it away, in yellow. Click again to clear. No data collected, no internet connection used.
```

**Detailed description** — live on AMO. Written for a store browser, not a
developer: no jargon, concrete examples, and the limits stated plainly.

```
Ever read something online and think "did a chatbot write this?" This add-on
shows you which bits gave it away.

HOW IT WORKS

Click the button in your toolbar. The article lights up: every phrase that
matches a known AI writing habit turns yellow. Tap or hover one and it tells you
which habit it spotted. The number on the button shows how many it found. Click
the button again and the page goes back to exactly how it was.

WHAT IT LOOKS FOR

38 patterns in all - the phrases AI writing reaches for again and again:

- "No sign-ups, no downloads, no hassle" - the three-part list
- "It's not just an office, but a small museum"
- "I won't pretend it was smooth" - the humble admission
- "It is important to note that..."
- Words like "delve", "a testament to", "ever-evolving landscape"

A highlight means "worth a second look", not "a robot wrote this". Plenty of
people write this way, and plenty of AI text won't trigger anything at all. It
is a reading aid, not a detector.

YOUR PRIVACY

It cannot spy on you, and that is built in rather than promised:

- It has no access to any page until you click the button - and then only to
  that one tab.
- It has no permission to use the internet, so it cannot send anything anywhere.
- It saves nothing. Close or reload the page and the highlights are gone.
- No accounts, no analytics, no tracking.

GOOD TO KNOW

- It reads the main article. Menus, sidebars and footers are left alone.
- It looks at the page as it is when you click, so on sites that load more as
  you scroll, click once the text has appeared.
- It does not look inside embedded frames.

CREDITS

Free and open source, under the Apache License 2.0.

The pattern-matching engine is Simon Willison's llm-cliche-highlighter. This
add-on is a fork of Bruno Renie's llm-cliche-highlighter-extension, which turned
that engine into a browser add-on. Both are credited in the licence file bundled
with the add-on.

Source code: https://github.com/hwasiti/llm-cliche-highlighter-extension
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

**Author.** The Firefox manifest carries `Haider Alwasiti <wasiti14@gmail.com>`,
read from `package.json` by the build so it lives in exactly one place. Naming
the fork's publisher here is what Apache-2.0 section 4 allows, since the
upstream copyright notices stay in LICENSE and every modified file keeps its
change notice. AMO displays this string on the listing, so the address becomes
public on submission; shorten it to the name alone in `package.json` if you
would rather not publish it. Chrome gets no author key and takes the developer
name from the publisher account.

**Data collection** is already declared as `"required": ["none"]`. Make the AMO
form's answers agree with the manifest; a mismatch is a rejection.

**Minimum version.** `strict_min_version` is `121.0`. The Firefox build no longer
contains `service_worker`, which was the original reason for that floor, and
event pages work from 109. But the data collection consent UI needs 140, so
older versions install without ever prompting. Decide this deliberately.

**Notes for reviewers:**

```
Source: https://github.com/hwasiti/llm-cliche-highlighter-extension

To reproduce the submitted package from that source, from the repository root:

  npm install
  npm run package

That writes dist/artifacts/llm-cliche-highlighter-firefox-<version>.zip, which
is the uploaded file. Built with Node.js 24 on Windows; any recent Node works,
and the only build dependency is web-ext.

The build performs no minification, bundling or transpilation. tools/build.mjs
copies core.js, content.js, background.js, the icons and LICENSE byte for byte
into dist/firefox/, and writes a manifest derived from the repository's
manifest.json with exactly two changes: the Chromium-only
background.service_worker key is removed, and an "author" field is added.
web-ext then zips that directory unchanged. All JavaScript in the package is
identical to the repository's and is readable as shipped.

This add-on is a fork of https://github.com/brutasse/llm-cliche-highlighter-extension
by Bruno Renié, which is itself built around the detection engine from Simon
Willison's llm-cliche-highlighter. Both are Apache License 2.0, and both
copyright notices are retained as section 4(c) requires; the submitter is added
as a third holder for this fork's changes only. Every file this fork modified
carries the section 4(b) change notice naming the modification. LICENSE, in the
package, lists all three holders.

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
- [ ] Simon Willison **and** Bruno Renié credited in the listing description
- [ ] Issues enabled on the GitHub repo, so the support URL resolves
      (GitHub disables issues on forks by default)

## 7. Review risks

- **Attribution.** Two layers of someone else's Apache-2.0 work are being
  listed: Simon Willison's detection engine, and Bruno Renié's extension around
  it, which this repository forks. The licence permits publishing both, and the
  repository handles the notices correctly — but the listing description and the
  reviewer notes must say so too. A reviewer who discovers the provenance
  themselves is a slower review than one who was told up front.
- **The name** is the upstream extension's, unchanged. Nothing on either store
  uses it today, so there is no duplicate listing to collide with. If upstream
  later publishes, the two listings would compete under one name.
- **Publishing a fork upstream hasn't published.** Permitted, and covered by the
  attribution above. Telling Bruno Renié first is a courtesy, not a requirement.
- **Broad text access.** `activeTab` reads whatever page the user is on. The
  justification above is the click-gated, minimal-scope argument reviewers want.

## 8. Chrome Web Store must be submitted by hand

Browser automation cannot do this step. Chrome refuses to let **any** extension
script or screenshot `chrome.google.com/webstore/*` — the attempt fails with
"The extensions gallery cannot be scripted." That is a browser security control,
not a bug to work around, so the Chrome submission is a manual job.

Everything needed is already built and in this repo:

1. `npm run package` → upload `dist/artifacts/llm-cliche-highlighter-chrome-1.0.1.zip`
   at https://chrome.google.com/webstore/devconsole → **New item**.
2. Store listing: paste the short description and detailed description from
   section 2. Category: Productivity.
3. Upload `store/screenshots/*.png` (both are 1280x800) and
   `store/promo/small-promo-440x280.png` as the small promo tile.
   `store/promo/marquee-1400x560.png` is optional.
4. Privacy tab: paste the single purpose statement and the activeTab / scripting
   justifications from section 3. Tick nothing under data usage. Privacy policy
   URL: the raw docs/PRIVACY.md URL on the default branch.
5. Distribution: public, all regions → **Submit for review**.

Account prerequisites: a verified publisher email and the one-time 5 USD
developer fee, both settled before the dashboard will accept a submission.

Note that Chrome 137 removed the `--load-extension` command-line switch, so
`npm run e2e` and any script that side-loads the extension into Chrome will not
work on a current Chrome. Load `dist/chrome/` through chrome://extensions
instead.
