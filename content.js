// LLM Cliché Highlighter — content script.
//
// Original code (Copyright 2026 Bruno Renié, Apache License 2.0 — see
// LICENSE). Written for this extension; it drives core.js, whose pattern
// engine is derived from llm-cliche-highlighter.html in
// https://github.com/simonw/tools (Copyright 2026 Simon Willison).
//
// Injected after core.js when the toolbar button is clicked. Walks the page's
// main content, builds a plain-text view with an offset map back to the DOM,
// runs the pattern detectors from core.js over it, and wraps each match in a
// <mark>. Highlights are the state: running this file a second time removes
// them, so a toolbar click toggles highlighting on and off.

(function () {
  'use strict';

  const core = window.LLMCliche;
  const MARK_CLASS = 'llm-cliche';
  const STYLE_ID = 'llm-cliche-styles';
  const MAX_TEXT = 1000000;

  // Subtrees whose text is never prose.
  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'INPUT',
    'SELECT', 'OPTION', 'IFRAME', 'FRAME', 'OBJECT', 'EMBED', 'SVG',
    'MATH', 'CANVAS', 'VIDEO', 'AUDIO', 'MAP'
  ]);

  // Block-level elements, used as a heuristic for visual line breaks: when
  // the nearest block ancestor of consecutive text nodes changes, a '\n' is
  // inserted in the virtual text so sentence-level patterns still behave.
  const BLOCK_TAGS = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DETAILS', 'DIALOG',
    'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HGROUP', 'LI', 'MAIN',
    'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT',
    'TH', 'THEAD', 'TR', 'UL'
  ]);

  function selectRoot() {
    return document.querySelector('article') ||
      document.querySelector('main') ||
      document.querySelector('[role="main"]') ||
      document.body;
  }

  function blockAncestor(el, root) {
    let e = el;
    while (e && e !== root && e !== document.body) {
      if (BLOCK_TAGS.has(e.tagName)) return e;
      e = e.parentElement;
    }
    return root;
  }

  function collectSegments(root) {
    const segs = [];
    let text = '';
    let prevBlock = null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        let el = node.parentElement;
        while (el) {
          if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
          if (el.hasAttribute('hidden')) return NodeFilter.FILTER_REJECT;
          el = el.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const value = node.nodeValue;
      const block = blockAncestor(node.parentElement, root);
      const brBefore = !!(node.previousSibling &&
        node.previousSibling.nodeType === 1 &&
        node.previousSibling.tagName === 'BR');
      if (text && (block !== prevBlock || brBefore)) text += '\n';
      segs.push({ node, start: text.length, end: text.length + value.length });
      text += value;
      prevBlock = block;
    }
    return { text, segs };
  }

  // Fragments of [from, to) per text node. Segs are contiguous and ordered.
  function findFragments(segs, from, to) {
    const frags = [];
    for (const seg of segs) {
      if (seg.end <= from) continue;
      if (seg.start >= to) break;
      frags.push({
        node: seg.node,
        a: Math.max(from, seg.start) - seg.start,
        b: Math.min(to, seg.end) - seg.start
      });
    }
    return frags;
  }

  // Splits text nodes at the fragment edges and replaces them with <mark>
  // elements. The original phrase is kept in data-text so removal restores
  // exactly what was there (the badge <sup> must not leak into the text).
  function wrapMatch(segs, from, to, m) {
    const frags = findFragments(segs, from, to);
    for (let i = frags.length - 1; i >= 0; i--) {
      const { node, a, b } = frags[i];
      if (b <= a) continue;
      let startNode = node;
      if (b < node.nodeValue.length) node.splitText(b);
      if (a > 0) startNode = node.splitText(a);
      const mark = document.createElement('mark');
      mark.className = MARK_CLASS;
      mark.dataset.pattern = m.patternId;
      mark.dataset.text = startNode.nodeValue;
      mark.textContent = startNode.nodeValue;
      if (i === frags.length - 1 && m.badge != null) {
        const sup = document.createElement('sup');
        sup.className = MARK_CLASS + '-badge';
        sup.textContent = m.badge;
        sup.title = m.badgeTitle || '';
        mark.appendChild(sup);
      }
      mark.title = core.matchTipText(
        core.patternsById[m.patternId].name, m.badgeTitle);
      startNode.replaceWith(mark);
    }
  }

  function removeHighlights() {
    for (const mark of document.querySelectorAll('mark.' + MARK_CLASS)) {
      const parent = mark.parentNode;
      if (!parent) continue;
      parent.replaceChild(document.createTextNode(
        mark.dataset.text != null ? mark.dataset.text : mark.textContent), mark);
      parent.normalize();
    }
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      'mark.llm-cliche {',
      '  background: #fcd34d;',
      '  border-radius: 3px;',
      '  padding: 1px 2px;',
      '  cursor: help;',
      '}',
      'mark.llm-cliche:hover {',
      '  outline: 2px solid #b45309;',
      '}',
      'mark.llm-cliche sup.llm-cliche-badge {',
      '  margin-left: 3px;',
      '  padding: 1px 5px;',
      '  background: #92400e;',
      '  color: #fff;',
      '  border-radius: 999px;',
      '  font-size: 11px;',
      '  font-weight: bold;',
      '  line-height: 1;',
      '  position: relative;',
      '  top: -2px;',
      '}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  function report(result) {
    if (typeof chrome !== 'undefined' && chrome.runtime &&
        chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(
        { type: 'cliche-toggled', active: result.active, count: result.count })
        .catch(() => {});
    }
  }

  function toggle() {
    if (document.querySelector('mark.' + MARK_CLASS)) {
      removeHighlights();
      const result = { active: false, count: 0 };
      report(result);
      return result;
    }
    const root = selectRoot();
    if (!core || !root) return { active: false, count: 0 };
    ensureStyles();
    const { text, segs } = collectSegments(root);
    const enabled = new Set(core.patterns.map(p => p.id));
    const slice = text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;
    const { matches } = core.collectMatches(slice, enabled);
    const clamped = [];
    for (const m of matches) {
      let s = m.start;
      let e = m.end;
      while (s < e && /\s/.test(slice[s])) s += 1;
      while (e > s && /\s/.test(slice[e - 1])) e -= 1;
      if (e > s) clamped.push({ m, s, e });
    }
    for (let i = clamped.length - 1; i >= 0; i -= 1) {
      wrapMatch(segs, clamped[i].s, clamped[i].e, clamped[i].m);
    }
    const result = { active: true, count: clamped.length };
    report(result);
    return result;
  }

  if (core) {
    window.__llmClicheToggle = toggle;
    toggle();
  }
})();
