
/*
 *  Generic "menu"-variant dropdown handler.
 *  Works for any button+panel pair produced by dropdown.html's
 *  dropdown_type="menu" branch, keyed off [data-dropdown-menu].
 *  No page-specific logic here -- selecting an option is the
 *  including page's responsibility (bind your own listeners to
 *  whatever's inside the panel).
 */

function initCombobox() {
  document.querySelectorAll('[data-combobox]').forEach(function (wrapper) {
    if (wrapper.dataset.comboboxBound) return;
    wrapper.dataset.comboboxBound = 'true';

    const textInput = wrapper.querySelector('input[type="text"]');
    const hiddenInput = wrapper.querySelector('input[type="hidden"]');
    const suggestions = wrapper.querySelector('[id$="Suggestions"]');
    if (!textInput || !hiddenInput || !suggestions) return;

    let options = [];
    try {
      options = JSON.parse(wrapper.dataset.comboboxOptions || '[]');
    } catch (e) {
      options = [];
    }

    function renderSuggestions(query) {
      const q = query.trim().toLowerCase();
      const matches = q ? options.filter(function (o) { return o[1].toLowerCase().includes(q); }) : options;

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
          textInput.value = item.dataset.label;
          hiddenInput.value = item.dataset.value;
          suggestions.classList.add('hidden');
          hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
    }

    textInput.addEventListener('focus', function () {
      renderSuggestions(textInput.value);
    });

    textInput.addEventListener('input', function () {
      // typing invalidates any previously selected value until a new
      // suggestion is explicitly clicked
      hiddenInput.value = '';
      renderSuggestions(textInput.value);
    });

    document.addEventListener('click', function (e) {
      if (!wrapper.contains(e.target)) {
        suggestions.classList.add('hidden');
      }
    });
  });
}

function initDropdowns() {
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