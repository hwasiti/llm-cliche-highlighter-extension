// Emits warning-free per-browser copies of the extension into dist/.
//
// Copyright 2026 Haider Alwasiti (Apache License 2.0 — see LICENSE).
//
// The checked-in manifest.json declares both background.scripts and
// background.service_worker — the documented cross-browser MV3 pattern
// (Chromium runs the worker and ignores scripts; Firefox, which has no
// extension service workers, runs the same file as an event page). Each
// browser therefore sees one key it does not implement, and says so:
// Chromium's unpacked-extension view reports "'background.scripts'
// requires manifest version of 2 or lower". The extension loads and works
// either way — the notice is cosmetic, and dev-mode only.
//
// This script removes that notice by writing a manifest per browser:
//
//   dist/chrome/    background.service_worker only, no browser_specific_settings
//   dist/firefox/   background.scripts only, gecko settings kept
//
// Run with: node tools/build.mjs

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

// Everything the extension needs at runtime, plus the license Apache-2.0
// requires distributions to carry. Tests, tools and fixtures stay out.
const FILES = ['core.js', 'content.js', 'background.js', 'LICENSE'];
const ICONS = ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png'];

const source = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));

const TARGETS = {
  chrome(m) {
    delete m.background.scripts;
    delete m.browser_specific_settings;
    // No `author` here on purpose: Chrome's current manifest reference does
    // not document the key, and the Web Store takes the developer name from
    // the publisher account rather than the manifest. AMO does use it.
  },
  firefox(m) {
    delete m.background.service_worker;
    m.author = 'Haider Alwasiti';
  }
};

rmSync(dist, { recursive: true, force: true });

for (const [name, patch] of Object.entries(TARGETS)) {
  const out = path.join(dist, name);
  mkdirSync(path.join(out, 'icons'), { recursive: true });
  for (const f of FILES) cpSync(path.join(root, f), path.join(out, f));
  for (const f of ICONS) {
    cpSync(path.join(root, 'icons', f), path.join(out, 'icons', f));
  }

  const manifest = JSON.parse(JSON.stringify(source));
  patch(manifest);
  writeFileSync(
    path.join(out, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8');

  console.log('dist/' + name + '/ written');
}
