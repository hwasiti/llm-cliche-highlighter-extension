// Generates the store-listing images into store/.
//
// Copyright 2026 Haider Alwasiti (Apache License 2.0 — see LICENSE).
//
// Screenshots are taken of test-page.html with real highlights applied. The
// extension itself is not loaded: Chrome 137 removed the --load-extension
// switch, so instead core.js and content.js are evaluated in an isolated world
// created over the page, which is the same mechanism (and the same isolated
// world semantics) that chrome.scripting.executeScript({files}) uses. The
// pixels are therefore what a user sees after clicking the toolbar button.
//
// Promo tiles are rendered from an inline template at the exact sizes the
// Chrome Web Store asks for, reusing the icon palette from gen-icons.sh.
//
// Run with: node tools/store-assets.mjs

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outShots = path.join(root, 'store', 'screenshots');
const outPromo = path.join(root, 'store', 'promo');
const profileDir = path.join(os.tmpdir(), 'cliche-store-assets');
const PAGE_PORT = 8321;
const CDP_PORT = 9531;
const PAGE_URL = 'http://127.0.0.1:' + PAGE_PORT + '/test-page.html';

// Chrome is not on PATH on Windows; probe the usual install locations.
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].filter(Boolean);
const { existsSync } = await import('node:fs');
const CHROME = CANDIDATES.find((p) => existsSync(p));
if (!CHROME) {
  console.error('No Chrome found. Set CHROME_PATH to the executable.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const coreSrc = readFileSync(path.join(root, 'core.js'), 'utf8');
const contentSrc = readFileSync(path.join(root, 'content.js'), 'utf8');
const iconB64 = readFileSync(path.join(root, 'icons', 'icon128.png'), 'base64');

rmSync(path.join(root, 'store'), { recursive: true, force: true });
mkdirSync(outShots, { recursive: true });
mkdirSync(outPromo, { recursive: true });

// --- promo tile template ----------------------------------------------------
function promoHtml(w, h) {
  const big = w >= 1000;
  return `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:${w}px;height:${h}px;overflow:hidden}
  body{display:flex;align-items:center;gap:${big ? 56 : 22}px;
    padding:0 ${big ? 80 : 34}px;box-sizing:border-box;
    background:linear-gradient(135deg,#fffbeb 0%,#fde68a 100%);
    font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
    color:#1d1b17}
  img{width:${big ? 190 : 84}px;height:${big ? 190 : 84}px;flex:none}
  h1{margin:0 0 ${big ? 14 : 6}px;font-size:${big ? 62 : 27}px;line-height:1.06;
    letter-spacing:-.02em;font-weight:800}
  p{margin:0;font-size:${big ? 27 : 13}px;line-height:1.35;color:#57452a;
    font-weight:500}
  mark{background:#fcd34d;border-radius:3px;padding:0 3px;
    box-shadow:0 0 0 1px #b4530933}
  </style>
  <img src="data:image/png;base64,${iconB64}">
  <div>
    <h1>LLM Cliché<br>Highlighter</h1>
    <p>Spot the <mark>tells of AI writing</mark> on any page.<br>
       One click to mark them, one to clear.</p>
  </div>`;
}

// --- serve the fixture page -------------------------------------------------
const pageBody = readFileSync(path.join(root, 'test-page.html'));
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(pageBody);
});
await new Promise((r) => server.listen(PAGE_PORT, '127.0.0.1', r));

rmSync(profileDir, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--no-first-run', '--no-default-browser-check',
  '--force-device-scale-factor=1',
  '--remote-debugging-port=' + CDP_PORT,
  '--user-data-dir=' + profileDir,
  PAGE_URL
], { stdio: 'ignore' });

async function connect(ws) {
  const sock = new WebSocket(ws);
  await new Promise((res, rej) => {
    sock.addEventListener('open', res, { once: true });
    sock.addEventListener('error', () => rej(new Error('ws fail')), { once: true });
  });
  let id = 0;
  const pending = new Map();
  sock.addEventListener('message', (e) => {
    const m = JSON.parse(String(e.data));
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  });
  return {
    send: (method, params = {}) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, { res, rej });
      sock.send(JSON.stringify({ id: mid, method, params }));
    })
  };
}

let conn;
let wrote = 0;
try {
  let target = null;
  for (let i = 0; i < 120 && !target; i++) {
    const list = await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')
      .then((r) => r.json()).catch(() => []);
    target = list.find((t) => t.type === 'page');
    if (!target) await sleep(200);
  }
  if (!target) throw new Error('no page target');
  conn = await connect(target.webSocketDebuggerUrl);
  await conn.send('Page.enable');
  await conn.send('Runtime.enable');

  const evalMain = (expression) => conn.send('Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true });

  async function shoot(file, width, height) {
    await conn.send('Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 1, mobile: false });
    await sleep(350);
    const { data } = await conn.send('Page.captureScreenshot',
      { format: 'png', captureBeyondViewport: false });
    writeFileSync(file, Buffer.from(data, 'base64'));
    wrote += 1;
    console.log('  ' + path.relative(root, file) + '  ' + width + 'x' + height);
  }

  // --- screenshots of the real highlighting --------------------------------
  await conn.send('Page.navigate', { url: PAGE_URL });
  for (let i = 0; i < 60; i++) {
    const r = await evalMain('document.readyState');
    if (r.result.value === 'complete') break;
    await sleep(200);
  }
  await conn.send('Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(300);

  const { frameTree } = await conn.send('Page.getFrameTree');
  const { executionContextId } = await conn.send('Page.createIsolatedWorld',
    { frameId: frameTree.frame.id, worldName: 'store-assets' });
  for (const [label, src] of [['core.js', coreSrc], ['content.js', contentSrc]]) {
    const r = await conn.send('Runtime.evaluate',
      { expression: src, contextId: executionContextId, returnByValue: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(label + ' threw: ' +
        ((d.exception && d.exception.description) || d.text));
    }
  }
  const marks = (await evalMain(
    'document.querySelectorAll("mark.llm-cliche").length')).result.value;
  if (!marks) throw new Error('no highlights were produced');
  console.log('highlighted ' + marks + ' phrases; capturing...');

  // The fixture is about two screens tall, so two shots cover it without
  // repeating: the top (highlights, chain badges, and the nav bar left dark),
  // and the bottom (more badges, and the footer left dark).
  await evalMain('window.scrollTo(0, 0)');
  await shoot(path.join(outShots, '01-highlights-and-badges.png'), 1280, 800);

  await evalMain('window.scrollTo(0, document.body.scrollHeight)');
  await sleep(250);
  await shoot(path.join(outShots, '02-scope-header-footer-skipped.png'), 1280, 800);

  // --- promo tiles ----------------------------------------------------------
  for (const [name, w, h] of [['small-promo-440x280', 440, 280],
                              ['marquee-1400x560', 1400, 560]]) {
    await conn.send('Page.navigate',
      { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(promoHtml(w, h)) });
    await sleep(500);
    await shoot(path.join(outPromo, name + '.png'), w, h);
  }
} catch (err) {
  console.error('store-assets failed: ' + (err && err.stack ? err.stack : err));
  process.exitCode = 1;
} finally {
  chrome.kill('SIGKILL');
  server.close();
}

console.log(wrote + ' image(s) written to store/');
process.exit(process.exitCode || 0);
