/*
 * ZCode RTL Patch v1.0 — automatic per-block text direction
 *
 * Makes right-to-left scripts (Arabic, Persian, Hebrew, Urdu, ...) flow in
 * the correct direction inside chat messages, markdown content and text
 * inputs. Detection follows the Unicode "first strong character" rule
 * (UAX #9 P2/P3): the first strongly directional letter decides whether a
 * paragraph is RTL or LTR. Neutral characters (punctuation, digits, emoji)
 * never decide the direction.
 *
 * Scope: text blocks (p, headings, list items, table cells, blockquotes,
 * plain-text message divs) and editable fields. Code blocks, terminals and
 * editor surfaces (Monaco / CodeMirror / xterm) are always kept LTR.
 */
(function () {
  'use strict';
  if (window.__zcodeRtlPatchActive) return;
  window.__zcodeRtlPatchActive = true;

  /* ------------------------------------------------------------------ *
   * Direction detection
   * ------------------------------------------------------------------ */

  // Strong RTL scripts: Hebrew (0590-05FF), Arabic (0600-06FF) minus the
  // Arabic-Indic (0660-0669) and Extended Arabic-Indic (06F0-06F9) digits
  // which are bidi-neutral, plus the 0700-08FF block (Syriac, Thaana, NKo,
  // Samaritan, Mandaic, Arabic Extended-A/B), Hebrew/Arabic presentation
  // forms (FB1D-FB4F, FB50-FDFF, FE70-FEFF), and Adlam (1E900-1E94F).
  var RTL_CHAR =
    /[\u0590-\u065F\u066A-\u066F\u0671-\u06EF\u06FA-\u08FF\uFB1D-\uFB4F\uFB50-\uFDFF\uFE70-\uFEFF]/;
  var RTL_ASTRAL = /\uD83A[\uDD00-\uDD4F]/; // Adlam surrogate pair

  // Strong LTR scripts worth detecting: Latin, Greek, Cyrillic, Armenian
  // and Latin Extended blocks. Everything else is neutral.
  var LTR_CHAR = new RegExp(
    '[A-Za-z\u00C0-\u02B8\u0370-\u0481\u048A-\u052F\u0531-\u058F\u1E00-\u1FFF]'
  );

  var MAX_SCAN = 5000; // chars examined when looking for the first strong char

  function firstStrongDirection(text) {
    if (!text) return null;
    var s = text.length > MAX_SCAN ? text.slice(0, MAX_SCAN) : text;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c >= '\uD800' && c <= '\uDBFF' && i + 1 < s.length) {
        c += s[i + 1];
        i++;
      }
      if (RTL_CHAR.test(c) || RTL_ASTRAL.test(c)) return 'rtl';
      if (LTR_CHAR.test(c)) return 'ltr';
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Element classification
   * ------------------------------------------------------------------ */

  // Block-level text containers whose own direction should be decided
  // from their content.
  var BLOCK_TAGS = {
    P: 1, LI: 1, BLOCKQUOTE: 1, DD: 1, DT: 1, FIGCAPTION: 1, CAPTION: 1,
    SUMMARY: 1, ADDRESS: 1, TD: 1, TH: 1,
    H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1
  };

  // Editable fields: direction follows typing (dir="auto" is re-evaluated
  // natively by Chromium on every input event).
  var EDITABLE_SELECTOR =
    'textarea, input:not([type]), input[type="text"], input[type="search"], ' +
    'input[type="email"], input[type="url"], input[type="tel"], ' +
    '[contenteditable="true"], [contenteditable=""]';

  // Never touch anything on or inside these.
  var SKIP_SELECTOR =
    'pre, code, kbd, samp, .katex, .monaco-editor, .xterm, .cm-editor, ' +
    '.cm-content, .ProseMirror-icon, [data-zc-rtl-skip]';

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
    var tag = BLOCK_TAGS[el.tagName];
    if (tag) return true;
    // Streamdown markdown blocks (ZCode's message renderer)
    if (el.hasAttribute && el.hasAttribute('data-streamdown')) return true;
    // Plain-text message bodies: pre-wrapped leaf blocks
    if (el.tagName === 'DIV' && !hasBlockChild(el)) {
      if (el.hasAttribute && el.hasAttribute('data-streamdown')) return true;
      var cs = getComputedStyle(el);
      if (cs.whiteSpace === 'pre' || cs.whiteSpace === 'pre-wrap') return true;
    }
    return false;
  }

  function shouldSkip(el) {
    if (!el || el.nodeType !== 1) return true;
    if (el === document.documentElement || el === document.body) return true;
    if (el.closest && el.closest(SKIP_SELECTOR)) return true;
    // Never fight an explicit dir the app itself set.
    if (el.hasAttribute('dir') && !el.hasAttribute('data-zc-rtl')) return true;
    return false;
  }

  /* ------------------------------------------------------------------ *
   * Applying direction
   * ------------------------------------------------------------------ */

  function applyDirection(el) {
    var d = firstStrongDirection(el.textContent);
    if (!d) return; // no strong character yet — keep previous state
    if (el.getAttribute('data-zc-dir-state') === d) return;
    el.setAttribute('dir', d);
    el.setAttribute('data-zc-rtl', d);
    el.setAttribute('data-zc-dir-state', d);
  }

  function patchEditable(el) {
    if (el.hasAttribute('data-zc-rtl-auto')) return;
    if (el.closest && el.closest(SKIP_SELECTOR)) return;
    if (el.hasAttribute('dir')) return; // app already controls this field
    el.setAttribute('dir', 'auto');
    el.setAttribute('data-zc-rtl-auto', '1');
    // dir="auto" is normally re-evaluated natively per keystroke, but any
    // author CSS `direction` on the field would override the UA rule, so
    // set the direction explicitly on input as well.
    el.addEventListener('input', onEditableInput);
  }

  function onEditableInput(e) {
    var el = e.currentTarget || e.target;
    if (!el || !el.isConnected) return;
    var text = el.value !== undefined ? el.value : el.textContent;
    var d = firstStrongDirection(text);
    if (!d) return; // neutral (empty/digits): keep current direction
    if (el.getAttribute('data-zc-dir-state') === d) return;
    el.setAttribute('dir', d);
    el.setAttribute('data-zc-rtl', d);
    el.setAttribute('data-zc-dir-state', d);
  }

  // For a text-node change, resolve the governing block ancestor.
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
    if (node.nodeType === 3) { // text node
      var block = blockAncestorOf(node);
      if (block && !shouldSkip(block)) queueElement(block);
      else if (node.parentElement && !shouldSkip(node.parentElement)) {
        queueElement(node.parentElement);
      }
      return;
    }
    if (node.nodeType !== 1) return;
    if (shouldSkip(node)) return;
    if (node.matches(EDITABLE_SELECTOR)) { patchEditable(node); return; }
    if (isCandidate(node)) queueElement(node);
    // Walk the subtree.
    var els;
    try {
      els = node.querySelectorAll(
        'p, h1, h2, h3, h4, h5, h6, li, blockquote, dd, dt, figcaption, ' +
        'caption, summary, address, td, th, [data-streamdown], div, ' +
        EDITABLE_SELECTOR
      );
    } catch (e) { return; }
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (shouldSkip(el)) continue;
      if (el.matches(EDITABLE_SELECTOR)) { patchEditable(el); continue; }
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
      try { applyDirection(el); } catch (e) { /* keep going */ }
    }
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(flush, 80);
  }

  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type === 'characterData') {
        scanNode(m.target);
      } else if (m.type === 'childList') {
        for (var j = 0; j < m.addedNodes.length; j++) scanNode(m.addedNodes[j]);
        // Removed nodes whose siblings remain can flip direction of the
        // parent block (e.g. trailing English word removed) — re-check.
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

  // Note: we deliberately do NOT observe `attributes` — our own dir writes
  // would otherwise retrigger the observer.
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
