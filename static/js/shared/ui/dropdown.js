
/*
 *  Generic "menu"-variant dropdown handler.
 *  Works for any button+panel pair produced by dropdown.html's
 *  dropdown_type="menu" branch, keyed off [data-dropdown-menu].
 *  No page-specific logic here -- selecting an option is the
 *  including page's responsibility (bind your own listeners to
 *  whatever's inside the panel).
 */

export function initCombobox() {
  document.querySelectorAll('[data-combobox]').forEach(function (wrapper) {
    if (wrapper.dataset.comboboxBound) return;
    wrapper.dataset.comboboxBound = 'true';

    const textInput = wrapper.querySelector('input[type="text"]');
    const hiddenInput = wrapper.querySelector('input[type="hidden"]');
    const suggestions = wrapper.querySelector('[id$="Suggestions"]');
    if (!textInput || !hiddenInput || !suggestions) return;

    // Remote mode (data-combobox-remote-url): options are NOT dumped to
    // the client -- every keystroke (debounced) queries the server for
    // just the matching codes instead of filtering a full local list.
    const remoteUrl = wrapper.dataset.comboboxRemoteUrl || null;
    const DEBOUNCE_MS = 300;
    let debounceTimer = null;
    let requestSeq = 0; // guards a stale, slow response from overwriting a newer one

    let options = [];
    if (!remoteUrl) {
      try {
        options = JSON.parse(wrapper.dataset.comboboxOptions || '[]');
      } catch (e) {
        options = [];
      }
    }

    let highlightedIndex = -1;
    let committed = { value: hiddenInput.value || '', label: textInput.value || '' };

    function selectOption(item) {
      textInput.value = item.dataset.label;
      hiddenInput.value = item.dataset.value;
      committed = { value: item.dataset.value, label: item.dataset.label };
      suggestions.classList.add('hidden');
      hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function setHighlight(index) {
      const items = suggestions.querySelectorAll('[data-value]');
      items.forEach(function (el) { el.classList.remove('bg-accent'); });
      if (index >= 0 && index < items.length) {
        items[index].classList.add('bg-accent');
        items[index].scrollIntoView({ block: 'nearest' });
      }
      highlightedIndex = index;
    }

    function renderMatches(matches) {
      highlightedIndex = -1;

      if (!matches.length) {
        suggestions.innerHTML = '<div class="px-3 py-2 text-[12.5px] text-muted-foreground italic">Try different keyword</div>';
        suggestions.classList.remove('hidden');
        return;
      }

      suggestions.innerHTML = matches.map(function (o) {
        return '<div class="px-3 py-2 text-[12.5px] cursor-pointer hover:bg-accent" data-value="' + o[0] + '" data-label="' + o[1] + '">' + o[1] + '</div>';
      }).join('');
      suggestions.classList.remove('hidden');

      suggestions.querySelectorAll('[data-value]').forEach(function (item) {
        item.addEventListener('click', function () {
          selectOption(item);
        });
      });
    }

    function renderSuggestionsLocal(query) {
      const q = query.trim().toLowerCase();
      const matches = q ? options.filter(function (o) { return o[1].toLowerCase().includes(q); }) : options;
      renderMatches(matches);
    }

    function renderSuggestionsRemote(query) {
      const q = query.trim();
      if (!q) {
        suggestions.classList.add('hidden');
        suggestions.innerHTML = '';
        return;
      }
      const seq = ++requestSeq;
      fetch(remoteUrl + '?q=' + encodeURIComponent(q), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (seq !== requestSeq) return; // superseded -- drop stale response
          const matches = (data.results || []).map(function (code) { return [code, code]; });
          renderMatches(matches);
        })
        .catch(function () {
          if (seq !== requestSeq) return;
          suggestions.innerHTML = '<div class="px-3 py-2 text-[12.5px] text-muted-foreground italic">Search failed</div>';
          suggestions.classList.remove('hidden');
        });
    }

    function renderSuggestions(query) {
      if (!remoteUrl) {
        renderSuggestionsLocal(query);
        return;
      }
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () { renderSuggestionsRemote(query); }, DEBOUNCE_MS);
    }

    textInput.addEventListener('focus', function () {
      if (!remoteUrl) renderSuggestions(textInput.value);
    });

    textInput.addEventListener('input', function () {
      // typing invalidates any previously selected value until a new
      // suggestion is explicitly clicked
      hiddenInput.value = '';
      renderSuggestions(textInput.value);
    });

    textInput.addEventListener('keydown', function (e) {
      const items = suggestions.querySelectorAll('[data-value]');
      if (suggestions.classList.contains('hidden') || !items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight(Math.min(highlightedIndex + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight(Math.max(highlightedIndex - 1, 0));
      } else if (e.key === 'Enter' && highlightedIndex >= 0) {
        e.preventDefault();
        selectOption(items[highlightedIndex]);
      } else if (e.key === 'Escape') {
        suggestions.classList.add('hidden');
      }
    });

    // 6b: leaving the input empty (no explicit selection made) reverts
    // to whatever was last actually committed, instead of clearing it
    textInput.addEventListener('blur', function () {
      setTimeout(function () {
        if (!hiddenInput.value) {
          textInput.value = committed.label;
          hiddenInput.value = committed.value;
        }
      }, 150); // let a suggestion click register first
    });

    document.addEventListener('click', function (e) {
      if (!wrapper.contains(e.target)) {
        suggestions.classList.add('hidden');
      }
    });
  });
}

export function initDropdowns() {
  document.querySelectorAll('[data-dropdown-menu]').forEach(function (wrapper) {
    if (wrapper.dataset.dropdownBound) return;
    wrapper.dataset.dropdownBound = 'true';

    const btn = wrapper.querySelector('[id$="Btn"]');
    const panel = wrapper.querySelector('[id$="Panel"]');
    if (!btn || !panel) return;

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      document.querySelectorAll('[data-dropdown-menu] [id$="Panel"]').forEach(function (p) {
        if (p !== panel) p.classList.add('hidden');
      });
      panel.classList.toggle('hidden');
    });

    document.addEventListener('click', function (e) {
      if (!panel.classList.contains('hidden') && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        panel.classList.add('hidden');
      }
    });
  });
}