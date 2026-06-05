// card-search.js
// Adds a search bar with autocomplete to quickly add cards by name.
// Drop this in js/ and load it from index.html after js/app.js.

(function () {
    'use strict';

    const PREFIX = 'frcs';          // namespace for our DOM ids / classes
    const MAX_SUGGESTIONS = 8;

    // --- helpers -----------------------------------------------------------

    // lowercase + strip accents so "doppelganger" matches "Doppelgänger"
    function normalize(str) {
        return (str || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    }

    // Pull the card name out of a list item, ignoring the strength badge.
    function cardNameFromLi(li) {
        const clone = li.cloneNode(true);
        clone.querySelectorAll('.badge').forEach(b => b.remove());
        return clone.textContent.replace(/\s+/g, ' ').trim();
    }

    // Read the card id from the inline onclick="addToView('id')" attribute.
    function cardIdFromLi(li) {
        const attr = li.getAttribute('onclick') || '';
        const m = attr.match(/addToView\(\s*['"]([^'"]+)['"]\s*\)/);
        return m ? m[1] : null;
    }

    // Ids of cards currently in the player's hand (i.e. already selected).
    // Each hand card renders as <div id="card-{id}" class="card">.
    function selectedIds() {
        const set = new Set();
        document.querySelectorAll('#hand div.card[id^="card-"]').forEach(el => {
            set.add(el.id.slice('card-'.length));
        });
        return set;
    }

    // --- index of available cards -----------------------------------------

    let cards = []; // { id, name, norm, el }

    function rebuildIndex() {
        const list = [];
        document.querySelectorAll('#cards li.list-group-item').forEach(li => {
            const id = cardIdFromLi(li);
            const name = cardNameFromLi(li);
            if (id && name) {
                list.push({ id, name, norm: normalize(name), el: li });
            }
        });
        cards = list;
    }

    function search(query) {
        const q = normalize(query);
        if (!q) return [];
        const scored = [];
        const selected = selectedIds();
        for (const c of cards) {
            if (selected.has(c.id)) continue;
            const idx = c.norm.indexOf(q);
            if (idx === -1) continue;
            // rank: exact (0) < starts-with (1) < word-start (2) < contains (3)
            let score = 3;
            if (c.norm === q) score = 0;
            else if (idx === 0) score = 1;
            else if (/\s/.test(c.norm.charAt(idx - 1))) score = 2;
            scored.push({ card: c, score, idx });
        }
        scored.sort((a, b) =>
            a.score - b.score ||
            a.idx - b.idx ||
            a.card.name.length - b.card.name.length ||
            a.card.name.localeCompare(b.card.name)
        );
        return scored.slice(0, MAX_SUGGESTIONS).map(s => ({ ...s.card, _q: q }));
    }

    function addCard(card) {
        // Trigger the page's own inline handler so behaviour (limits, sounds,
        // selection state) stays exactly as the site intends.
        card.el.click();
    }

    // --- UI ---------------------------------------------------------------

    let input, dropdown, results = [], active = -1;

    function injectStyles() {
        if (document.getElementById(PREFIX + '-styles')) return;
        const css = `
        #${PREFIX}-wrap { position: sticky; top: 0; z-index: 1050; padding: .5rem;
            background: var(--frcs-bg, #fff); }
        #${PREFIX}-input { width: 100%; box-sizing: border-box; padding: .5rem .75rem;
            font-size: 1rem; border: 1px solid #ced4da; border-radius: .375rem; }
        #${PREFIX}-input:focus { outline: none; border-color: #86b7fe;
            box-shadow: 0 0 0 .2rem rgba(13,110,253,.25); }
        #${PREFIX}-dropdown { position: relative; margin-top: 2px; }
        #${PREFIX}-list { list-style: none; margin: 0; padding: 0; position: absolute;
            left: 0; right: 0; background: #fff; border: 1px solid #ced4da;
            border-radius: .375rem; box-shadow: 0 6px 18px rgba(0,0,0,.18);
            max-height: 60vh; overflow-y: auto; }
        .${PREFIX}-item { padding: .45rem .75rem; cursor: pointer; display: flex;
            justify-content: space-between; gap: .5rem; border-bottom: 1px solid #f0f0f0; }
        .${PREFIX}-item:last-child { border-bottom: 0; }
        .${PREFIX}-item.active, .${PREFIX}-item:hover { background: #e9f2ff; }
        .${PREFIX}-item mark { background: transparent; color: inherit; font-weight: 700; padding: 0; }
        .${PREFIX}-empty { padding: .5rem .75rem; color: #888; }
        `;
        const style = document.createElement('style');
        style.id = PREFIX + '-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function highlight(name, q) {
        const norm = normalize(name);
        const i = norm.indexOf(q);
        if (i === -1) return document.createTextNode(name);
        // Map the match back onto the original (un-normalized) string by length.
        const frag = document.createDocumentFragment();
        frag.appendChild(document.createTextNode(name.slice(0, i)));
        const mark = document.createElement('mark');
        mark.textContent = name.slice(i, i + q.length);
        frag.appendChild(mark);
        frag.appendChild(document.createTextNode(name.slice(i + q.length)));
        return frag;
    }

    function renderDropdown() {
        dropdown.innerHTML = '';
        if (!input.value.trim()) return;

        const list = document.createElement('ul');
        list.id = PREFIX + '-list';

        if (results.length === 0) {
            const empty = document.createElement('li');
            empty.className = PREFIX + '-empty';
            empty.textContent = 'No matching cards';
            list.appendChild(empty);
        } else {
            results.forEach((card, i) => {
                const li = document.createElement('li');
                li.className = PREFIX + '-item' + (i === active ? ' active' : '');
                const name = document.createElement('span');
                name.appendChild(highlight(card.name, card._q));
                li.appendChild(name);
                // mousedown (not click) so it fires before the input blur closes us
                li.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    choose(i);
                });
                list.appendChild(li);
            });
        }
        dropdown.appendChild(list);
    }

    function choose(i) {
        const card = results[i];
        if (!card) return;
        addCard(card);
        input.value = '';
        results = [];
        active = -1;
        renderDropdown();
        input.focus(); // ready for the next card
    }

    function onInput() {
        results = search(input.value);
        active = results.length ? 0 : -1;
        renderDropdown();
    }

    function onKeyDown(e) {
        if (!results.length && e.key !== 'Escape') return;
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                active = (active + 1) % results.length;
                renderDropdown();
                break;
            case 'ArrowUp':
                e.preventDefault();
                active = (active - 1 + results.length) % results.length;
                renderDropdown();
                break;
            case 'Enter':
                e.preventDefault();
                if (active >= 0) choose(active);
                break;
            case 'Escape':
                input.value = '';
                results = [];
                active = -1;
                renderDropdown();
                break;
        }
    }

    function buildUI(leftPanel) {
        injectStyles();

        const wrap = document.createElement('div');
        wrap.id = PREFIX + '-wrap';

        input = document.createElement('input');
        input.id = PREFIX + '-input';
        input.type = 'text';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.placeholder = 'Search cards';

        dropdown = document.createElement('div');
        dropdown.id = PREFIX + '-dropdown';

        input.addEventListener('input', onInput);
        input.addEventListener('keydown', onKeyDown);
        input.addEventListener('focus', onInput);
        input.addEventListener('blur', () => {
            // small delay so a click on a suggestion still registers
            setTimeout(() => { if (document.activeElement !== input) { results = []; active = -1; renderDropdown(); } }, 120);
        });

        wrap.appendChild(input);
        wrap.appendChild(dropdown);

        // Place the search bar at the top of the left card column.
        leftPanel.insertBefore(wrap, leftPanel.firstChild);
    }

    // --- bootstrap --------------------------------------------------------

    function waitForCards(cb) {
        const tryNow = () => {
            const left = document.getElementById('left');
            const ready = left && document.querySelector('#cards li.list-group-item');
            if (ready) { cb(left); return true; }
            return false;
        };
        if (tryNow()) return;
        const obs = new MutationObserver(() => { if (tryNow()) obs.disconnect(); });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    function start() {
        waitForCards((left) => {
            rebuildIndex();
            buildUI(left);

            // The site re-renders #cards when language or expansion options change.
            // Rebuild the search index (and refresh element references) when it does.
            let t;
            const cardsEl = document.getElementById('cards');
            if (cardsEl) {
                const obs = new MutationObserver(() => {
                    clearTimeout(t);
                    t = setTimeout(() => {
                        rebuildIndex();
                        if (input && input.value.trim()) onInput();
                    }, 150);
                });
                obs.observe(cardsEl, { childList: true, subtree: true });
            }

            // When the hand changes (card added/removed), refresh suggestions so
            // already-selected cards drop out of the list immediately.
            const handEl = document.getElementById('hand');
            if (handEl) {
                let ht;
                const handObs = new MutationObserver(() => {
                    clearTimeout(ht);
                    ht = setTimeout(() => {
                        if (input && input.value.trim()) onInput();
                    }, 80);
                });
                handObs.observe(handEl, { childList: true, subtree: true });
            }
        });
    }

    // Loaded from <head>, so document.body may not exist yet — wait if needed.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
