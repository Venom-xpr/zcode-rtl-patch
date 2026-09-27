/*
 * ZCode RTL Patch v1.4 — smart per-block text direction & Markazi Text font
 *
 * Makes right-to-left scripts (Arabic, Persian, Hebrew, Urdu, ...) flow in
 * the correct direction inside chat messages, markdown content and text
 * inputs.
 *
 * v1.4 Smart Direction Detection:
 *   - Ignores inline technical markup (<code>, <kbd>, <samp>, <pre>) when
 *     determining prose direction (e.g. `<code>/dashboard</code> → محتوا...`
 *     is correctly recognized as RTL).
 *   - Overall text balance: if RTL characters outnumber LTR characters, the
 *     block is RTL regardless of an English word starting the sentence.
 *   - Sentences starting with English technical terms/routes that finish with
 *     a Persian/Arabic explanation (e.g. `staff / sessions | همه جزئیات`)
 *     are recognized as RTL by checking significant RTL presence (>=20%)
 *     and sentence-ending RTL character or enclosing RTL message context.
 *   - Watched with scoped MutationObservers for live streaming and rich-text
 *     editors (Lexical).
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

  // Strong LTR scripts: Latin, Greek, Cyrillic, Armenian and Latin Extended
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

  // Extract plain text of an element EXCLUDING inline code markup
  // (<code>, <kbd>, <samp>, <pre>), so code prefixes don't skew detection.
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

  // Check if enclosing list, block, or message container is predominantly RTL
  function isEnclosingContextRtl(el) {
    if (!el || !el.parentElement) return false;
    // Check parent list (ul/ol) if sibling items are RTL
    var list = el.closest && el.closest('ul, ol');
    if (list) {
      var items = list.children;
      for (var i = 0; i < items.length; i++) {
        if (items[i] !== el && items[i].getAttribute('data-zc-rtl') === 'rtl') {
          return true;
        }
      }
    }
    // Check parent message / section text
    var parent = el.parentElement;
    if (parent && parent.getAttribute && parent.getAttribute('data-zc-rtl') === 'rtl') {
      return true;
    }
    return false;
  }

  /*
   * Smart Direction Heuristic:
   * 1. If only RTL characters exist -> 'rtl'
   * 2. If only LTR characters exist -> 'ltr'
   * 3. If prose outside <code> starts with RTL (e.g. `<code>/api</code> مسیر...`) -> 'rtl'
   * 4. Overall majority: if rtlCount > ltrCount -> 'rtl' (e.g. `'use client' رو حذف کردم`)
   * 5. Sentences starting with English terms that have meaningful RTL content (>=20% or >=6 chars)
   *    and either end in RTL (Persian predicate/verb) or are in an RTL context -> 'rtl'
   * 6. Otherwise fall back to first strong character of full text
   */
  function smartDirection(el, fullText) {
    if (!fullText) return null;
    var full = analyzeText(fullText);
    if (full.rtl === 0 && full.ltr === 0) return null;
    if (full.rtl > 0 && full.ltr === 0) return 'rtl';
    if (full.ltr > 0 && full.rtl === 0) return 'ltr';

    var proseText = el ? getProseText(el) : fullText;
    var prose = analyzeText(proseText);

    // Prose outside code blocks starts with RTL
    if (prose.firstStrong === 'rtl') return 'rtl';

    // Overall majority
    if (full.rtl > full.ltr) return 'rtl';

    // Significant RTL content (e.g. `staff / sessions / ... | ۲۰۰ همه → جزئیات سانس`)
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

  // Never touch anything on or inside these: code blocks, editors, terminals,
  // math, and app navigation chrome (sidebar, nav, header).
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
    var tag = BLOCK_TAGS[el.tagName];
    if (tag) return true;
    if (el.hasAttribute && el.hasAttribute('data-streamdown')) return true;
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
    // Content inside an editable root belongs to the editor (Lexical)
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
  }

  function evaluateEditable(el) {
    var text = el.value !== undefined ? el.value : el.textContent;
    var d = smartDirection(null, text);
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
        'caption, summary, address, td, th, [data-streamdown], div, ' +
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
    flushTimer = setTimeout(flush, 80);
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
