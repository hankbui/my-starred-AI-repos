/* Shared whole-page translation for the GitHub Pages site.
 *
 * Ported from the browser app's in-place translation engine
 * (hanverse RN: pageTranslationScript.ts + usePageTranslation.ts + translationService.ts).
 *
 * How it works:
 *  - A fixed globe button (top-right) opens a small menu: English (default/off),
 *    Tiếng Việt, 简体中文.
 *  - Selecting a language translates the page IN-PLACE: we walk the DOM text nodes,
 *    skip code/pre/script/etc., batch-translate them through the free Google GTX API
 *    (translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=<lang>&dt=t&q=...),
 *    then set node.nodeValue back — preserving lead/trail whitespace only, so
 *    layout/classes are untouched and toggling off restores originals instantly.
 *  - The chosen language is stored in localStorage so it survives navigation and is
 *    applied automatically to every page you open from index.
 *  - Selecting English (or Stop) restores the original text and stops auto-translating.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'page-translate-lang';

    var LANGS = {
        en:   { label: 'English', native: 'English',      emoji: '🇬🇧' },
        vi:   { label: 'Vietnamese', native: 'Tiếng Việt', emoji: '🇻🇳' },
        'zh-CN': { label: 'Chinese (Simplified)', native: '简体中文', emoji: '🇨🇳' },
    };

    var SKIP_TAGS = {
        SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1, KBD: 1, SAMP: 1, VAR: 1,
        TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, SVG: 1, CANVAS: 1, IFRAME: 1, MATH: 1
    };

    var MAX_BATCH_LINES = 20;   // lines per GTX request (newline-delimited)
    var CHUNK = 40;             // text nodes collected before we ask for translation
    var DEBOUNCE_MS = 700;      // re-scan after lazy-loaded content mutates

    var totalPending = 0;
    var state = {
        active: false,
        targetLang: 'en',
        entries: [],
        tracked: new WeakSet(),
        observer: null,
        timer: null,
        queue: null,
    };

    // ---- GTX translation -----------------------------------------------------

    function translateGtx(text, target) {
        var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
            encodeURIComponent(target) + '&dt=t&q=' + encodeURIComponent(text);
        return fetch(url, { headers: { 'Accept': 'application/json' } })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
            .then(function (raw) {
                var data = JSON.parse(raw);
                if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('bad payload');
                var parts = [];
                for (var i = 0; i < data[0].length; i++) {
                    var seg = data[0][i];
                    if (Array.isArray(seg) && seg.length && seg[0]) parts.push(String(seg[0]));
                }
                return parts.join('').trim();
            });
    }

    // Translate many texts in as few requests as possible. Joining with '\n' keeps
    // line alignment with the gtx `dt=t` output; if the response desyncs, fall back
    // to per-line requests for that chunk so no node ever receives another node's text.
    function translateBatch(texts, target) {
        var sanitized = texts.map(function (t) { return t.replace(/\r?\n/g, ' ').trim(); });
        if (sanitized.some(function (t) { return !t; })) return Promise.reject(new Error('blank line'));
        var joined = sanitized.join('\n');
        return translateGtx(joined, target).then(function (translated) {
            var lines = translated.split('\n').map(function (l) { return l.trim(); });
            if (lines.length === texts.length) return lines;
            // Fallback: one request per line.
            return Promise.all(texts.map(function (t) {
                return translateGtx(t, target).catch(function () { return t; });
            }));
        });
    }

    // ---- DOM engine ----------------------------------------------------------

    function hasTranslatableText(value) {
        return /[A-Za-z\u00C0-\u024F\u0400-\u04FF\u0E00-\u0E7F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(value);
    }

    function isSkippable(node) {
        var el = node.parentNode;
        while (el && el.nodeType === 1) {
            if (SKIP_TAGS[el.tagName]) return true;
            if (el.isContentEditable) return true;
            if (el.getAttribute && el.getAttribute('translate') === 'no') return true;
            if (el.classList && el.classList.contains('notranslate')) return true;
            el = el.parentNode;
        }
        return false;
    }

    function collect() {
        if (!document.body) return [];
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        var fresh = [];
        var node;
        while ((node = walker.nextNode())) {
            if (state.tracked.has(node)) continue;
            if (node.parentNode && node.parentNode.id === 'page-translate-root') continue;
            var raw = node.nodeValue;
            if (!raw) continue;
            var text = raw.trim();
            if (!text || !hasTranslatableText(text)) continue;
            if (isSkippable(node)) continue;
            state.tracked.add(node);
            fresh.push({
                node: node,
                original: raw,
                text: text,
                lead: raw.match(/^\s*/)[0],
                trail: raw.match(/\s*$/)[0],
                current: raw,
            });
        }
        return fresh;
    }

    function applyValues(startIndex, values) {
        for (var i = 0; i < values.length; i++) {
            var entry = state.entries[startIndex + i];
            if (!entry) continue;
            if (entry.node.nodeValue !== entry.current) continue;
            var value = values[i];
            if (typeof value !== 'string' || !value) continue;
            entry.node.nodeValue = entry.lead + value + entry.trail;
            entry.current = entry.node.nodeValue;
        }
        totalPending--;
        updateSpinner();
    }

    function drainQueue() {
        if (state.queue && !state.queue.flushed) return;
        var fresh = [];
        // pick pending (untranslated) entries up to CHUNK
        for (var i = 0; i < state.entries.length && fresh.length < CHUNK; i++) {
            var t = state.entries[i];
            if (t.node.nodeValue === t.original) fresh.push(t);
        }
        if (!fresh.length) {
            state.active = false;
            updateSpinner();
            return;
        }
        var texts = fresh.map(function (t) { return t.text; });
        var startIndex = state.entries.indexOf(fresh[0]);
        totalPending += fresh.length;
        updateSpinner(true);
        translateBatch(texts, state.targetLang)
            .then(function (values) { applyValues(startIndex, values); })
            .catch(function () {
                totalPending = Math.max(0, totalPending - fresh.length);
                updateSpinner();
            })
            .then(function () {
                // continue until nothing left to do
                if (state.active && state.entries.some(function (t) { return t.node.nodeValue === t.original; })) {
                    setTimeout(drainQueue, 60);
                } else {
                    state.active = false;
                    updateSpinner();
                }
            });
    }

    function startObserver() {
        if (state.observer || typeof MutationObserver === 'undefined' || !document.body) return;
        state.observer = new MutationObserver(function () {
            if (!state.active) return;
            if (state.timer) clearTimeout(state.timer);
            state.timer = setTimeout(function () {
                state.timer = null;
                if (!state.active) return;
                var fresh = collect();
                state.entries = state.entries.concat(fresh);
                drainQueue();
            }, DEBOUNCE_MS);
        });
        state.observer.observe(document.body, { childList: true, subtree: true });
    }

    function stopObserver() {
        if (state.timer) { clearTimeout(state.timer); state.timer = null; }
        if (state.observer) { state.observer.disconnect(); state.observer = null; }
    }

    // ---- public controls -------------------------------------------------------

    function start(targetLang) {
        state.active = true;
        state.targetLang = targetLang || 'en';
        state.entries = [];
        state.tracked = new WeakSet();
        totalPending = 0;
        var fresh = collect();
        state.entries = fresh;
        updateMenu();
        updateSpinner(fresh.length > 0);
        startObserver();
        drainQueue();
    }

    function stop() {
        state.active = false;
        stopObserver();
        totalPending = 0;
        for (var i = 0; i < state.entries.length; i++) {
            var e = state.entries[i];
            if (e.node.nodeValue === e.current) e.node.nodeValue = e.original;
        }
        state.entries = [];
        state.tracked = new WeakSet();
        updateMenu();
        updateSpinner(false);
    }

    function applyTarget(lang) {
        try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
        if (lang === 'en') {
            stop();
        } else {
            start(lang);
        }
    }

    // ---- UI --------------------------------------------------------------------

    var root = null;
    var menu = null;
    var spinnerEl = null;

    function updateSpinner(show) {
        if (!spinnerEl) return;
        var busy = !!show;
        spinnerEl.style.display = busy ? 'inline-block' : 'none';
    }

    function updateMenu() {
        if (!menu) return;
        var current = state.active ? state.targetLang : 'en';
        var labels = menu.querySelectorAll('[data-lang]');
        labels.forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-lang') === current);
        });
    }

    function buildUI() {
        if (root) return;
        root = document.createElement('div');
        root.id = 'page-translate-root';
        root.setAttribute('translate', 'no');
        root.className = 'notranslate';

        var wrap = document.createElement('div');
        wrap.className = 'pt-wrap';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pt-toggle';
        btn.setAttribute('aria-label', 'Translate page');
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            menu.classList.toggle('open');
            root.classList.toggle('open');
        });

        var globe = document.createElement('span');
        globe.className = 'pt-globe';
        globe.setAttribute('aria-hidden', 'true');
        globe.innerHTML =
            '<span class="pt-earth"></span>' +
            '<span class="pt-orbit"><span class="pt-sat"></span></span>';

        spinnerEl = document.createElement('span');
        spinnerEl.className = 'pt-spinner';
        spinnerEl.style.display = 'none';

        btn.appendChild(globe);
        btn.appendChild(spinnerEl);

        menu = document.createElement('div');
        menu.className = 'pt-menu';

        menu.innerHTML =
            '<div class="pt-menu-title">Translate page</div>' +

            '<button type="button" class="pt-opt" data-lang="en" data-label="en">' +
                '<span class="pt-opt-emoji">🇬🇧</span><span class="pt-opt-label">English <em>· default</em></span>' +
                '<span class="pt-check">✓</span>' +
            '</button>' +

            '<button type="button" class="pt-opt" data-lang="vi">' +
                '<span class="pt-opt-emoji">🇻🇳</span><span class="pt-opt-label">Tiếng Việt <em>· Vietnamese</em></span>' +
                '<span class="pt-check">✓</span>' +
            '</button>' +

            '<button type="button" class="pt-opt" data-lang="zh-CN">' +
                '<span class="pt-opt-emoji">🇨🇳</span><span class="pt-opt-label">简体中文 <em>· Chinese</em></span>' +
                '<span class="pt-check">✓</span>' +
            '</button>' +

            '<div class="pt-divider"></div>' +
            '<button type="button" class="pt-stop" data-action="stop">✕ &nbsp;Stop translating</button>';

        menu.querySelectorAll('[data-lang]').forEach(function (opt) {
            opt.addEventListener('click', function () {
                applyTarget(opt.getAttribute('data-lang'));
                closeMenu();
            });
        });
        var stopBtn = menu.querySelector('[data-action="stop"]');
        if (stopBtn) stopBtn.addEventListener('click', function () {
            applyTarget('en');
            closeMenu();
        });

        wrap.appendChild(btn);
        wrap.appendChild(menu);
        root.appendChild(wrap);
        document.body.appendChild(root);

        document.addEventListener('click', function (e) {
            if (!root.contains(e.target)) closeMenu();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeMenu();
        });
        window.addEventListener('scroll', positionMenu, { passive: true });
        window.addEventListener('resize', positionMenu);
        positionMenu();
        updateMenu();
    }

    function closeMenu() {
        if (!root) return;
        root.classList.remove('open');
        if (menu) menu.classList.remove('open');
        updateMenu();
    }

    function positionMenu() {
        // Keep the little caret pointing at the toggle even under the fixed header.
        if (!root) return;
        var toggle = root.querySelector('.pt-toggle');
        if (!toggle) return;
        var r = toggle.getBoundingClientRect();
        var m = root.querySelector('.pt-menu');
        if (m) m.style.top = (r.bottom + 8) + 'px';
    }

    // ---- bootstrap -------------------------------------------------------------

    function boot() {
        buildUI();
        // Translate the current page if a non-English language was chosen before.
        var saved = 'en';
        try { saved = localStorage.getItem(STORAGE_KEY) || 'en'; } catch (e) {}
        if (saved && saved !== 'en' && LANGS[saved]) {
            // Wait for the page's own JS to render dynamic content, then translate.
            setTimeout(function () { start(saved); }, 300);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();