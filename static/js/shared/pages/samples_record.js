
/*
 *  static/js/pages/samples_record.js
 */

import { createDataTable } from "../ui/table.js";
import { showToast } from "../global/toast.js";
import { openModal, closeModal } from "../global/modal.js";
import { renderScatter } from "../ui/scatter_graph.js";
import { getCsrfToken } from "../utils/csrf.js";

export function initSamplesRecordPage(urls) {
  const COLUMNS = [
    {
      key: 'colorSimulation', label: 'Color Simulation', type: 'string',
      render: function (row) {
        if (!row.colorSimulation || row.colorSimulation === '-') return '<span class="text-muted-foreground">-</span>';
        const cssColor = '#' + row.colorSimulation.replace('#', '').slice(2, 8);
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
  let currentThreshold = 1.00;

  function judgementFor(dE) {
    if (dE === null || dE === undefined) return '-';
    return dE > currentThreshold ? 'FAILED' : 'PASSED';
  }

  function recalcSpectroJudgements() {
    dataset.forEach(function (row) {
      row.spectroJudgement = judgementFor(row.de00);
    });
  }

  const leadingColumns = [
    {
      renderHeader: function () {
        return '<div class="flex items-center justify-center py-2"><input type="checkbox" id="selectAllCheckbox" class="w-3.5 h-3.5 accent-white cursor-pointer"></div>';
      },
      renderCell: function (row) {
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
        } else {
          icon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--danger))" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        }
        return '<div class="flex items-center justify-center" data-tooltip="' + (row.qcMessage || '') + '">' + icon + '</div>';
      },
      width: 'w-9',
    },
  ];

  window.addEventListener('load', function () {
    const productCodeFilter = document.getElementById('productCodeFilterValue');
    const standardFilter = document.getElementById('standardFilter');
    const stdDeUsedBox = document.getElementById('stdDeUsedBox');

    const emptyState = document.getElementById('emptyState');
    const noResultsState = document.getElementById('noResultsState');
    const searchInput = document.getElementById('searchInput');
    const generateReportBtn = document.getElementById('generateReportBtn');

    if (generateReportBtn) {
      generateReportBtn.addEventListener('click', function () {
        if (!standardFilter.value || dataset.length === 0) return;
        window.location.href = urls.exportReport + '?standards_id=' + encodeURIComponent(standardFilter.value);
      });
    }
    const freezeDropdownBtn = document.getElementById('freezeDropdownBtn');
    const freezeDropdownLabel = document.getElementById('freezeDropdownLabel');
    const freezeDropdownPanel = document.getElementById('freezeDropdownPanel');
    const FREEZE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];
    let frozenColumnCount = 0;

    function renderFreezePanel() {
      if (!freezeDropdownPanel) return;
      let html = '<div class="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground px-1.5 pb-1">Freeze Columns</div>';
      html += '<label class="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-accent cursor-pointer text-[12px]">'
        + '<input type="radio" name="freezeOption" class="freeze-option w-3.5 h-3.5 accent-foreground cursor-pointer" value="0"' + (frozenColumnCount === 0 ? ' checked' : '') + '>'
        + '<span>No Freeze</span></label>';
      FREEZE_OPTIONS.forEach(function (n) {
        const checked = frozenColumnCount === n;
        const label = n === 1 ? 'First Column' : 'First ' + n + ' Columns';
        html += '<label class="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-accent cursor-pointer text-[12px]">'
          + '<input type="radio" name="freezeOption" class="freeze-option w-3.5 h-3.5 accent-foreground cursor-pointer" value="' + n + '"' + (checked ? ' checked' : '') + '>'
          + '<span>' + label + '</span></label>';
      });
      freezeDropdownPanel.innerHTML = html;

      freezeDropdownPanel.querySelectorAll('.freeze-option').forEach(function (radio) {
        radio.addEventListener('change', function () {
          frozenColumnCount = parseInt(radio.value, 10);
          freezeDropdownLabel.textContent = frozenColumnCount > 0
            ? 'Freeze: ' + (frozenColumnCount === 1 ? '1st Column' : 'First ' + frozenColumnCount + ' Columns')
            : 'Freeze Columns Filter';
          dataTable.applyFreeze(frozenColumnCount);
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
      onHeaderRendered: function () {
        const selectAllCheckbox = document.getElementById('selectAllCheckbox');
        if (!selectAllCheckbox) return;
        selectAllCheckbox.checked = dataset.length > 0 && dataset.every(function (r) { return selectedRows.has(String(r.id)); });
        selectAllCheckbox.addEventListener('change', function () {
          if (selectAllCheckbox.checked) {
            dataset.forEach(function (r) { selectedRows.add(String(r.id)); });
          } else {
            selectedRows.clear();
          }
          dataTable.renderBody();
          renderScatter();
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
              allCheckbox.checked = dataset.length > 0 && dataset.every(function (r) { return selectedRows.has(String(r.id)); });
            }

            renderScatter();
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
        if (emptyStateTitle) emptyStateTitle.textContent = 'Select one Standard';
        if (emptyStateSubtitle) emptyStateSubtitle.textContent = 'Choose a standard sample to load its readings.';
        if (emptyStateActionLabel) emptyStateActionLabel.textContent = 'Select one standard';
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

    function setStdDeEditable(enabled) {
      if (!stdDeUsedBox) return;
      stdDeUsedBox.readOnly = !enabled;
    }

    function tryLoadTable() {
      const hasProduct = !!productCodeFilter.value;
      const hasStandard = !!standardFilter.value;

      if (hasProduct && hasStandard) {
        selectedRows.clear();
        frozenColumnCount = 0;

        fetch(urls.lotSamplesForStandard + '?standards_id=' + encodeURIComponent(standardFilter.value), {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            dataset = data.rows || [];
            dataTable.resetSort();
            dataTable.renderHeader();
            dataTable.renderBody();

            if (dataset.length === 0) {
              dataTable.hideTable();
              showEmptyState('no-samples');
              setStdDeEditable(false);
            } else {
              dataTable.showTable();
              emptyState.style.display = 'none';
              setStdDeEditable(true);
            }
            if (generateReportBtn) generateReportBtn.disabled = dataset.length === 0;
            renderScatter();
          })
          .catch(function () {
            showToast('toastStack', 'Failed to load samples for this standard.', 'danger');
          });

        noResultsState.classList.add('hidden');
        noResultsState.classList.remove('flex');

        searchInput.disabled = false;
        searchInput.value = '';
        freezeDropdownBtn.disabled = false;
        freezeDropdownLabel.textContent = 'Freeze Columns Filter';
        renderFreezePanel();
      } else {
        dataset = [];
        dataTable.hideTable();
        setStdDeEditable(false);
        if (generateReportBtn) generateReportBtn.disabled = true;
        showEmptyState(hasProduct ? 'need-standard' : 'default');
        noResultsState.classList.add('hidden');
        noResultsState.classList.remove('flex');

        searchInput.disabled = true;
        searchInput.value = '';
        freezeDropdownBtn.disabled = true;
        freezeDropdownLabel.textContent = 'Freeze Columns Filter';
      }
    }

    let currentlyLoadedProductCode = null;

    if (productCodeFilter) {
      productCodeFilter.addEventListener('change', function () {
        const productCode = productCodeFilter.value;

        if (productCode && productCode === currentlyLoadedProductCode) {
          showToast('toastStack', 'This product code is already showing sample data.', 'info');
          return;
        }
        currentlyLoadedProductCode = productCode || null;

        standardFilter.innerHTML = '<option value="">Select one standard</option>';
        standardFilter.disabled = true;
        stdDeUsedBox.value = '';
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

            currentStdDeUsed = (data.std_delta_e_used !== null && data.std_delta_e_used !== undefined)
              ? Number(data.std_delta_e_used)
              : null;
            currentThreshold = currentStdDeUsed !== null ? currentStdDeUsed : 1.00;
            stdDeUsedBox.value = currentStdDeUsed !== null ? currentStdDeUsed.toFixed(2) : '';

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
      standardFilter.addEventListener('change', tryLoadTable);
    }

    let currentStdDeUsed = null;

    function sanitizeStdDe(raw) {
      let digits = raw.replace(/[^0-9.]/g, '');
      const dot = digits.indexOf('.');
      if (dot !== -1) { digits = digits.slice(0, dot + 1) + digits.slice(dot + 1).replace(/\./g, ''); }
      const parts = digits.split('.');
      if (parts[1]) parts[1] = parts[1].slice(0, 2);
      return parts.join('.');
    }

    if (stdDeUsedBox) {
      stdDeUsedBox.addEventListener('input', function () {
        stdDeUsedBox.value = sanitizeStdDe(stdDeUsedBox.value);
      });

      stdDeUsedBox.addEventListener('click', function () {
        if (stdDeUsedBox.readOnly) {
          showToast('toastStack', 'Please select a standard first.', 'info');
        }
      });

      function commitStdDeUsed() {
        const raw = stdDeUsedBox.value.trim();

        if (!raw) {
          showToast('toastStack', 'Standard ΔE Used cannot be empty.', 'danger');
          stdDeUsedBox.value = currentStdDeUsed !== null ? currentStdDeUsed.toFixed(2) : '';
          return;
        }

        const newValue = parseFloat(raw);

        if (isNaN(newValue)) {
          showToast('toastStack', 'Please enter a valid number.', 'danger');
          stdDeUsedBox.value = currentStdDeUsed !== null ? currentStdDeUsed.toFixed(2) : '';
          return;
        }

        if (currentStdDeUsed !== null && newValue < currentStdDeUsed) {
          showToast('toastStack', 'New value cannot be less than the current Standard ΔE Used.', 'danger');
          stdDeUsedBox.value = currentStdDeUsed.toFixed(2);
          return;
        }

        if (currentStdDeUsed !== null && newValue === currentStdDeUsed) {
          stdDeUsedBox.value = currentStdDeUsed.toFixed(2);
          return;
        }

        document.getElementById('deModalNewValue').textContent = newValue.toFixed(2);
        stdDeUsedBox.dataset.pendingValue = newValue;
        openModal('stdDeModal');
      }

      stdDeUsedBox.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        commitStdDeUsed();
      });

      stdDeUsedBox.addEventListener('focus', function () {
        stdDeUsedBox.dataset.valueOnFocus = stdDeUsedBox.value;
      });

      stdDeUsedBox.addEventListener('blur', function () {
        if (stdDeUsedBox.readOnly) return;
        if (stdDeUsedBox.value === stdDeUsedBox.dataset.valueOnFocus) return;
        commitStdDeUsed();
      });
    }

    const deModalConfirm = document.getElementById('deModalConfirm');
    if (deModalConfirm) {
      deModalConfirm.addEventListener('click', function () {
        const pendingValue = stdDeUsedBox.dataset.pendingValue;
        const productCode = productCodeFilter.value;

        fetch(urls.saveStdDeltaE, {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          body: new URLSearchParams({
            product_code: productCode,
            new_value: pendingValue,
            csrfmiddlewaretoken: getCsrfToken(),
          }),
        })
          .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
          .then(function (result) {
            showToast('toastStack', result.data.message, result.data.tone || (result.ok ? 'success' : 'danger'));
            if (result.ok) {
              currentStdDeUsed = parseFloat(result.data.std_delta_e_used);
              currentThreshold = currentStdDeUsed;
              stdDeUsedBox.value = currentStdDeUsed.toFixed(2);

              recalcSpectroJudgements();
              dataTable.renderBody();
              renderScatter();
            } else {
              stdDeUsedBox.value = currentStdDeUsed !== null ? currentStdDeUsed.toFixed(2) : '';
            }
            closeModal('stdDeModal');
          })
          .catch(function () {
            showToast('toastStack', 'Network error — please try again.', 'danger');
            stdDeUsedBox.value = currentStdDeUsed !== null ? currentStdDeUsed.toFixed(2) : '';
            closeModal('stdDeModal');
          });
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

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        const visibleCount = dataTable.applySearch(searchInput.value);
        const q = searchInput.value.trim();
        const showNoResults = !!q && visibleCount === 0;
        noResultsState.classList.toggle('hidden', !showNoResults);
        noResultsState.classList.toggle('flex', showNoResults);
      });
    }

    const noResultsClearBtn = document.getElementById('noResultsClearBtn');
    if (noResultsClearBtn) {
      noResultsClearBtn.addEventListener('click', function () {
        searchInput.value = '';
        dataTable.applySearch('');
        noResultsState.classList.add('hidden');
        noResultsState.classList.remove('flex');
        searchInput.focus();
      });
    }

    tryLoadTable();
  });
}