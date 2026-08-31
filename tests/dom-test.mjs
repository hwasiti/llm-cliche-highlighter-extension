'use strict';
// DOM tests for the content script under jsdom: toggle on/off, cross-element
// matches, badge placement, main-content scoping, hidden text, line breaks,
// and text conservation.
//
// Run with: node tests/dom-test.mjs   (after `npm install` in tests/)

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const coreCode = readFileSync(path.join(here, '..', 'core.js'), 'utf8');
const contentCode = readFileSync(path.join(here, '..', 'content.js'), 'utf8');

function page(bodyHtml) {
  const dom = new JSDOM(
    '<!doctype html><html><head><title>t</title></head><body>' +
    bodyHtml + '</body></html>',
    { runScripts: 'dangerously' });
  const w = dom.window;
  for (const code of [coreCode, contentCode]) { // content auto-runs toggle()
    const s = w.document.createElement('script');
    s.textContent = code;
    w.document.documentElement.appendChild(s);
  }
  return w;
}

function baselineText(bodyHtml) {
  return new JSDOM(
    '<!doctype html><html><body>' + bodyHtml + '</body></html>')
    .window.document.body.textContent;
}

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log('PASS ' + name);
  } catch (err) {
    failed += 1;
    console.log('FAIL ' + name + ': ' + (err && err.message ? err.message : err));
  }
}
function equal(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(label + ': expected ' + b + ', got ' + a);
}
const marksOf = (w) => [...w.document.querySelectorAll('mark.llm-cliche')];

check('chain in a plain paragraph: one mark with a badge', () => {
  const w = page('<p>No fluff, no filler, no jargon. The rest is plain.</p>');
  const marks = marksOf(w);
  equal(marks.length, 1, 'marks');
  equal(marks[0].dataset.text, 'No fluff, no filler, no jargon', 'phrase');
  equal(marks[0].querySelector('sup.llm-cliche-badge').textContent, '3', 'badge');
  equal(marks[0].title.includes('“No X, no Y” chains'), true, 'tooltip');
});

check('match spanning elements: one mark per text node, badge on last', () => {
  const w = page('<p>No <span>fluff, no</span> filler, no jargon. Plain.</p>');
  const marks = marksOf(w);
  equal(marks.map(m => m.dataset.text),
    ['No ', 'fluff, no', ' filler, no jargon'], 'fragments');
  equal(marks[2].querySelector('sup.llm-cliche-badge').textContent, '3', 'badge');
  equal(marks[0].querySelector('sup.llm-cliche-badge'), null, 'no early badge');
  equal(marks[1].querySelector('sup.llm-cliche-badge'), null, 'no mid badge');
});

check('toggle off restores the exact original text', () => {
  const html = '<article><p>No fluff, no filler, no jargon. More words here to make it real.</p>' +
    '<ul><li>Sit with that for a moment.</li></ul></article>';
  const expected = baselineText(html);
  const w = page(html);
  equal(marksOf(w).length, 2, 'marks on');
  equal(w.document.getElementById('llm-cliche-styles') !== null, true, 'style injected');
  w.__llmClicheToggle();
  equal(w.document.body.textContent, expected, 'text conserved');
  equal(marksOf(w).length, 0, 'marks off');
  w.__llmClicheToggle();
  equal(marksOf(w).length, 2, 'marks back on');
  w.__llmClicheToggle();
  equal(w.document.querySelectorAll('#llm-cliche-styles').length, 1, 'style not duplicated');
});

check('main content only: header and footer are never scanned', () => {
  const w = page('<header>No fluff, no filler in the nav, obviously.</header>' +
    '<article><p>Totally clean paragraph here.</p></article>' +
    '<footer>No ads, no fees, no catch.</footer>');
  equal(marksOf(w).length, 0, 'marks');
});

check('hidden elements are skipped', () => {
  const w = page('<article><p>No fluff, no filler.</p>' +
    '<div hidden>No ads, no fees, and no catch.</div></article>');
  equal(marksOf(w).length, 1, 'marks');
});

check('line break inside a paragraph is a sentence boundary', () => {
  const w = page('<article><p>Turns out the first<br>turns out the second.</p></article>');
  equal(marksOf(w).length, 2, 'marks');
});

const total = 6;
process.exitCode = failed ? 1 : 0;
console.log((total - failed) + ' dom checks passed, ' + failed + ' failed');
