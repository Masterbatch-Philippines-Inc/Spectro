/*
 *  static/js/shared/ui/search_mentions.js
 *
 *  "@column: keyword" targeted search input helper. Typing "@" opens a
 *  kbd-style dropdown of allowed columns; selecting one inserts
 *  "@slug: " at the caret. Parses the full input into one or more
 *  {slug, key, keyword} mentions and builds a row-predicate matcher.
 *  Returns null from buildMatcher() when the input has no "@" at all,
 *  so the caller can fall back to its normal plain substring search.
 */

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// collapses "@@@" -> "@" and inserts a space before "@" when it directly
// follows a non-space character, so consecutive mentions never run
// together and stray duplicate "@" keystrokes can't accumulate.
function sanitizeValue(raw) {
  let v = raw.replace(/@+/g, '@');
  v = v.replace(/(\S)@/g, '$1 @');
  return v;
}

export function createMentionSearch(opts) {
  const input = opts.inputEl;
  const panel = opts.panelEl;
  const columns = opts.columns || []; // [{ slug, label, key }]
  const onChange = opts.onChange || function () {};

  if (!input || !panel) return { buildMatcher: function () { return null; }, refresh: function () {} };

  let highlightIndex = -1;
  const slugSet = new Set(columns.map(function (c) { return c.slug; }));

  // ---- highlighted overlay: input text stays transparent (caret only),
  // overlay renders the same text with "@slug:" tokens on an accent bg ----
  input.classList.add('mention-input');
  const overlay = document.createElement('div');
  overlay.className = 'absolute inset-0 px-2.5 py-1.5 text-[12.5px] whitespace-pre overflow-hidden pointer-events-none flex items-center rounded-md';
  input.insertAdjacentElement('afterend', overlay);

  function buildHighlightedHTML(value) {
    const re = /@([a-z0-9-]+):/gi;
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(value))) {
      if (!slugSet.has(m[1].toLowerCase())) continue;
      out += escapeHtml(value.slice(last, m.index));
      out += '<span class="bg-accent rounded px-0.5">' + escapeHtml(m[0]) + '</span>';
      last = re.lastIndex;
    }
    out += escapeHtml(value.slice(last));
    return out;
  }

  function renderOverlay() {
    overlay.innerHTML = buildHighlightedHTML(input.value);
    overlay.style.transform = 'translateX(-' + input.scrollLeft + 'px)';
  }

  ['input', 'scroll', 'click', 'keyup'].forEach(function (evt) {
    input.addEventListener(evt, renderOverlay);
  });

  // Backspace directly after a completed "@slug: " token deletes the
  // whole token in one press instead of eating it character by character.
  input.addEventListener('keydown', function (e) {
    if (e.key !== 'Backspace') return;
    if (input.selectionStart !== input.selectionEnd) return; // has a selection -- default behavior
    const pos = input.selectionStart;
    const value = input.value;
    const before = value.slice(0, pos);
    const m = before.match(/@[a-z0-9-]+:\s*$/i);
    if (!m) return;
    const slug = m[0].slice(1, m[0].indexOf(':')).toLowerCase();
    if (!slugSet.has(slug)) return;
    e.preventDefault();
    const start = pos - m[0].length;
    input.value = value.slice(0, start) + value.slice(pos);
    try { input.setSelectionRange(start, start); } catch (err) {}
    renderPanel();
    renderOverlay();
    onChange(buildMatcher(), input.value);
  });

  // finds the "@partial" token the caret is currently sitting inside,
  // stopping at the nearest preceding "@" -- null once a ":" has
  // already been typed (column is picked, no more suggestions needed).
  function activeMentionRange() {
    const pos = input.selectionStart;
    const value = input.value;
    const atIndex = value.lastIndexOf('@', pos - 1);
    if (atIndex === -1) return null;
    const between = value.slice(atIndex + 1, pos);
    if (between.includes('@') || between.includes(':')) return null;
    return { start: atIndex, end: pos, partial: between };
  }

  function closePanel() {
    panel.classList.add('hidden');
    panel.innerHTML = '';
  }

  function renderPanel() {
    const range = activeMentionRange();
    if (!range) { closePanel(); return; }

    const q = range.partial.trim().toLowerCase();
    const matches = q
      ? columns.filter(function (c) { return c.slug.includes(q) || c.label.toLowerCase().includes(q); })
      : columns;

    if (!matches.length) { closePanel(); return; }

    highlightIndex = -1;
    panel.innerHTML = matches.map(function (c) {
      return '<div class="px-3 py-2 text-[12.5px] cursor-pointer hover:bg-accent flex items-center justify-between gap-2" data-slug="' + c.slug + '">'
        + '<span>' + c.label + '</span>'
        + '<kbd class="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-accent text-muted-foreground">@' + c.slug + '</kbd>'
        + '</div>';
    }).join('');
    panel.classList.remove('hidden');

    panel.querySelectorAll('[data-slug]').forEach(function (el) {
      el.addEventListener('click', function () { commitMention(el.dataset.slug); });
    });
  }

  function commitMention(slug) {
    const range = activeMentionRange();
    if (!range) return;
    const before = input.value.slice(0, range.start);
    const after = input.value.slice(range.end);
    const insertion = '@' + slug + ': ';
    input.value = before + insertion + after;
    const caret = (before + insertion).length;
    input.focus();
    try { input.setSelectionRange(caret, caret); } catch (e) {}
    closePanel();
    onChange(buildMatcher(), input.value);
  }

  // Parses the full input into [{ slug, key, keyword }, ...]. Returns
  // null when there's no "@" at all (caller should fall back to plain
  // substring search).
  function parse() {
    const value = input.value;
    if (!value.includes('@')) return null;

    const parts = value.split('@').slice(1); // drop text before the first "@"
    const mentions = [];
    parts.forEach(function (part) {
      const colonIdx = part.indexOf(':');
      if (colonIdx === -1) return; // still typing the column name
      const slug = part.slice(0, colonIdx).trim().toLowerCase();
      const keyword = part.slice(colonIdx + 1).trim().toLowerCase();
      const col = columns.find(function (c) { return c.slug === slug; });
      if (!col || !keyword) return;
      mentions.push({ slug: slug, key: col.key, keyword: keyword });
    });
    return mentions;
  }

  function buildMatcher() {
    const mentions = parse();
    if (mentions === null) return null;
    if (!mentions.length) return function () { return true; }; // "@" typed, no complete mention yet
    return function (row) {
      return mentions.every(function (m) {
        const val = row[m.key];
        return val !== null && val !== undefined && String(val).toLowerCase().includes(m.keyword);
      });
    };
  }

  input.addEventListener('input', function () {
    const pos = input.selectionStart;
    const before = input.value;
    const sanitized = sanitizeValue(before);
    if (sanitized !== before) {
      const diff = sanitized.length - before.length;
      input.value = sanitized;
      const newPos = Math.max(0, pos + diff);
      try { input.setSelectionRange(newPos, newPos); } catch (e) {}
    }
    renderPanel();
    renderOverlay();
    onChange(buildMatcher(), input.value);
  });

  input.addEventListener('keydown', function (e) {
    const items = panel.querySelectorAll('[data-slug]');
    const visible = !panel.classList.contains('hidden') && items.length;
    if (!visible) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightIndex = Math.min(highlightIndex + 1, items.length - 1);
      items.forEach(function (el, i) { el.classList.toggle('bg-accent', i === highlightIndex); });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightIndex = Math.max(highlightIndex - 1, 0);
      items.forEach(function (el, i) { el.classList.toggle('bg-accent', i === highlightIndex); });
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      commitMention(items[highlightIndex].dataset.slug);
    } else if (e.key === 'Escape') {
      closePanel();
    }
  });

  document.addEventListener('click', function (e) {
    if (!input.contains(e.target) && !panel.contains(e.target)) closePanel();
  });

  renderOverlay();

  return {
    buildMatcher: buildMatcher,
    // call after programmatically setting input.value (restore from
    // session, clear button) so the overlay/matcher stay in sync
    refresh: function () { renderOverlay(); return buildMatcher(); },
  };
}