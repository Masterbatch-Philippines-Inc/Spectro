
/*
 *  Generic data-table engine.
 *  Page supplies: columns config, a dataset array, and callbacks.
 *  This file knows nothing about "samples" or "standards" specifically --
 *  it only knows how to render/sort/freeze/search whatever it's given.
 *
 *  Usage (from a page's own <script> block):
 *
 *    const table = createDataTable({
 *      headerRowId: 'headerRow',
 *      tableBodyId: 'tableBody',
 *      tableId: 'dataTable',
 *      columns: COLUMNS,          // [{ key, label, type: 'string'|'number'|'bool', render(row) }]
 *      getDataset: () => dataset, // function returning the current array
 *      leadingColumns: [          // optional extra columns before COLUMNS (checkbox, status icon, etc.)
 *        { id: 'select', width: 'w-[38px]', renderHeader: () => '...', renderCell: (row) => '...' }
 *      ],
 *      onBodyRendered: () => { ... }  // optional hook, fires after every renderBody()
 *    });
 *
 *    table.renderHeader();
 *    table.renderBody();
 *    table.applySort('de00');   // toggle sort by column key
 *    table.applyFreeze(3);      // freeze first N columns (0 = none)
 *    table.applySearch('query');
 */

function createDataTable(opts) {
  const headerRow = document.getElementById(opts.headerRowId);
  const tableBody = document.getElementById(opts.tableBodyId);
  const tableEl = document.getElementById(opts.tableId);
  const columns = opts.columns || [];
  const leadingColumns = opts.leadingColumns || [];
  const getDataset = opts.getDataset || function () { return []; };

  let sortState = { key: null, dir: 'asc' };
  let frozenColumnCount = 0;

  function colOffset() { return leadingColumns.length; }

  function renderHeader() {
    if (!headerRow) return;
    let html = '';

    leadingColumns.forEach(function (lc, idx) {
      html += '<th data-col-index="' + idx + '" class="th-sticky bg-foreground text-primary-foreground ' + (lc.width || '') + ' border-b border-foreground">' + lc.renderHeader() + '</th>';
    });

    columns.forEach(function (col, idx) {
      const isSorted = sortState.key === col.key;
      const arrowUp = isSorted && sortState.dir === 'asc';
      const base = col.headerClass || 'bg-foreground text-primary-foreground';
      html += '<th data-col-index="' + (idx + colOffset()) + '" class="th-sticky ' + base + ' border-b border-foreground whitespace-nowrap font-bold text-[10.5px] uppercase tracking-wide">'
        + '<button type="button" class="th-btn flex items-center gap-1.5 px-2.5 py-2 w-full hover:bg-white/10" data-sort-key="' + col.key + '">'
        + '<span>' + col.label + '</span>'
        + '<svg class="w-[9px] h-[9px] shrink-0 ' + (isSorted ? 'opacity-100' : 'opacity-35') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'
        + (isSorted
            ? (arrowUp ? '<polyline points="18 15 12 9 6 15"/>' : '<polyline points="6 9 12 15 18 9"/>')
            : '<polyline points="8 9 12 5 16 9"/><polyline points="8 15 12 19 16 15"/>')
        + '</svg></button></th>';
    });

    headerRow.innerHTML = html;

    headerRow.querySelectorAll('[data-sort-key]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applySort(btn.dataset.sortKey);
      });
    });

    if (opts.onHeaderRendered) opts.onHeaderRendered();
  }

  function applySort(key) {
    if (sortState.key === key) {
      sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
    } else {
      sortState.key = key;
      sortState.dir = 'asc';
    }

    const col = columns.find(function (c) { return c.key === key; });
    const dir = sortState.dir === 'asc' ? 1 : -1;
    const dataset = getDataset();

    dataset.sort(function (a, b) {
      let va = a[key], vb = b[key];
      if (col && col.type === 'number') {
        va = (va === null || va === undefined) ? -Infinity : va;
        vb = (vb === null || vb === undefined) ? -Infinity : vb;
        return (va - vb) * dir;
      }
      if (col && col.type === 'bool') {
        return ((va === true ? 1 : 0) - (vb === true ? 1 : 0)) * dir;
      }
      va = (va || '').toString().toLowerCase();
      vb = (vb || '').toString().toLowerCase();
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    renderHeader();
    renderBody();
  }

  function renderBody() {
    if (!tableBody) return;
    const dataset = getDataset();
    let html = '';

    dataset.forEach(function (row) {
      html += '<tr data-row-id="' + row.id + '" class="hover:bg-accent">';

      leadingColumns.forEach(function (lc, idx) {
        html += '<td data-col-index="' + idx + '" class="bg-card border-b border-border px-2.5 py-2">' + lc.renderCell(row) + '</td>';
      });

      columns.forEach(function (col, idx) {
        const content = col.render ? col.render(row) : (row[col.key] === null || row[col.key] === undefined ? '<span class="text-muted-foreground">-</span>' : row[col.key]);
        html += '<td data-col-index="' + (idx + colOffset()) + '" class="border-b border-border px-2.5 py-2 whitespace-nowrap">' + content + '</td>';
      });

      html += '</tr>';
    });

    tableBody.innerHTML = html;
    applyFreeze(frozenColumnCount);
    if (opts.onBodyRendered) opts.onBodyRendered();
  }

  function applyFreeze(count) {
    frozenColumnCount = count || 0;

    document.querySelectorAll('#' + opts.tableId + ' [data-col-index]').forEach(function (el) {
      el.classList.remove('col-sticky', 'bg-card');
      el.style.left = '';
    });

    if (frozenColumnCount <= 0) return;

    if (headerRow) {
      headerRow.querySelectorAll('th[data-col-index]').forEach(function (th) {
        const idx = parseInt(th.dataset.colIndex, 10);
        if (idx < frozenColumnCount) {
          const leftPx = th.offsetLeft; // measure BEFORE sticky kicks in
          th.classList.add('col-sticky');
          th.style.left = leftPx + 'px';
        }
      });
    }

    if (tableBody) {
      tableBody.querySelectorAll('tr').forEach(function (tr) {
        tr.querySelectorAll('td[data-col-index]').forEach(function (td) {
          const idx = parseInt(td.dataset.colIndex, 10);
          if (idx < frozenColumnCount) {
            const leftPx = td.offsetLeft; // measure BEFORE sticky kicks in
            td.classList.add('col-sticky', 'bg-card');
            td.style.left = leftPx + 'px';
          }
        });
      });
    }
  }

  function applySearch(query) {
    const q = (query || '').trim().toLowerCase();
    let visibleCount = 0;
    if (tableBody) {
      tableBody.querySelectorAll('tr').forEach(function (tr) {
        const text = tr.textContent.toLowerCase();
        const match = !q || text.includes(q);
        tr.style.display = match ? '' : 'none';
        if (match) visibleCount++;
      });
    }
    return visibleCount;
  }

  function showTable() {
    if (tableEl) tableEl.classList.remove('hidden');
  }

  function hideTable() {
    if (tableEl) tableEl.classList.add('hidden');
  }

  return {
    renderHeader: renderHeader,
    renderBody: renderBody,
    applySort: applySort,
    applyFreeze: applyFreeze,
    applySearch: applySearch,
    showTable: showTable,
    hideTable: hideTable,
    getSortState: function () { return sortState; },
    resetSort: function () { sortState = { key: null, dir: 'asc' }; },
  };
}