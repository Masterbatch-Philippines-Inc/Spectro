
/*
 *  static/js/pages/samples_record.js
 */

import { createDataTable } from "../ui/table.js";
import { showToast } from "../global/toast.js";
import { renderScatter } from "../ui/scatter_graph.js";
import { getCsrfToken } from "../utils/csrf.js";

// sessionStorage key the Samples Reader wizard reads on load to pick up
// a "Re-Read Selected Samples" carry-over payload. See
// static/js/shared/pages/samples_reader.js's initRereadFlow().
const REREAD_PAYLOAD_SESSION_KEY = 'spectroRereadPayload';

function isReferenceRow(row) {
  const name = (row.stickerLot || '').trim().toUpperCase();
  return name.startsWith('LT ') || name.startsWith('DR ');
}

export function initSamplesRecordPage(urls) {
  const COLUMNS = [
    {
      key: 'colorSimulation', label: 'Color Simulation', type: 'string',
      render: function (row) {
        if (!row.colorSimulation || row.colorSimulation === '-') return '<span class="text-muted-foreground">-</span>';
        const cssColor = '#' + row.colorSimulation.replace('#', '');
        return '<div class="flex items-center gap-1.5"><span class="w-5 h-5 rounded border border-border shrink-0" style="background:' + cssColor + ';" title="' + row.colorSimulation + '"></span><span>' + row.colorSimulation + '</span></div>';
      }
    },
    { key: 'dateTime',    label: 'Date and Time',      type: 'string' },
    { key: 'stickerLot',  label: 'Sticker Lot Number', type: 'string' },
    { key: 'bag',         label: 'Bag Number',         type: 'string' },
    { key: 'internalLot', label: 'Internal Lot',       type: 'string' },
    { key: 'de00',        label: 'ΔE*00',              type: 'number' },
    { key: 'L',           label: 'L*',                 type: 'number' },
    { key: 'C',           label: 'C*',                 type: 'number' },
    { key: 'h',           label: 'h°',                 type: 'number' },
    { key: 'a',           label: 'a*',                 type: 'number' },
    { key: 'b',           label: 'b*',                 type: 'number' },
    { key: 'dL',          label: 'ΔL*',                type: 'number' },
    { key: 'dC',          label: 'ΔC*',                type: 'number' },
    { key: 'dH',          label: 'ΔH*',                type: 'number' },
    { key: 'da',          label: 'Δa*',                type: 'number' },
    { key: 'db',          label: 'Δb*',                type: 'number' },
    { key: 'colorOffset', label: 'Color Offset',       type: 'string' },
    {
      key: 'spectroJudgement', label: 'Spectro Judgement', type: 'string',
      render: function (row) {
        if (row.spectroJudgement === '-') return '<span class="text-muted-foreground">-</span>';
        return row.spectroJudgement === 'PASSED'
          ? '<span class="font-bold text-success">Pass</span>'
          : '<span class="font-bold text-danger">Fail</span>';
      }
    },
    {
      key: 'visualJudgement', label: 'Visual Judgement', type: 'string',
      render: function (row) {
        const vjColor = row.visualJudgement === 'Pass'
          ? 'text-success'
          : (row.visualJudgement === 'Fail' ? 'text-danger' : 'text-muted-foreground');
        return '<select class="visual-judgement-select font-bold text-[11.5px] px-2 py-1 pr-6 rounded-md border border-border bg-card min-w-[110px] cursor-pointer ' + vjColor + '" data-row-id="' + row.id + '" style="color:' + (row.visualJudgement === 'Pass' ? 'hsl(var(--success))' : (row.visualJudgement === 'Fail' ? 'hsl(var(--danger))' : '')) + ';">'
          + '<option value=""' + (row.visualJudgement === '' ? ' selected' : '') + '>None</option>'
          + '<option value="Pass"' + (row.visualJudgement === 'Pass' ? ' selected' : '') + '>Passed</option>'
          + '<option value="Fail"' + (row.visualJudgement === 'Fail' ? ' selected' : '') + '>Failed</option>'
          + '</select>';
      }
    },
    {
      key: 'finalQcEval', label: 'Final QC Evaluation', type: 'string',
      render: function (row) {
        if (!row.finalQcEval || row.finalQcEval === '-') return '<span class="text-muted-foreground">-</span>';
        const val = String(row.finalQcEval).toUpperCase();
        if (val === 'PASSED') {
          return '<span class="font-bold text-[11px] px-2 py-0.5 rounded-full bg-success-bg text-success border border-success-border">' + row.finalQcEval + '</span>';
        }
        if (val === 'FAILED') {
          return '<span class="font-bold text-[11px] px-2 py-0.5 rounded-full bg-danger-bg text-danger border border-danger-border">' + row.finalQcEval + '</span>';
        }
        return '<span>' + row.finalQcEval + '</span>';
      }
    },
    {
      key: 'reasonIfFail', label: 'Reason for Fail (if not color)', type: 'editable',
      render: function (row) {
        const empty = !row.reasonIfFail;
        return '<div class="editable-cell rounded-md px-1.5 py-1 cursor-text min-w-[140px] max-w-[220px] whitespace-normal ' + (empty ? 'text-muted-foreground italic' : '') + '" data-action="reasonIfFail" data-row-id="' + row.id + '">' + (empty ? 'Click to add…' : row.reasonIfFail) + '</div>';
      }
    },
    {
      key: 'spectroRemarks', label: 'Spectro Remarks', type: 'editable',
      render: function (row) {
        const empty = !row.spectroRemarks;
        return '<div class="editable-cell rounded-md px-1.5 py-1 cursor-text min-w-[140px] max-w-[220px] whitespace-normal ' + (empty ? 'text-muted-foreground italic' : '') + '" data-action="spectroRemarks" data-row-id="' + row.id + '">' + (empty ? 'Click to add…' : row.spectroRemarks) + '</div>';
      }
    },
    {
      key: 'specialPass', label: 'Special Pass?', type: 'bool',
      render: function (row) {
        return '<div class="text-center"><input type="checkbox" class="special-pass-checkbox w-3.5 h-3.5 accent-foreground cursor-pointer" data-row-id="' + row.id + '"' + (row.specialPass ? ' checked' : '') + '></div>';
      }
    },
    {
      key: 'specialPassBy', label: 'Special Pass BY', type: 'select',
      render: function (row) {
        const disabled = !row.specialPass;
        const options = ['Ana Solomon', 'Jinky Villacampa', 'Ernie Pio', 'Elton Ang'];
        return '<select class="special-pass-by-select text-[11.5px] px-2 py-1 pr-6 rounded-md border border-border bg-card min-w-[110px] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed disabled:bg-muted" data-row-id="' + row.id + '"' + (disabled ? ' disabled' : '') + '>'
          + '<option value=""' + (row.specialPassBy ? '' : ' selected') + '>Select…</option>'
          + options.map(function (name) { return '<option' + (row.specialPassBy === name ? ' selected' : '') + '>' + name + '</option>'; }).join('')
          + '</select>';
      }
    },
  ];

  let dataset = [];
  let selectedRows = new Set();
  let currentProductCode = null;
  let currentStandardId = null;
  let currentStandardName = null;
  let currentStdDeUsed = null;
  let currentStandardRaw = null; // { raw_l, raw_a, raw_b, raw_c, raw_h }

  // Task 4: default sort on load -- DR-prefixed sticker lots first,
  // then LT-prefixed, then everything else, each group keeping the
  // server's original relative order (stable sort).
  function defaultSortRank(row) {
    const name = (row.stickerLot || '').trim().toUpperCase();
    if (name.startsWith('DR')) return 0;
    if (name.startsWith('LT')) return 1;
    return 2;
  }

  function applyDefaultSort(rows) {
    return rows
      .map(function (row, index) { return { row: row, index: index }; })
      .sort(function (a, b) {
        const rankDiff = defaultSortRank(a.row) - defaultSortRank(b.row);
        return rankDiff !== 0 ? rankDiff : a.index - b.index;
      })
      .map(function (entry) { return entry.row; });
  }

  // ---- Re-Read Selected Samples: enable/disable button + lock the
  // Standard dropdown globally the moment any checkbox is ticked, so
  // there's never a mix of selections spanning more than one standard
  // (avoids needing separate cross-standard-selection handling). ----
  function refreshRereadControls() {
    const rereadBtn = document.getElementById('rereadSelectedBtn');
    const standardFilter = document.getElementById('standardFilter');
    const standardFilterBtn = document.getElementById('standardFilterBtn');
    const hasSelection = selectedRows.size > 0;
    // Disabling the standard dropdown should only depend on (a) rows
    // being selected for re-read, or (b) there being no standards to
    // choose from at all -- NOT on whether the currently selected
    // standard happens to have zero samples loaded. A standard with no
    // samples yet is still a valid, switchable option.
    const hasStandardOptions = standardFilter
      ? Array.from(standardFilter.options).some(function (opt) { return opt.value !== ''; })
      : false;
    const shouldDisable = hasSelection || !hasStandardOptions;
    if (rereadBtn) rereadBtn.disabled = !hasSelection;
    if (standardFilter) standardFilter.disabled = shouldDisable;
    if (standardFilterBtn) standardFilterBtn.disabled = shouldDisable;
  }

  const leadingColumns = [
    {
      renderHeader: function () {
        return '';
      },
      renderCell: function (row) {
        const isPass = row.spectroJudgement === 'PASSED';
        const label = row.spectroJudgement === '-' ? '-' : (isPass ? 'Pass' : 'Fail');
        const dotColor = row.spectroJudgement === '-' ? 'bg-muted-foreground' : (isPass ? 'bg-success' : 'bg-danger');
        return '<div class="flex items-center justify-center" data-tooltip="Spectro Judgement: ' + label + '"><span class="w-2.5 h-2.5 rounded-full inline-block ' + dotColor + '"></span></div>';
      },
      width: 'w-9',
    },
    {
      renderHeader: function () {
        return '<div class="flex items-center justify-center py-2"><input type="checkbox" id="selectAllCheckbox" class="w-3.5 h-3.5 accent-white cursor-pointer"></div>';
      },
      renderCell: function (row) {
        // LT/DR reference rows can't be carried into a re-read session --
        // disable their checkbox entirely rather than allow ticking them.
        if (isReferenceRow(row)) {
          return '<div class="flex items-center justify-center" data-tooltip="Reference rows cannot be re-read from here"><input type="checkbox" class="row-checkbox w-3.5 h-3.5 accent-foreground cursor-not-allowed" data-row-id="' + row.id + '" disabled></div>';
        }
        const checked = selectedRows.has(String(row.id)) ? 'checked' : '';
        return '<div class="flex items-center justify-center"><input type="checkbox" class="row-checkbox w-3.5 h-3.5 accent-foreground cursor-pointer" data-row-id="' + row.id + '" ' + checked + '></div>';
      },
      width: 'w-[38px]',
    },
    {
      renderHeader: function () { return ''; },
      renderCell: function (row) {
        let icon;
        if (row.qcMatch === 'ok') {
          icon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--success))" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        } else if (row.qcMatch === 'anomaly') {
          icon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--warn))" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>';
        } else if (row.qcMatch === 'reference') {
          icon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>';
        } else {
          icon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--danger))" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        }
        return '<div class="flex items-center justify-center" data-tooltip="' + (row.qcMessage || '') + '">' + icon + '</div>';
      },
      width: 'w-9',
    },
  ];

  const PRODUCT_CODE_SESSION_KEY = 'spectroSamplesRecordProductCode';
  const STANDARD_SESSION_KEY = 'spectroSamplesRecordStandardId';
  const SEARCH_SESSION_KEY = 'spectroSamplesRecordSearchQuery';
  let searchRestoredFromSession = false;

  window.addEventListener('load', function () {
    const productCodeFilter = document.getElementById('productCodeFilterValue');
    const productCodeFilterText = document.getElementById('productCodeFilter');
    const standardFilter = document.getElementById('standardFilter');
    const standardFilterBtn = document.getElementById('standardFilterBtn');
    const standardFilterLabel = document.getElementById('standardFilterLabel');
    const standardFilterPanel = document.getElementById('standardFilterPanel');

    // Keeps the custom standard dropdown (button label + panel list) in
    // sync with the hidden native <select id="standardFilter">, which
    // remains the single source of truth for value/disabled state so
    // the rest of this file's existing logic doesn't need to change.
    function syncStandardFilterUI(standardsList) {
      if (!standardFilterBtn || !standardFilterLabel || !standardFilterPanel) return;

      standardFilterBtn.disabled = standardFilter.disabled;

      let list = standardsList;
      if (!list) {
        list = Array.from(standardFilter.options)
          .filter(function (opt) { return opt.value !== ''; })
          .map(function (opt) { return { standards_id: opt.value, standard_name: opt.textContent }; });
      }

      const standardFilterTitleHtml = '<div class="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground px-1.5 pb-1 select-none">Select a Standard</div>';

      if (!list.length) {
        standardFilterPanel.innerHTML = standardFilterTitleHtml + '<div class="px-3 py-2 text-[12.5px] text-muted-foreground italic cursor-default select-none">No standard found</div>';
      } else {
        standardFilterPanel.innerHTML = standardFilterTitleHtml + list.map(function (std) {
          const selected = String(std.standards_id) === String(standardFilter.value);
          return '<div class="px-3 py-2 text-[12.5px] rounded cursor-pointer hover:bg-accent' + (selected ? ' bg-accent font-semibold' : '') + '" data-standards-id="' + std.standards_id + '">' + std.standard_name + '</div>';
        }).join('');

        standardFilterPanel.querySelectorAll('[data-standards-id]').forEach(function (item) {
          item.addEventListener('click', function () {
            standardFilter.value = item.dataset.standardsId;
            standardFilterPanel.classList.add('hidden');
            standardFilter.dispatchEvent(new Event('change', { bubbles: true }));
          });
        });
      }

      const selectedOption = standardFilter.options[standardFilter.selectedIndex];
      // No placeholder once a standard is actually chosen.
      standardFilterLabel.textContent = (standardFilter.value && selectedOption) ? selectedOption.textContent : 'Standards';
    }

    const emptyState = document.getElementById('emptyState');
    const noResultsState = document.getElementById('noResultsState');
    const searchInput = document.getElementById('searchInput');
    const generateReportBtn = document.getElementById('generateReportBtn');
    const rereadSelectedBtn = document.getElementById('rereadSelectedBtn');

    if (generateReportBtn) {
      generateReportBtn.addEventListener('click', function () {
        if (!standardFilter.value || dataset.length === 0) return;
        let url = urls.exportReport + '?standards_id=' + encodeURIComponent(standardFilter.value);
        if (selectedRows.size > 0) {
          url += '&lot_sample_ids=' + encodeURIComponent(Array.from(selectedRows).join(','));
        }
        window.location.href = url;
      });
    }

    if (rereadSelectedBtn) {
      rereadSelectedBtn.addEventListener('click', function () {
        if (selectedRows.size === 0) {
          showToast('toastStack', 'Tick at least one sample to re-read.', 'info');
          return;
        }
        if (!currentStandardId || !currentProductCode || !currentStandardRaw) {
          showToast('toastStack', 'Missing standard/product code data — cannot start re-read.', 'danger');
          return;
        }

        // Build straight from the already-loaded in-memory dataset --
        // no extra DB queries needed, everything required (product
        // code, standard raw values/ΔE, and each selected lot's own
        // identity/name/bag) is already sitting in `dataset`.
        const selectedLots = dataset
          .filter(function (r) { return selectedRows.has(String(r.id)); })
          .map(function (r) {
            return {
              lotSampleId: r.lotSampleId,
              stickerLot: r.stickerLot,
              bag: (r.bag && r.bag !== 'N/A') ? r.bag : '',
            };
          });

        const payload = {
          productCode: currentProductCode,
          standardsId: currentStandardId,
          standardName: currentStandardName,
          stdDe: currentStdDeUsed,
          raw: currentStandardRaw,
          lots: selectedLots,
        };

        try {
          sessionStorage.setItem('spectroRereadPayload', JSON.stringify(payload));
        } catch (e) {
          showToast('toastStack', 'Could not prepare re-read session — please try again.', 'danger');
          return;
        }

        window.location.href = urls.samplesReader + '?reread=1';
      });
    }
    const columnVisibilityDropdownBtn = document.getElementById('columnVisibilityDropdownBtn');
    const columnVisibilityDropdownPanel = document.getElementById('columnVisibilityDropdownPanel');

    function renderColumnVisibilityPanel() {
      if (!columnVisibilityDropdownPanel) return;

      // preserve the scrollable list's current scroll position across
      // re-renders, so ticking a checkbox further down the list doesn't
      // visually jump the panel back to the top.
      const prevScrollEl = columnVisibilityDropdownPanel.querySelector('[data-column-list]');
      const prevScrollTop = prevScrollEl ? prevScrollEl.scrollTop : 0;

      const state = dataTable.getColumnState();
      let html = '<div class="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground px-1.5 pb-1">Show/Hide Columns</div>';
      html += '<div data-column-list class="max-h-[280px] overflow-y-auto flex flex-col gap-0.5">';
      state.forEach(function (col) {
        html += '<label class="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-accent cursor-pointer text-[12px]">'
          + '<input type="checkbox" class="column-visibility-option w-3.5 h-3.5 accent-foreground cursor-pointer" data-col-key="' + col.key + '"' + (col.hidden ? '' : ' checked') + '>'
          + '<span>' + col.label + '</span></label>';
      });
      html += '</div>';
      columnVisibilityDropdownPanel.innerHTML = html;

      const scrollEl = columnVisibilityDropdownPanel.querySelector('[data-column-list]');
      if (scrollEl) scrollEl.scrollTop = prevScrollTop;

      columnVisibilityDropdownPanel.querySelectorAll('.column-visibility-option').forEach(function (checkbox) {
        checkbox.addEventListener('change', function () {
          dataTable.setColumnHidden(checkbox.dataset.colKey, !checkbox.checked);
        });
      });
    }

    window.getScatterPlotPoints = function () {
      const base = dataset.filter(function (r) { return r.da !== null && r.db !== null && r.da !== undefined && r.db !== undefined; });
      const visible = selectedRows.size === 0 ? base : base.filter(function (r) { return selectedRows.has(String(r.id)); });
      return visible.map(function (r) {
        return {
          id: r.id,
          name: r.stickerLot,
          da: r.da,
          db: r.db,
          rawA: r.a,
          rawB: r.b,
          passed: r.spectroJudgement === 'PASSED',
        };
      });
    };

    function makeEditableCellSaveable(cell) {
      if (cell.querySelector('input')) return;
      const rowId = cell.dataset.rowId;
      const action = cell.dataset.action;
      const row = dataset.find(function (r) { return String(r.id) === String(rowId); });
      if (!row) return;

      const currentVal = row[action] || '';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = currentVal;
      input.placeholder = 'Type a value…';
      input.className = 'w-full text-xs border border-ring rounded-md px-2 py-1 outline-none bg-card text-foreground';
      cell.innerHTML = '';
      cell.appendChild(input);
      input.focus();
      input.select();

      function commit() {
        const newVal = input.value.trim();

        if (!newVal) {
          if (currentVal) {
            showToast('toastStack', 'This field cannot be left empty.', 'danger');
          }
          cell.className = 'editable-cell rounded-md px-1.5 py-1 cursor-text min-w-[140px] max-w-[220px] whitespace-normal' + (currentVal ? '' : ' text-muted-foreground italic');
          cell.textContent = currentVal || 'Click to add…';
          return;
        }

        row[action] = newVal;
        cell.className = 'editable-cell rounded-md px-1.5 py-1 cursor-text min-w-[140px] max-w-[220px] whitespace-normal';
        cell.textContent = newVal;

        const endpoint = action === 'reasonIfFail'
          ? urls.saveVisualFailReason
          : urls.saveSpectroRemarks;

        const body = action === 'reasonIfFail'
          ? { lot_sample_id: row.lotSampleId, reason: newVal, csrfmiddlewaretoken: getCsrfToken() }
          : { lot_sample_id: row.lotSampleId, standards_id: standardFilter.value, remarks: newVal, csrfmiddlewaretoken: getCsrfToken() };

        fetch(endpoint, {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          body: new URLSearchParams(body),
        })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            showToast('toastStack', data.message, data.tone || 'info');
          })
          .catch(function () {
            showToast('toastStack', 'Failed to save — please try again.', 'danger');
          });
      }

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { input.blur(); }
        if (e.key === 'Escape') { input.value = currentVal; input.blur(); }
      });
      input.addEventListener('blur', function () {
        if (input.dataset.escaped) return;
        commit();
      });
    }

    const dataTable = createDataTable({
      headerRowId: 'headerRow',
      tableBodyId: 'tableBody',
      tableId: 'dataTable',
      columns: COLUMNS,
      leadingColumns: leadingColumns,
      getDataset: function () { return dataset; },
      onColumnStateChange: function () {
        renderColumnVisibilityPanel();
        dataTable.applyFreeze(3);
      },
      onHeaderRendered: function () {
        const selectAllCheckbox = document.getElementById('selectAllCheckbox');
        if (!selectAllCheckbox) return;
        const selectableRows = dataset.filter(function (r) { return !isReferenceRow(r); });
        selectAllCheckbox.checked = selectableRows.length > 0 && selectableRows.every(function (r) { return selectedRows.has(String(r.id)); });
        selectAllCheckbox.addEventListener('change', function () {
          if (selectAllCheckbox.checked) {
            selectableRows.forEach(function (r) { selectedRows.add(String(r.id)); });
          } else {
            selectedRows.clear();
          }
          dataTable.renderBody();
          renderScatter();
          refreshRereadControls();
        });
      },
      onBodyRendered: function () {
        document.querySelectorAll('.row-checkbox').forEach(function (cb) {
          const rowIdInit = cb.dataset.rowId;
          const trInit = cb.closest('tr[data-row-id]');
          if (trInit) trInit.classList.toggle('bg-success-bg', selectedRows.has(String(rowIdInit)));

          cb.addEventListener('change', function () {
            const id = cb.dataset.rowId;
            if (cb.checked) selectedRows.add(id); else selectedRows.delete(id);
            const tr = cb.closest('tr[data-row-id]');
            if (tr) tr.classList.toggle('bg-success-bg', cb.checked);

            const allCheckbox = document.getElementById('selectAllCheckbox');
            if (allCheckbox) {
              const selectableRows = dataset.filter(function (r) { return !isReferenceRow(r); });
              allCheckbox.checked = selectableRows.length > 0 && selectableRows.every(function (r) { return selectedRows.has(String(r.id)); });
            }

            renderScatter();
            refreshRereadControls();
          });
        });

        document.querySelectorAll('.visual-judgement-select').forEach(function (sel) {
          sel.addEventListener('change', function () {
            const rowId = sel.dataset.rowId;
            const row = dataset.find(function (r) { return String(r.id) === String(rowId); });
            if (!row) return;
            row.visualJudgement = sel.value;

            sel.classList.remove('text-success', 'text-danger', 'text-muted-foreground');
            if (sel.value === 'Pass') {
              sel.classList.add('text-success');
              sel.style.color = 'hsl(var(--success))';
            } else if (sel.value === 'Fail') {
              sel.classList.add('text-danger');
              sel.style.color = 'hsl(var(--danger))';
            } else {
              sel.classList.add('text-muted-foreground');
              sel.style.color = '';
            }
            fetch(urls.saveVisualJudgement, {
              method: 'POST',
              headers: { 'X-Requested-With': 'XMLHttpRequest' },
              body: new URLSearchParams({
                lot_sample_id: row.lotSampleId,
                value: sel.value,
                csrfmiddlewaretoken: getCsrfToken(),
              }),
            })
              .then(function (res) { return res.json(); })
              .then(function (data) {
                showToast('toastStack', data.message, data.tone || 'info');
              })
              .catch(function () {
                showToast('toastStack', 'Failed to save visual judgement.', 'danger');
              });
          });
        });

        document.querySelectorAll('[data-action="reasonIfFail"], [data-action="spectroRemarks"]').forEach(function (cell) {
          cell.addEventListener('click', function () {
            makeEditableCellSaveable(cell);
          });
        });

        document.querySelectorAll('.special-pass-checkbox').forEach(function (cb) {
          cb.addEventListener('change', function () {
            const rowId = cb.dataset.rowId;
            const row = dataset.find(function (r) { return String(r.id) === String(rowId); });
            if (!row) return;
            row.specialPass = cb.checked;
            const select = document.querySelector('.special-pass-by-select[data-row-id="' + rowId + '"]');
            if (select) {
              select.disabled = !cb.checked;
              if (!cb.checked) select.value = '';
            }
          });
        });

        document.querySelectorAll('.special-pass-by-select').forEach(function (sel) {
          sel.addEventListener('change', function () {
            const rowId = sel.dataset.rowId;
            const row = dataset.find(function (r) { return String(r.id) === String(rowId); });
            if (!row || !sel.value) return;
            row.specialPassBy = sel.value;

            fetch(urls.saveSpecialPassBy, {
              method: 'POST',
              headers: { 'X-Requested-With': 'XMLHttpRequest' },
              body: new URLSearchParams({
                lot_sample_id: row.lotSampleId,
                value: sel.value,
                csrfmiddlewaretoken: getCsrfToken(),
              }),
            })
              .then(function (res) { return res.json(); })
              .then(function (data) {
                showToast('toastStack', data.message, data.tone || 'info');
              })
              .catch(function () {
                showToast('toastStack', 'Failed to save special pass.', 'danger');
              });
          });
        });
      },
    });

    const emptyStateTitle = document.getElementById('emptyStateTitle');
    const emptyStateSubtitle = document.getElementById('emptyStateSubtitle');
    const emptyStateActionLabel = document.getElementById('emptyStateActionLabel');
    const DEFAULT_EMPTY_TITLE = emptyStateTitle ? emptyStateTitle.textContent : 'No Data Available';
    const DEFAULT_EMPTY_SUBTITLE = emptyStateSubtitle ? emptyStateSubtitle.textContent : 'Try selecting one product code and one standard sample';
    const DEFAULT_EMPTY_ACTION = 'Select one product code';
    let emptyStateMode = 'default';

    function showEmptyState(mode) {
      emptyStateMode = mode;
      if (mode === 'no-standards') {
        if (emptyStateTitle) emptyStateTitle.textContent = 'No Standards Found';
        if (emptyStateSubtitle) emptyStateSubtitle.textContent = 'Create standard reading at Values Reader page.';
        if (emptyStateActionLabel) emptyStateActionLabel.textContent = 'Create standard reading';
      } else if (mode === 'need-standard') {
        if (emptyStateTitle) emptyStateTitle.textContent = 'Standards';
        if (emptyStateSubtitle) emptyStateSubtitle.textContent = 'Choose a standard sample to load its readings.';
        if (emptyStateActionLabel) emptyStateActionLabel.textContent = 'Standards';
      } else if (mode === 'no-samples') {
        if (emptyStateTitle) emptyStateTitle.textContent = 'This standard has no samples yet.';
        if (emptyStateSubtitle) emptyStateSubtitle.textContent = 'Choose a standard with sample to load its readings.';
        if (emptyStateActionLabel) emptyStateActionLabel.textContent = 'Try different standard';
      } else {
        if (emptyStateTitle) emptyStateTitle.textContent = DEFAULT_EMPTY_TITLE;
        if (emptyStateSubtitle) emptyStateSubtitle.textContent = DEFAULT_EMPTY_SUBTITLE;
        if (emptyStateActionLabel) emptyStateActionLabel.textContent = DEFAULT_EMPTY_ACTION;
      }
      emptyState.style.display = 'flex';
    }

    function tryLoadTable() {
      const hasProduct = !!productCodeFilter.value;
      const hasStandard = !!standardFilter.value;

      if (hasProduct && hasStandard) {
        selectedRows.clear();

        currentProductCode = productCodeFilterText ? productCodeFilterText.value.trim().toUpperCase() : productCodeFilter.value;
        currentStandardId = standardFilter.value;
        const selectedOption = standardFilter.options[standardFilter.selectedIndex];
        currentStandardName = selectedOption ? selectedOption.textContent : null;

        fetch(urls.standardsForProductCode + '?product_code=' + encodeURIComponent(currentProductCode), {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            currentStdDeUsed = (data.std_delta_e_used !== null && data.std_delta_e_used !== undefined) ? data.std_delta_e_used : 1.00;
            const stdRow = (data.standards || []).find(function (s) { return String(s.standards_id) === String(currentStandardId); });
            currentStandardRaw = stdRow ? {
              raw_l: stdRow.raw_l, raw_a: stdRow.raw_a, raw_b: stdRow.raw_b,
              raw_c: stdRow.raw_c || null, raw_h: stdRow.raw_h || null,
            } : null;
          })
          .catch(function () { currentStdDeUsed = 1.00; currentStandardRaw = null; });

        fetch(urls.lotSamplesForStandard + '?standards_id=' + encodeURIComponent(standardFilter.value), {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            dataset = applyDefaultSort(data.rows || []);
            dataTable.resetSort();
            dataTable.renderHeader();
            dataTable.renderBody();

            if (dataset.length === 0) {
              dataTable.hideTable();
              showEmptyState('no-samples');
            } else {
              dataTable.showTable();
              emptyState.style.display = 'none';
              dataTable.applyFreeze(3);
            }
            if (generateReportBtn) generateReportBtn.disabled = dataset.length === 0;
            refreshRereadControls();
            renderScatter();

            // Task 8: reapply the last search filter once, after real
            // data has actually loaded -- doing it here (instead of at
            // page load) means it works regardless of how long the
            // product-code/standard restore chain takes.
            if (!searchRestoredFromSession) {
              searchRestoredFromSession = true;
              let savedQuery = null;
              try {
                savedQuery = sessionStorage.getItem(SEARCH_SESSION_KEY);
              } catch (e) { /* sessionStorage unavailable -- nothing to restore */ }
              if (savedQuery && searchInput && !searchInput.disabled) {
                searchInput.value = savedQuery;
                const visibleCount = dataTable.applySearch(savedQuery);
                const showNoResults = visibleCount === 0;
                noResultsState.classList.toggle('hidden', !showNoResults);
                noResultsState.classList.toggle('flex', showNoResults);
                setTableAreaOverflowLocked(showNoResults);
              }
            }
          })
          .catch(function () {
            showToast('toastStack', 'Failed to load samples for this standard.', 'danger');
          });

        noResultsState.classList.add('hidden');
        noResultsState.classList.remove('flex');
        setTableAreaOverflowLocked(false);

        searchInput.disabled = false;
        searchInput.value = '';
        if (columnVisibilityDropdownBtn) columnVisibilityDropdownBtn.disabled = false;
        renderColumnVisibilityPanel();
      } else {
        dataset = [];
        currentProductCode = null;
        currentStandardId = null;
        currentStandardName = null;
        currentStdDeUsed = null;
        currentStandardRaw = null;
        dataTable.hideTable();
        if (generateReportBtn) generateReportBtn.disabled = true;
        refreshRereadControls();
        showEmptyState(hasProduct ? 'need-standard' : 'default');
        noResultsState.classList.add('hidden');
        noResultsState.classList.remove('flex');
        setTableAreaOverflowLocked(false);

        searchInput.disabled = true;
        searchInput.value = '';
        if (columnVisibilityDropdownBtn) columnVisibilityDropdownBtn.disabled = true;
      }
    }

    let currentlyLoadedProductCode = null;

    if (productCodeFilter) {
      productCodeFilter.addEventListener('change', function () {
        const productCode = productCodeFilter.value;

        // Task 6: remember the chosen code across page navigation --
        // saved regardless of whether it's a repeat pick, so the user
        // never has to retype it after leaving and coming back.
        try {
          if (productCode) {
            sessionStorage.setItem(PRODUCT_CODE_SESSION_KEY, productCode);
          } else {
            sessionStorage.removeItem(PRODUCT_CODE_SESSION_KEY);
          }
        } catch (e) { /* sessionStorage unavailable -- fail silently */ }

        if (productCode && productCode === currentlyLoadedProductCode) {
          showToast('toastStack', 'This product code is already showing sample data.', 'info');
          return;
        }
        currentlyLoadedProductCode = productCode || null;

        standardFilter.innerHTML = '<option value="">Standards</option>';
        standardFilter.disabled = true;
        syncStandardFilterUI([]);
        tryLoadTable();

        if (!productCode) return;

        fetch(urls.standardsForProductCode + '?product_code=' + encodeURIComponent(productCode), {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            const standardsList = data.standards || [];

            standardsList.forEach(function (std) {
              const opt = document.createElement('option');
              opt.value = std.standards_id;
              opt.textContent = std.standard_name;
              standardFilter.appendChild(opt);
            });
            standardFilter.disabled = standardsList.length === 0;
            syncStandardFilterUI(standardsList);

            // Task 6: if a previously chosen standard exists among this
            // product code's standards, restore it instead of leaving
            // the dropdown unselected.
            let savedStandardId = null;
            try {
              savedStandardId = sessionStorage.getItem(STANDARD_SESSION_KEY);
            } catch (e) { /* sessionStorage unavailable -- nothing to restore */ }

            const savedStandardExists = savedStandardId
              && standardsList.some(function (std) { return String(std.standards_id) === String(savedStandardId); });

            if (savedStandardExists) {
              standardFilter.value = savedStandardId;
              standardFilter.dispatchEvent(new Event('change', { bubbles: true }));
            }

            if (standardsList.length === 0) {
              showEmptyState('no-standards');
              showToast('toastStack', 'No standard found.', 'info');
            } else if (data.message) {
              showToast('toastStack', data.message, data.tone || 'info');
            }
          })
          .catch(function () {
            showToast('toastStack', 'Failed to load standards for this product code.', 'danger');
          });
      });
    }

    if (standardFilter) {
      standardFilter.addEventListener('change', function () {
        try {
          if (standardFilter.value) {
            sessionStorage.setItem(STANDARD_SESSION_KEY, standardFilter.value);
          } else {
            sessionStorage.removeItem(STANDARD_SESSION_KEY);
          }
        } catch (e) { /* sessionStorage unavailable -- fail silently */ }
        syncStandardFilterUI();
        tryLoadTable();
      });
    }

    const emptySelectBtn = document.getElementById('emptySelectBtn');
    if (emptySelectBtn) {
      emptySelectBtn.addEventListener('click', function () {
        if (emptyStateMode === 'no-standards') {
          window.location.href = urls.samplesReader;
          return;
        }
        const target = (emptyStateMode === 'need-standard' || emptyStateMode === 'no-samples') ? standardFilter : document.getElementById('productCodeFilter');
        if (!target) return;
        target.focus();
        target.classList.add('ring-2', 'ring-ring/40', 'border-ring');
        setTimeout(function () {
          target.classList.remove('ring-2', 'ring-ring/40', 'border-ring');
        }, 1200);
      });
    }

    const tableArea = document.getElementById('tableArea');

    function setTableAreaOverflowLocked(locked) {
      if (!tableArea) return;
      tableArea.style.overflow = locked ? 'hidden' : '';
    }

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        const visibleCount = dataTable.applySearch(searchInput.value);
        const q = searchInput.value.trim();
        const showNoResults = !!q && visibleCount === 0;
        noResultsState.classList.toggle('hidden', !showNoResults);
        noResultsState.classList.toggle('flex', showNoResults);
        setTableAreaOverflowLocked(showNoResults);

        try {
          if (q) {
            sessionStorage.setItem(SEARCH_SESSION_KEY, searchInput.value);
          } else {
            sessionStorage.removeItem(SEARCH_SESSION_KEY);
          }
        } catch (e) { /* sessionStorage unavailable -- fail silently */ }
      });
    }

    const noResultsClearBtn = document.getElementById('noResultsClearBtn');
    if (noResultsClearBtn) {
      noResultsClearBtn.addEventListener('click', function () {
        searchInput.value = '';
        dataTable.applySearch('');
        try { sessionStorage.removeItem(SEARCH_SESSION_KEY); } catch (e) {}
        noResultsState.classList.add('hidden');
        noResultsState.classList.remove('flex');
        setTableAreaOverflowLocked(false);
        searchInput.focus();
      });
    }

    // Task 6: restore the last-chosen product code on page load, so the
    // user doesn't have to re-enter it after navigating away and back.
    (function restoreProductCodeFromSession() {
      let savedCode = null;
      try {
        savedCode = sessionStorage.getItem(PRODUCT_CODE_SESSION_KEY);
      } catch (e) { /* sessionStorage unavailable -- nothing to restore */ }

      if (!savedCode || !productCodeFilter) return;

      productCodeFilter.value = savedCode;
      if (productCodeFilterText) productCodeFilterText.value = savedCode;

      productCodeFilter.dispatchEvent(new Event('change', { bubbles: true }));
    })();

    tryLoadTable();
  });
}