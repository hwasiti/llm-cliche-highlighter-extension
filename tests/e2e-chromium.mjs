'use strict';
// End-to-end test: loads the extension into headless Chromium, opens
// test-page.html, injects the content script the way a toolbar click does
// (driven from the service worker over CDP, since headless cannot click the
// toolbar icon), and verifies highlights appear, are scoped to the article,
// and a second injection removes them exactly.
//
// The test uses a copy of the extension whose manifest additionally grants
// host_permissions <all_urls>: that only changes the permission model (a real
// click grants activeTab for the same access) and lets the service worker
// invoke executeScript without a user gesture. All extension code is the
// shipped code, unmodified.
//
// Run with: node tests/e2e-chromium.mjs

import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const workDir = '/tmp/opencode/e2e-ext';
const profileDir = '/tmp/opencode/chrome-e2e';
const PAGE_PORT = 8123;
const CDP_PORT = 9333;
const PAGE_URL = 'http://127.0.0.1:' + PAGE_PORT + '/test-page.html';

let failed = 0;
function check(name, ok, extra) {
  if (ok) console.log('PASS ' + name);
  else {
    failed += 1;
    console.log('FAIL ' + name + (extra ? ': ' + extra : ''));
  }
}
function equal(actual, expected, label) {
  check(label, JSON.stringify(actual) === JSON.stringify(expected),
    'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

// --- prepare test copy of the extension -----------------------------------
rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir + '/icons', { recursive: true });
for (const f of ['manifest.json', 'core.js', 'content.js', 'background.js']) {
  cpSync(path.join(root, f), path.join(workDir, f));
}
for (const f of ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png']) {
  cpSync(path.join(root, 'icons', f), path.join(workDir, 'icons', f));
}
const manifest = JSON.parse(readFileSync(workDir + '/manifest.json', 'utf8'));
manifest.host_permissions = ['<all_urls>'];
writeFileSync(workDir + '/manifest.json', JSON.stringify(manifest, null, 2));

// --- serve the test page ----------------------------------------------------
const pageBody = readFileSync(path.join(root, 'test-page.html'));
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(pageBody);
});
await new Promise((res) => server.listen(PAGE_PORT, '127.0.0.1', res));

// --- start headless chromium ------------------------------------------------
rmSync(profileDir, { recursive: true, force: true });
const chrome = spawn(
  'chromium',
  [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + profileDir,
    '--load-extension=' + workDir,
    PAGE_URL
  ],
  { stdio: 'ignore' });

let pageConn = null;
let swConn = null;
let timedOut = false;
const timer = setTimeout(() => { timedOut = true; }, 90000);

async function listTargets() {
  const res = await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list');
  return res.json();
}

async function cdpConnect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('ws connect failed')), { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message));
      else res(msg.result);
    }
  });
  return {
    send: (method, params = {}) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, { res, rej });
      ws.send(JSON.stringify({ id: mid, method, params }));
    }),
    close: () => ws.close()
  };
}

async function ev(conn, expression) {
  const r = await conn.send('Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    const e = r.exceptionDetails.exception || {};
    throw new Error('evaluate failed: ' + (e.description || e.value || 'unknown'));
  }
  return r.result ? r.result.value : undefined;
}

// Simulates what the toolbar click handler does in background.js.
const INJECT = `(async () => {
  const tabs = await chrome.tabs.query({ url: 'http://127.0.0.1:${PAGE_PORT}/*' });
  if (!tabs.length) return 'no-tab';
  const results = await chrome.scripting.executeScript({
    target: { tabId: tabs[0].id },
    files: ['core.js', 'content.js']
  });
  return 'injected:' + results.length;
})()`;

