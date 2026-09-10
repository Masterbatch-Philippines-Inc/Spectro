
/*
 *  Generic data-table engine.
 *  Page supplies: columns config, a dataset array, and callbacks.
 *
 *  Adds: per-column hide/show (via right-click context menu on the
 *  header, or externally via setColumnHidden()/toggleColumn()) and
 *  per-column manual resize (drag the right edge of any header cell).
 *  Both features apply only to `columns` (not `leadingColumns`).
 *
 *  Default state: nothing hidden, no custom widths -- state only
 *  changes when the user explicitly hides/shows or resizes a column.
 */

export function createDataTable(opts) {
  const headerRow = document.getElementById(opts.headerRowId);
  const tableBody = document.getElementById(opts.tableBodyId);
  const tableEl = document.getElementById(opts.tableId);
  const columns = opts.columns || [];
  const leadingColumns = opts.leadingColumns || [];
  const getDataset = opts.getDataset || function () { return []; };

  let sortState = { key: null, dir: 'asc' };
  let frozenColumnCount = 0;

  // ---- column visibility + width state (default: all visible, no custom widths) ----
  const hiddenKeys = new Set();
  const colWidths = {}; // key -> px number

  function colOffset() { return leadingColumns.length; }

  function visibleColumns() {
    return columns.filter(function (c) { return !hiddenKeys.has(c.key); });
  }

  function notifyColumnStateChanged() {
    if (opts.onColumnStateChange) opts.onColumnStateChange();
  }

  /* ---- context menu (right-click a header cell -> Hide Column) ---- */
  let ctxMenuEl = null;
  function closeContextMenu() {
    if (ctxMenuEl) { ctxMenuEl.remove(); ctxMenuEl = null; }
  }
  document.addEventListener('click', closeContextMenu);
  document.addEventListener('scroll', closeContextMenu, true);

  function openContextMenu(x, y, col) {
    closeContextMenu();
    ctxMenuEl = document.createElement('div');
    ctxMenuEl.className = 'fixed z-[200] bg-card border border-border rounded-md shadow-lg py-1 text-[12.5px]';
    ctxMenuEl.style.left = x + 'px';
    ctxMenuEl.style.top = y + 'px';
    ctxMenuEl.innerHTML = '<button type="button" class="block w-full text-left px-3 py-1.5 hover:bg-accent cursor-pointer">Hide Column</button>';
    document.body.appendChild(ctxMenuEl);
    ctxMenuEl.querySelector('button').addEventListener('click', function (e) {
      e.stopPropagation();
      setColumnHidden(col.key, true);
      closeContextMenu();
    });
  }

  /* ---- resize handling ---- */
  const MIN_COL_WIDTH = 48;
  let resizing = null; // { key, startX, startWidth }

  function widthStyle(col) {
    const w = colWidths[col.key];
    return w ? ('width:' + w + 'px; min-width:' + w + 'px; max-width:' + w + 'px;') : '';
  }

  function applyColumnWidthsToDom() {
    visibleColumns().forEach(function (col, idx) {
      const realIdx = idx + colOffset();
      const w = colWidths[col.key];
      if (!w) return;
      document.querySelectorAll('#' + opts.tableId + ' [data-col-index="' + realIdx + '"]').forEach(function (el) {
        el.style.width = w + 'px';
        el.style.minWidth = w + 'px';
        el.style.maxWidth = w + 'px';
      });
    });
  }

  function startResize(e, col, th) {
    e.preventDefault();
    e.stopPropagation();
    const startWidth = th.getBoundingClientRect().width;
    resizing = { key: col.key, startX: e.clientX, startWidth: startWidth };
    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', onResizeEnd);
  }

  function onResizeMove(e) {
    if (!resizing) return;
    const delta = e.clientX - resizing.startX;
    const newWidth = Math.max(MIN_COL_WIDTH, Math.round(resizing.startWidth + delta));
    colWidths[resizing.key] = newWidth;
    applyColumnWidthsToDom();
  }

  function onResizeEnd() {
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeEnd);
    resizing = null;
  }

  function renderHeader() {
    if (!headerRow) return;
    let html = '';

    leadingColumns.forEach(function (lc, idx) {
      html += '<th data-col-index="' + idx + '" class="th-sticky bg-foreground text-primary-foreground ' + (lc.width || '') + ' border-b border-foreground">' + lc.renderHeader() + '</th>';
    });

    visibleColumns().forEach(function (col, idx) {
      const isSorted = sortState.key === col.key;
      const arrowUp = isSorted && sortState.dir === 'asc';
      const base = col.headerClass || 'bg-foreground text-primary-foreground';
      html += '<th data-col-key="' + col.key + '" data-col-index="' + (idx + colOffset()) + '" style="' + widthStyle(col) + '" class="th-sticky relative ' + base + ' border-b border-foreground whitespace-nowrap font-bold text-[10.5px] uppercase tracking-wide">'
        + '<button type="button" class="th-btn flex items-center gap-1.5 px-2.5 py-2 w-full hover:bg-white/10" data-sort-key="' + col.key + '">'
        + '<span>' + col.label + '</span>'
        + '<svg class="w-[9px] h-[9px] shrink-0 ' + (isSorted ? 'opacity-100' : 'opacity-35') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'
        + (isSorted
            ? (arrowUp ? '<polyline points="18 15 12 9 6 15"/>' : '<polyline points="6 9 12 15 18 9"/>')
            : '<polyline points="8 9 12 5 16 9"/><polyline points="8 15 12 19 16 15"/>')
        + '</svg></button>'
        + '<div data-resize-handle class="absolute top-0 right-0 h-full w-[6px] cursor-col-resize select-none" style="touch-action:none;"></div>'
        + '</th>';
    });

    headerRow.innerHTML = html;

    headerRow.querySelectorAll('[data-sort-key]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applySort(btn.dataset.sortKey);
      });
    });

    headerRow.querySelectorAll('th[data-col-key]').forEach(function (th) {
      const key = th.dataset.colKey;
      const col = columns.find(function (c) { return c.key === key; });
      if (!col) return;

      th.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY, col);
      });

      const handle = th.querySelector('[data-resize-handle]');
      if (handle) {
        handle.addEventListener('mousedown', function (e) { startResize(e, col, th); });
      }
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
    const visCols = visibleColumns();
    let html = '';

    dataset.forEach(function (row) {
      html += '<tr data-row-id="' + row.id + '" class="hover:bg-accent">';

      leadingColumns.forEach(function (lc, idx) {
        html += '<td data-col-index="' + idx + '" class="bg-card border-b border-border px-2.5 py-2">' + lc.renderCell(row) + '</td>';
      });

      visCols.forEach(function (col, idx) {
        const content = col.render ? col.render(row) : (row[col.key] === null || row[col.key] === undefined ? '<span class="text-muted-foreground">-</span>' : row[col.key]);
        html += '<td data-col-index="' + (idx + colOffset()) + '" style="' + widthStyle(col) + '" class="border-b border-border px-2.5 py-2 whitespace-nowrap">' + content + '</td>';
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

  /* ---- column visibility public API ---- */
  function setColumnHidden(key, hidden) {
    if (hidden) hiddenKeys.add(key); else hiddenKeys.delete(key);
    renderHeader();
    renderBody();
    notifyColumnStateChanged();
  }

  function toggleColumn(key) {
    setColumnHidden(key, !hiddenKeys.has(key));
  }

  function getColumnState() {
    return columns.map(function (c) {
      return { key: c.key, label: c.label, hidden: hiddenKeys.has(c.key) };
    });
  }

  function resetColumnState() {
    hiddenKeys.clear();
    Object.keys(colWidths).forEach(function (k) { delete colWidths[k]; });
    renderHeader();
    renderBody();
    notifyColumnStateChanged();
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
    setColumnHidden: setColumnHidden,
    toggleColumn: toggleColumn,
    getColumnState: getColumnState,
    resetColumnState: resetColumnState,
  };
}