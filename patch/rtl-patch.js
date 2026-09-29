/*
 * ZCode RTL Patch v1.6 — comprehensive smart text direction & Markazi typography
 *
 * Covers:
 *   1. Assistant messages (Streamdown markdown paragraphs, headings, lists, tables)
 *   2. User messages (v4 user input bubbles & collapsible content)
 *   3. Message Composer (Lexical rich-text editor with multi-paragraph line-by-line direction)
 *   4. Standalone inputs & textareas
 *   5. Protected surfaces (code, math, terminals, sidebar/navigation chrome)
 */
(function () {
  'use strict';
  if (window.__zcodeRtlPatchActive) return;
  window.__zcodeRtlPatchActive = true;

  /* ------------------------------------------------------------------ *
   * Direction detection
   * ------------------------------------------------------------------ */

  var RTL_CHAR =
    /[\u0590-\u065F\u066A-\u066F\u0671-\u06EF\u06FA-\u08FF\uFB1D-\uFB4F\uFB50-\uFDFF\uFE70-\uFEFF]/;
  var RTL_ASTRAL = /\uD83A[\uDD00-\uDD4F]/; // Adlam surrogate pair

  var LTR_CHAR = new RegExp(
    '[A-Za-z\u00C0-\u02B8\u0370-\u0481\u048A-\u052F\u0531-\u058F\u1E00-\u1FFF]'
  );

  var MAX_SCAN = 5000;

  function analyzeText(text) {
    var rtl = 0, ltr = 0, firstStrong = null, lastStrong = null;
    if (!text) return { rtl: rtl, ltr: ltr, firstStrong: firstStrong, lastStrong: lastStrong };
    var s = text.length > MAX_SCAN ? text.slice(0, MAX_SCAN) : text;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c >= '\uD800' && c <= '\uDBFF' && i + 1 < s.length) {
        c += s[i + 1];
        i++;
      }
      if (RTL_CHAR.test(c) || RTL_ASTRAL.test(c)) {
        rtl++;
        if (!firstStrong) firstStrong = 'rtl';
        lastStrong = 'rtl';
      } else if (LTR_CHAR.test(c)) {
        ltr++;
        if (!firstStrong) firstStrong = 'ltr';
        lastStrong = 'ltr';
      }
    }
    return { rtl: rtl, ltr: ltr, firstStrong: firstStrong, lastStrong: lastStrong };
  }

  function getProseText(el) {
    var text = '';
    function walk(node) {
      if (!node) return;
      if (node.nodeType === 3) {
        text += node.nodeValue;
        return;
      }
      if (node.nodeType === 1) {
        var tag = node.tagName;
        if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP' || tag === 'PRE') return;
        if (node.hasAttribute && node.hasAttribute('data-zc-rtl-skip')) return;
        for (var child = node.firstChild; child; child = child.nextSibling) {
          walk(child);
        }
      }
    }
    walk(el);
    return text;
  }

  function isEnclosingContextRtl(el) {
    if (!el || !el.parentElement) return false;
    var list = el.closest && el.closest('ul, ol');
    if (list) {
      var items = list.children;
      for (var i = 0; i < items.length; i++) {
        if (items[i] !== el && items[i].getAttribute('data-zc-rtl') === 'rtl') {
          return true;
        }
      }
    }
    var parent = el.parentElement;
    if (parent && parent.getAttribute && parent.getAttribute('data-zc-rtl') === 'rtl') {
      return true;
    }
    return false;
  }

  function smartDirection(el, fullText) {
    if (!fullText) return null;
    var full = analyzeText(fullText);
    if (full.rtl === 0 && full.ltr === 0) return null;
    if (full.rtl > 0 && full.ltr === 0) return 'rtl';
    if (full.ltr > 0 && full.rtl === 0) return 'ltr';

    var proseText = el ? getProseText(el) : fullText;
    var prose = analyzeText(proseText);

    if (prose.firstStrong === 'rtl') return 'rtl';
    if (full.rtl > full.ltr) return 'rtl';

    var totalStrong = full.rtl + full.ltr;
    var rtlRatio = totalStrong > 0 ? (full.rtl / totalStrong) : 0;
    if (full.rtl >= 5 && (rtlRatio >= 0.20 || full.rtl >= 10)) {
      if (full.lastStrong === 'rtl' || isEnclosingContextRtl(el)) {
        return 'rtl';
      }
    }

    return full.firstStrong || 'ltr';
  }

  /* ------------------------------------------------------------------ *
   * Element classification
   * ------------------------------------------------------------------ */

  var BLOCK_TAGS = {
    P: 1, LI: 1, BLOCKQUOTE: 1, DD: 1, DT: 1, FIGCAPTION: 1, CAPTION: 1,
    SUMMARY: 1, ADDRESS: 1, TD: 1, TH: 1,
    H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1
  };

  var EDITABLE_SELECTOR =
    'textarea, input:not([type]), input[type="text"], input[type="search"], ' +
    'input[type="email"], input[type="url"], input[type="tel"], ' +
    '[contenteditable="true"], [contenteditable=""], ' +
    '[contenteditable="plaintext-only"]';

  var SKIP_SELECTOR =
    'pre, code, kbd, samp, .katex, .monaco-editor, .xterm, .cm-editor, ' +
    '.cm-content, .ProseMirror-icon, #sidebar, [data-workspace-sidebar-panel], ' +
    'nav, aside, [role="navigation"], header, [data-zc-rtl-skip]';

  function isBlockLevelTag(el) {
    var t = el.tagName;
    if (BLOCK_TAGS[t]) return true;
    switch (t) {
      case 'DIV': case 'UL': case 'OL': case 'TABLE': case 'PRE':
      case 'SECTION': case 'ARTICLE': case 'HEADER': case 'FOOTER':
      case 'FIGURE': case 'DL': case 'ASIDE': case 'MAIN': case 'NAV':
      case 'FORM': case 'HR':
        return true;
      default:
        return false;
    }
  }

  function hasBlockChild(el) {
    for (var i = 0; i < el.children.length; i++) {
      if (isBlockLevelTag(el.children[i])) return true;
    }
    return false;
  }

  function isCandidate(el) {
    if (!el || el.nodeType !== 1) return false;
    // Explicit ZCode user message containers
    if (el.hasAttribute && (
      el.hasAttribute('data-v4-user-input-collapsible-content') ||
      el.hasAttribute('data-v4-user-input-bubble')
    )) return true;

    var tag = BLOCK_TAGS[el.tagName];
    if (tag) return true;
    if (el.hasAttribute && el.hasAttribute('data-streamdown')) return true;

    // Divs with whitespace-pre-wrap class (user messages or plain message blocks)
    if (el.tagName === 'DIV' && el.classList && el.classList.contains('whitespace-pre-wrap')) {
      return true;
    }

    if (el.tagName === 'DIV' && !hasBlockChild(el)) {
      if (el.hasAttribute && el.hasAttribute('data-streamdown')) return true;
      var cs = getComputedStyle(el);
      if (cs.whiteSpace === 'pre' || cs.whiteSpace === 'pre-wrap') return true;
    }
    return false;
  }

  function isEditable(el) {
    return !!(el && el.matches && el.matches(EDITABLE_SELECTOR));
  }

  function shouldSkip(el) {
    if (!el || el.nodeType !== 1) return true;
    if (el === document.documentElement || el === document.body) return true;
    if (el.closest && el.closest(SKIP_SELECTOR)) return true;
    // Editable fields are claimed by patchEditable — never skip them
    if (isEditable(el)) return false;
    // Content inside an editable root is handled by evaluateEditableChildren,
    // so skip from normal document query
    if (el.closest && el.closest(EDITABLE_SELECTOR)) return true;
    // Never fight an explicit dir set on a non-patch block
    if (el.hasAttribute('dir') && !el.hasAttribute('data-zc-rtl')) return true;
    return false;
  }

  /* ------------------------------------------------------------------ *
   * Applying direction
   * ------------------------------------------------------------------ */

  function applyDirection(el) {
    var d = smartDirection(el, el.textContent);
    if (!d) return;
    if (el.getAttribute('data-zc-dir-state') === d) return;
    el.setAttribute('dir', d);
    el.setAttribute('data-zc-rtl', d);
    el.setAttribute('data-zc-dir-state', d);

    // If this is a user message bubble or collapsible content, propagate to bubble
    if (el.hasAttribute('data-v4-user-input-collapsible-content')) {
      var bubble = el.closest('[data-v4-user-input-bubble]');
      if (bubble) {
        bubble.setAttribute('dir', d);
        bubble.setAttribute('data-zc-rtl', d);
        bubble.setAttribute('data-zc-dir-state', d);
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Editable Fields (Composer / Inputs / Lexical Rich Text)
   * ------------------------------------------------------------------ */

  function evaluateEditable(el) {
    if (!el || !el.isConnected) return;

    // In rich-text editors (like Lexical), paragraphs (<p>, <div>) are rendered
    // for each line/block. Evaluate each paragraph independently so mixed
    // messages (e.g. Line 1: 'Hi' [LTR], Line 2: Persian [RTL]) format correctly.
    var paragraphs = el.querySelectorAll ? el.querySelectorAll('p, div[role="paragraph"]') : null;
    var hasRtlChild = false;
    if (paragraphs && paragraphs.length > 0) {
      for (var i = 0; i < paragraphs.length; i++) {
        var p = paragraphs[i];
        if (p.parentElement !== el && p.closest('p')) continue;
        var pText = p.textContent;
        var pd = smartDirection(p, pText);
        if (pd) {
          if (pd === 'rtl') hasRtlChild = true;
          if (p.getAttribute('data-zc-dir-state') !== pd) {
            p.setAttribute('dir', pd);
            p.setAttribute('data-zc-rtl', pd);
            p.setAttribute('data-zc-dir-state', pd);
          }
        }
      }
    }

    var text = el.value !== undefined ? el.value : el.textContent;
    var d = smartDirection(null, text);
    if (!d && hasRtlChild) d = 'rtl';
    if (!d) return;
    if (el.getAttribute('data-zc-dir-state') === d) return;
    el.setAttribute('dir', d);
    el.setAttribute('data-zc-rtl', d);
    el.setAttribute('data-zc-dir-state', d);
  }

  function onEditableInput(e) {
    var el = e.currentTarget || e.target;
    if (el && el.isConnected) evaluateEditable(el);
  }

  function watchEditable(el) {
    try {
      var mo = new MutationObserver(function () { evaluateEditable(el); });
      mo.observe(el, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['dir']
      });
    } catch (e) {}
    evaluateEditable(el);
  }

  function patchEditable(el) {
    if (el.hasAttribute('data-zc-rtl-auto')) return;
    if (el.closest && el.closest(SKIP_SELECTOR)) return;
    el.setAttribute('data-zc-rtl-auto', '1');
    if (!el.hasAttribute('dir')) el.setAttribute('dir', 'auto');
    el.addEventListener('input', onEditableInput);
    watchEditable(el);
  }

  function blockAncestorOf(node) {
    var el = node && node.parentElement;
    while (el && el !== document.body) {
      if (isCandidate(el)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function queueElement(el) {
    if (!pendingSet.has(el)) {
      pendingSet.add(el);
      pendingList.push(el);
    }
  }

  function scanNode(node) {
    if (!node) return;
    if (node.nodeType === 3) {
      var block = blockAncestorOf(node);
      if (block && !shouldSkip(block)) queueElement(block);
      else if (node.parentElement && !shouldSkip(node.parentElement)) {
        queueElement(node.parentElement);
      }
      return;
    }
    if (node.nodeType !== 1) return;
    if (shouldSkip(node)) return;
    if (isEditable(node)) { patchEditable(node); return; }
    if (isCandidate(node)) queueElement(node);

    var els;
    try {
      els = node.querySelectorAll(
        'p, h1, h2, h3, h4, h5, h6, li, blockquote, dd, dt, figcaption, ' +
        'caption, summary, address, td, th, [data-streamdown], ' +
        '[data-v4-user-input-collapsible-content], [data-v4-user-input-bubble], ' +
        '.whitespace-pre-wrap, div, ' +
        EDITABLE_SELECTOR
      );
    } catch (e) { return; }
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (shouldSkip(el)) continue;
      if (isEditable(el)) { patchEditable(el); continue; }
      if (isCandidate(el)) queueElement(el);
    }
  }

  /* ------------------------------------------------------------------ *
   * Throttled flush + observer
   * ------------------------------------------------------------------ */

  var pendingList = [];
  var pendingSet = new Set();
  var flushTimer = null;

  function flush() {
    flushTimer = null;
    var list = pendingList;
    pendingList = [];
    pendingSet = new Set();
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (!el || !el.isConnected) continue;
      try { applyDirection(el); } catch (e) {}
    }
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(flush, 50);
  }

  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type === 'characterData') {
        scanNode(m.target);
      } else if (m.type === 'childList') {
        for (var j = 0; j < m.addedNodes.length; j++) scanNode(m.addedNodes[j]);
        if (m.removedNodes.length && m.target && m.target.nodeType === 1 &&
            !shouldSkip(m.target) && isCandidate(m.target)) {
          queueElement(m.target);
        }
      }
    }
    scheduleFlush();
  });

  function fullScan() {
    if (!document.body) return;
    scanNode(document.body);
    scheduleFlush();
  }

  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fullScan);
    document.addEventListener('load', fullScan, true);
  } else {
    fullScan();
  }
})();