try {
  // Wait for both targets to appear.
  let targets = null;
  for (let i = 0; i < 100 && !timedOut; i++) {
    const list = await listTargets().catch(() => []);
    const page = list.find(t => t.type === 'page' && t.url === PAGE_URL);
    const sw = list.find(t =>
      (t.type === 'service_worker' || t.type === 'other') &&
      (t.url || '').endsWith('background.js'));
    if (page && sw) { targets = { page, sw }; break; }
    await new Promise(r => setTimeout(r, 300));
  }
  if (!targets) {
    const list = (await listTargets().catch(() => []))
      .map(t => t.type + ' ' + t.url).join('\n');
    throw new Error('targets never appeared:\n' + list);
  }
  pageConn = await cdpConnect(targets.page.webSocketDebuggerUrl);
  swConn = await cdpConnect(targets.sw.webSocketDebuggerUrl);

  // Wait for the page to finish loading.
  for (let i = 0; i < 50 && !timedOut; i++) {
    if (await ev(pageConn, 'document.readyState') === 'complete') break;
    await new Promise(r => setTimeout(r, 300));
  }

  equal(await ev(pageConn, 'document.querySelectorAll("mark.llm-cliche").length'),
    0, 'no marks before first click');
  const baseline = await ev(pageConn, 'document.body.textContent');

  // First "click": highlight.
  equal(await ev(swConn, INJECT), 'injected:1', 'first injection succeeds');
  await new Promise(r => setTimeout(r, 300)); // let the badge message land

  const markCount = await ev(pageConn, 'document.querySelectorAll("mark.llm-cliche").length');
  check('highlights article text', markCount >= 35, markCount + ' marks');
  equal(await ev(pageConn,
    'document.querySelectorAll("header mark.llm-cliche, footer mark.llm-cliche").length'),
    0, 'header and footer untouched');
  equal(await ev(pageConn,
    'document.querySelectorAll("article [hidden] mark.llm-cliche").length'),
    0, 'hidden box untouched');
  equal(await ev(pageConn, '!!document.getElementById("llm-cliche-styles")'),
    true, 'styles injected');
  equal(await ev(pageConn,
    '[...document.querySelectorAll("mark.llm-cliche sup.llm-cliche-badge")].length > 0'),
    true, 'chain badges rendered');
  equal(await ev(pageConn,
    'document.querySelector("mark.llm-cliche").title.length > 0'),
    true, 'tooltip present');
  const badgeOn = await ev(swConn, `(async () => {
    const tabs = await chrome.tabs.query({ url: 'http://127.0.0.1:${PAGE_PORT}/*' });
    return chrome.action.getBadgeText({ tabId: tabs[0].id });
  })()`);
  check('action badge shows the match count', /^\d+$/.test(String(badgeOn)),
    'badge=' + JSON.stringify(badgeOn));
  check('badge count is plausible',
    Number(badgeOn) >= 35 && Number(badgeOn) <= 60, 'badge=' + badgeOn);
  console.log('   (test page produced ' + markCount + ' marks, badge ' + badgeOn + ')');

  // Second "click": unhighlight.
  equal(await ev(swConn, INJECT), 'injected:1', 'second injection succeeds');
  await new Promise(r => setTimeout(r, 300));
  equal(await ev(pageConn, 'document.querySelectorAll("mark.llm-cliche").length'),
    0, 'marks removed');
  equal(await ev(pageConn, 'document.body.textContent'), baseline,
    'page text conserved after toggle off');
  const badgeOff = await ev(swConn, `(async () => {
    const tabs = await chrome.tabs.query({ url: 'http://127.0.0.1:${PAGE_PORT}/*' });
    return chrome.action.getBadgeText({ tabId: tabs[0].id });
  })()`);
  equal(badgeOff, '', 'badge cleared');
} catch (err) {
  failed += 1;
  console.log('FAIL e2e: ' + (err && err.stack ? err.stack : err));
} finally {
  clearTimeout(timer);
  if (pageConn) pageConn.close();
  if (swConn) swConn.close();
  chrome.kill('SIGKILL');
  server.close();
}

console.log(failed === 0 ? 'e2e: all checks passed' : 'e2e: ' + failed + ' check(s) FAILED');
process.exit(failed ? 1 : 0);
