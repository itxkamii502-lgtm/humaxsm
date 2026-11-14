/**
 * APX Shared Grid & Filter Engine: apxTable & apxRenderFilterBar
 * Scoped, High-Performance, Excel-style dense telecom softswitch tables.
 * Default XSS sanitization; trusted HTML only via explicit { html: '...' }.
 */

(function (window, document) {
  'use strict';

  // ── 1. Default Dynamic String Escaping (Rule 4) ──────────────────────
  function apxEscape(val) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object' && val && 'html' in val) {
      return String(val.html); // Explicit trusted HTML
    }
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── 2. Global Registry for apxTable instances ───────────────────────
  const apxGrids = new Map();

  // ── 3. CSV / TSV / Excel Exporter Helpers ───────────────────────────
  function exportCsv(gridId, filename) {
    const grid = apxGrids.get(gridId);
    if (!grid) return;
    const cols = grid.columns.filter(c => grid.visibleCols.has(c.key));
    const headerRow = ['#', ...cols.map(c => `"${(c.label || c.key).replace(/"/g, '""')}"`)].join(',');

    const dataRows = grid.filteredRows.map((row, idx) => {
      const serial = idx + 1;
      const cells = cols.map(c => {
        let raw = c.render ? c.render(row[c.key], row, idx) : row[c.key];
        if (typeof raw === 'object' && raw && 'text' in raw) raw = raw.text;
        else if (typeof raw === 'object' && raw && 'html' in raw) raw = String(raw.html).replace(/<[^>]+>/g, '');
        raw = String(raw === null || raw === undefined ? '' : raw).replace(/"/g, '""');
        return `"${raw}"`;
      });
      return [serial, ...cells].join(',');
    });

    const csvContent = '\uFEFF' + [headerRow, ...dataRows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename || gridId || 'export'}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function exportCopy(gridId) {
    const grid = apxGrids.get(gridId);
    if (!grid) return;
    const cols = grid.columns.filter(c => grid.visibleCols.has(c.key));
    const headerRow = ['#', ...cols.map(c => c.label || c.key)].join('\t');

    const dataRows = grid.filteredRows.map((row, idx) => {
      const serial = idx + 1;
      const cells = cols.map(c => {
        let raw = c.render ? c.render(row[c.key], row, idx) : row[c.key];
        if (typeof raw === 'object' && raw && 'text' in raw) raw = raw.text;
        else if (typeof raw === 'object' && raw && 'html' in raw) raw = String(raw.html).replace(/<[^>]+>/g, '');
        return String(raw === null || raw === undefined ? '' : raw);
      });
      return [serial, ...cells].join('\t');
    });

    const text = [headerRow, ...dataRows].join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        if (window.zyShowToast) window.zyShowToast('Copied to clipboard!', 'success');
        else if (window.toast) window.toast('Copied to clipboard!', 'success');
      }).catch(() => {});
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      if (window.zyShowToast) window.zyShowToast('Copied to clipboard!', 'success');
      else if (window.toast) window.toast('Copied to clipboard!', 'success');
    }
  }

  function exportPrint(gridId) {
    const grid = apxGrids.get(gridId);
    if (!grid) return;
    const tableEl = document.getElementById(`apx-tbl-${gridId}`);
    if (!tableEl) return;
    const html = `
      <!DOCTYPE html><html>
        <head>
          <title>${apxEscape(grid.title || 'Print Report')}</title>
          <style>
            body { font-family: sans-serif; font-size: 11px; margin: 15px; color: #1e293b; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; }
            th { background: #f1f5f9; text-transform: uppercase; font-size: 10px; }
            .apx-num { text-align: right; font-family: monospace; }
          </style>
        </head>
        <body>
          <h2>${apxEscape(grid.title || 'HUMEX SMS Report')}</h2>
          <p style="color:#64748b;font-size:10px;">Generated at: ${new Date().toLocaleString()}</p>
          ${tableEl.outerHTML}
        </body>
      </html>
    `;
    if (typeof window.zyPrintHtml === 'function') {
      window.zyPrintHtml(html);
      return;
    }
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(frame);
    const doc = frame.contentDocument || frame.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (_) {}
      setTimeout(() => { try { frame.remove(); } catch (_) {} }, 1500);
    }, 150);
  }

  // ── 4. Main apxTable Implementation ─────────────────────────────────
  function apxTable(config) {
    const {
      container,
      id = 'grid-' + Math.random().toString(36).substring(2, 9),
      title = 'Data Records',
      columns = [],
      rows = [],
      totals = null,
      pagination = { page: 1, limit: 25 },
      showRecords = [10, 25, 50, 100, 500, 'all'],
      onServerPageChange = null,
      serverTotal = null
    } = config;

    const root = typeof container === 'string' ? document.getElementById(container) : container;
    if (!root) {
      console.warn(`[apxTable] Container not found:`, container);
      return null;
    }

    // Initialize State
    const visibleCols = new Set(columns.map(c => c.key));
    const state = {
      id,
      title,
      columns,
      rawRows: Array.isArray(rows) ? rows : [],
      filteredRows: Array.isArray(rows) ? [...rows] : [],
      totals,
      visibleCols,
      searchQuery: '',
      sortKey: null,
      sortDir: 'asc',
      page: pagination.page || 1,
      limit: pagination.limit === 'all' ? 'all' : (Number(pagination.limit) || 25),
      serverSide: Boolean(onServerPageChange),
      serverTotal: serverTotal !== null ? Number(serverTotal) : null,
      onServerPageChange
    };

    apxGrids.set(id, state);

    function applyFilterAndSort() {
      if (state.serverSide) {
        state.filteredRows = [...state.rawRows];
        return;
      }
      let res = [...state.rawRows];
      const q = state.searchQuery.trim().toLowerCase();
      if (q) {
        res = res.filter(row => {
          return state.columns.some(col => {
            const val = row[col.key];
            if (val === null || val === undefined) return false;
            return String(val).toLowerCase().includes(q);
          });
        });
      }
      if (state.sortKey) {
        const col = state.columns.find(c => c.key === state.sortKey);
        const dir = state.sortDir === 'asc' ? 1 : -1;
        res.sort((a, b) => {
          let va = a[state.sortKey];
          let vb = b[state.sortKey];
          if (va === null || va === undefined) va = '';
          if (vb === null || vb === undefined) vb = '';
          if (!isNaN(Number(va)) && !isNaN(Number(vb)) && va !== '' && vb !== '') {
            return (Number(va) - Number(vb)) * dir;
          }
          return String(va).localeCompare(String(vb)) * dir;
        });
      }
      state.filteredRows = res;
    }

    function render() {
      applyFilterAndSort();

      const totalItems = state.serverSide && state.serverTotal !== null
        ? state.serverTotal
        : state.filteredRows.length;

      const perPage = state.limit === 'all' ? Math.max(1, totalItems) : Number(state.limit);
      const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
      if (state.page > totalPages) state.page = totalPages;
      if (state.page < 1) state.page = 1;

      const startIdx = (state.page - 1) * perPage;
      const endIdx = state.limit === 'all' ? totalItems : Math.min(startIdx + perPage, totalItems);
      const displayedRows = state.serverSide
        ? state.filteredRows
        : state.filteredRows.slice(startIdx, endIdx);

      // Check if grouped headers exist
      const hasGroupHeader = state.columns.some(c => Boolean(c.group));

      // ── Build Header HTML ──────────────────────────────────────────
      let groupThHtml = '';
      let mainThHtml = `<th class="apx-col-sn">#</th>`;

      if (hasGroupHeader) {
        groupThHtml = `<tr class="apx-group-th"><th class="apx-col-sn"></th>`;
        let curGroup = null;
        let curSpan = 0;
        state.columns.forEach((c) => {
          if (!state.visibleCols.has(c.key)) return;
          const gName = c.group || '';
          if (gName === curGroup) {
            curSpan++;
          } else {
            if (curSpan > 0) {
              groupThHtml += `<th colspan="${curSpan}">${apxEscape(curGroup)}</th>`;
            }
            curGroup = gName;
            curSpan = 1;
          }
        });
        if (curSpan > 0) {
          groupThHtml += `<th colspan="${curSpan}">${apxEscape(curGroup)}</th>`;
        }
        groupThHtml += `</tr>`;
      }

      state.columns.forEach(c => {
        if (!state.visibleCols.has(c.key)) return;
        const sortCls = c.sortable !== false ? 'sortable' : '';
        const isSorted = state.sortKey === c.key;
        const arrow = isSorted ? (state.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
        const widthStyle = c.width ? `style="width:${c.width};min-width:${c.width};"` : '';
        const alignStyle = c.align === 'right' ? 'text-align:right;' : (c.align === 'center' ? 'text-align:center;' : '');
        mainThHtml += `
          <th class="${sortCls}" ${widthStyle} style="${alignStyle}" data-key="${apxEscape(c.key)}" onclick="window.apxTableSort('${state.id}', '${apxEscape(c.key)}')">
            ${apxEscape(c.label || c.key)}${arrow}
          </th>
        `;
      });

      // ── Build Body Rows HTML ───────────────────────────────────────
      let tbodyHtml = '';
      if (displayedRows.length === 0) {
        const colSpan = 1 + state.columns.filter(c => state.visibleCols.has(c.key)).length;
        tbodyHtml = `
          <tr>
            <td colspan="${colSpan}" style="text-align:center;padding:30px;color:var(--apx-text-muted);">
              <i class="fas fa-inbox" style="font-size:24px;margin-bottom:8px;display:block;opacity:0.5;"></i>
              No records found
            </td>
          </tr>
        `;
      } else {
        displayedRows.forEach((row, rowIdx) => {
          const serialNo = (state.page - 1) * (state.limit === 'all' ? 0 : perPage) + rowIdx + 1;
          let rowCells = `<td class="apx-col-sn">${serialNo}</td>`;

          state.columns.forEach(c => {
            if (!state.visibleCols.has(c.key)) return;
            const rawVal = row[c.key];
            let cellContent = '';

            if (typeof c.render === 'function') {
              const res = c.render(rawVal, row, rowIdx);
              if (typeof res === 'object' && res && 'html' in res) {
                cellContent = String(res.html); // Trusted HTML
              } else {
                cellContent = apxEscape(res);
              }
            } else {
              cellContent = apxEscape(rawVal);
            }

            const isNum = c.align === 'right' || typeof rawVal === 'number' || c.isNum;
            const cellCls = isNum ? 'apx-num' : (c.align === 'center' ? 'style="text-align:center;"' : '');
            rowCells += `<td ${cellCls}>${cellContent}</td>`;
          });

          tbodyHtml += `<tr>${rowCells}</tr>`;
        });
      }

      // ── Build Footer Totals HTML (Server Summary Supported) ────────
      let tfootHtml = '';
      if (state.totals) {
        const t = state.totals;
        const totalColCount = 1 + state.columns.filter(c => state.visibleCols.has(c.key)).length;
        const hasCurrencies = t.usd !== undefined || t.eur !== undefined || t.gbp !== undefined;

        tfootHtml = `
          <tfoot>
            <tr>
              <td colspan="${totalColCount}">
                <div class="apx-footer-totals">
                  <div class="apx-totals-item">
                    <span>TOTAL RECORDS:</span> <strong>${Number(t.total_sms || t.total || totalItems).toLocaleString()}</strong>
                  </div>
                  ${hasCurrencies ? `
                    <div style="display:flex;gap:10px;align-items:center;">
                      ${t.usd !== undefined ? `<span class="apx-badge-usd">USD: $${Number(t.usd || 0).toFixed(4)}</span>` : ''}
                      ${t.eur !== undefined ? `<span class="apx-badge-eur">EUR: €${Number(t.eur || 0).toFixed(4)}</span>` : ''}
                      ${t.gbp !== undefined ? `<span class="apx-badge-gbp">GBP: £${Number(t.gbp || 0).toFixed(4)}</span>` : ''}
                    </div>
                  ` : ''}
                  ${t.payout !== undefined ? `<div class="apx-totals-item"><span>Total Payout:</span> <strong class="apx-num">${Number(t.payout).toFixed(4)}</strong></div>` : ''}
                  ${t.profit !== undefined ? `<div class="apx-totals-item"><span>Total Profit:</span> <strong class="apx-num" style="color:#10b981;">${Number(t.profit).toFixed(4)}</strong></div>` : ''}
                </div>
              </td>
            </tr>
          </tfoot>
        `;
      }

      // ── Build Column Show/Hide Dropdown ────────────────────────────
      const colItemsHtml = state.columns.map(c => `
        <label class="apx-col-item">
          <input type="checkbox" ${state.visibleCols.has(c.key) ? 'checked' : ''} onchange="window.apxTableToggleCol('${state.id}', '${apxEscape(c.key)}', this.checked)">
          <span>${apxEscape(c.label || c.key)}</span>
        </label>
      `).join('');

      // ── Assemble Final Markup ──────────────────────────────────────
      root.innerHTML = `
        <div class="apx-table-wrap" id="apx-wrap-${state.id}">
          <!-- Top Table Toolbar -->
          <div class="apx-table-toolbar">
            <div class="apx-toolbar-left">
              <div class="apx-search-box">
                <i class="fas fa-search"></i>
                <input type="text" class="apx-input apx-search-input" placeholder="Search grid..." value="${apxEscape(state.searchQuery)}" oninput="window.apxTableSearch('${state.id}', this.value)">
              </div>
              <div style="display:flex;align-items:center;gap:4px;">
                <span class="apx-limit-label">Show</span>
                <select class="apx-select apx-limit-select" onchange="window.apxTableSetLimit('${state.id}', this.value)">
                  ${showRecords.map(opt => `<option value="${opt}" ${String(state.limit) === String(opt) ? 'selected' : ''}>${opt === 'all' ? 'All' : opt}</option>`).join('')}
                </select>
                <span class="apx-limit-label">records</span>
              </div>
            </div>
            <div class="apx-toolbar-right">
              <button type="button" class="apx-btn apx-btn-small" onclick="window.apxTableCopy('${state.id}')" data-apx-tooltip="Copy to Clipboard">
                <i class="fas fa-copy"></i> Copy
              </button>
              <button type="button" class="apx-btn apx-btn-small" onclick="window.apxTableCsv('${state.id}')" data-apx-tooltip="Download CSV">
                <i class="fas fa-file-csv"></i> CSV
              </button>
              <button type="button" class="apx-btn apx-btn-small" onclick="window.apxTablePrint('${state.id}')" data-apx-tooltip="Print Grid">
                <i class="fas fa-print"></i> Print
              </button>
              <div class="apx-col-dropdown-wrap">
                <button type="button" class="apx-btn apx-btn-small" onclick="window.apxTableToggleDropdown('${state.id}')" data-apx-tooltip="Show / Hide Columns">
                  <i class="fas fa-columns"></i> Columns <i class="fas fa-chevron-down" style="font-size:9px;"></i>
                </button>
                <div class="apx-col-dropdown" id="apx-cols-${state.id}">
                  <div style="font-weight:700;font-size:10px;text-transform:uppercase;color:var(--apx-text-muted);margin-bottom:4px;border-bottom:1px solid var(--apx-card-border);padding-bottom:2px;">Visible Columns</div>
                  ${colItemsHtml}
                </div>
              </div>
            </div>
          </div>

          <!-- Excel-style Scrollable Grid -->
          <div class="apx-table-scroll">
            <table class="apx-table" id="apx-tbl-${state.id}">
              <thead>
                ${groupThHtml}
                <tr>${mainThHtml}</tr>
              </thead>
              <tbody>
                ${tbodyHtml}
              </tbody>
              ${tfootHtml}
            </table>
          </div>

          <!-- Bottom Pagination Controls -->
          <div class="apx-table-pagination">
            <div>
              Showing <strong>${totalItems === 0 ? 0 : startIdx + 1}</strong> to <strong>${endIdx}</strong> of <strong>${totalItems}</strong> records
            </div>
            <div class="apx-page-controls">
              <button type="button" class="apx-page-btn" ${state.page <= 1 ? 'disabled' : ''} onclick="window.apxTableGoPage('${state.id}', 1)" title="First Page">
                <i class="fas fa-angles-left"></i>
              </button>
              <button type="button" class="apx-page-btn" ${state.page <= 1 ? 'disabled' : ''} onclick="window.apxTableGoPage('${state.id}', ${state.page - 1})" title="Previous Page">
                <i class="fas fa-angle-left"></i>
              </button>
              <span style="padding:0 6px;font-weight:600;">Page ${state.page} of ${totalPages}</span>
              <button type="button" class="apx-page-btn" ${state.page >= totalPages ? 'disabled' : ''} onclick="window.apxTableGoPage('${state.id}', ${state.page + 1})" title="Next Page">
                <i class="fas fa-angle-right"></i>
              </button>
              <button type="button" class="apx-page-btn" ${state.page >= totalPages ? 'disabled' : ''} onclick="window.apxTableGoPage('${state.id}', ${totalPages})" title="Last Page">
                <i class="fas fa-angles-right"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }

    // Expose instance methods
    const instance = {
      updateData(newRows, newTotals = null) {
        state.rawRows = Array.isArray(newRows) ? newRows : [];
        if (newTotals !== null) state.totals = newTotals;
        render();
      },
      render
    };

    render();
    return instance;
  }

  // ── 5. Global Action Bridges for Event Listeners ────────────────────
  window.apxEscape = apxEscape;
  window.apxTable = apxTable;

  window.apxTableSort = function (gridId, key) {
    const grid = apxGrids.get(gridId);
    if (!grid) return;
    if (grid.sortKey === key) {
      grid.sortDir = grid.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      grid.sortKey = key;
      grid.sortDir = 'asc';
    }
    const inst = apxTable({ container: document.getElementById(`apx-wrap-${gridId}`).parentElement, ...grid });
  };

  window.apxTableSearch = function (gridId, query) {
    const grid = apxGrids.get(gridId);
    if (!grid) return;
    grid.searchQuery = query;
    grid.page = 1;
    const inst = apxTable({ container: document.getElementById(`apx-wrap-${gridId}`).parentElement, ...grid });
  };

  window.apxTableSetLimit = function (gridId, limit) {
    const grid = apxGrids.get(gridId);
    if (!grid) return;
    grid.limit = limit;
    grid.page = 1;
    if (grid.serverSide && grid.onServerPageChange) {
      grid.onServerPageChange(1, limit);
    } else {
      const inst = apxTable({ container: document.getElementById(`apx-wrap-${gridId}`).parentElement, ...grid });
    }
  };

  window.apxTableGoPage = function (gridId, newPage) {
    const grid = apxGrids.get(gridId);
    if (!grid) return;
    grid.page = newPage;
    if (grid.serverSide && grid.onServerPageChange) {
      grid.onServerPageChange(newPage, grid.limit);
    } else {
      const inst = apxTable({ container: document.getElementById(`apx-wrap-${gridId}`).parentElement, ...grid });
    }
  };

  window.apxTableToggleCol = function (gridId, colKey, isChecked) {
    const grid = apxGrids.get(gridId);
    if (!grid) return;
    if (isChecked) grid.visibleCols.add(colKey);
    else grid.visibleCols.delete(colKey);
    const inst = apxTable({ container: document.getElementById(`apx-wrap-${gridId}`).parentElement, ...grid });
  };

  window.apxTableToggleDropdown = function (gridId) {
    const dd = document.getElementById(`apx-cols-${gridId}`);
    if (dd) dd.classList.toggle('open');
  };

  window.apxTableCsv = function (gridId) {
    exportCsv(gridId, `humex_report_${Date.now()}`);
  };

  window.apxTableCopy = function (gridId) {
    exportCopy(gridId);
  };

  window.apxTablePrint = function (gridId) {
    exportPrint(gridId);
  };

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.apx-col-dropdown-wrap')) {
      document.querySelectorAll('.apx-col-dropdown.open').forEach(el => el.classList.remove('open'));
    }
  });

  // ── 6. STEP 4: apxRenderFilterBar Implementation ────────────────────
  function apxRenderFilterBar(config) {
    const {
      container,
      role = 'owner',
      defaults = {},
      providers = [],
      ranges = [],
      managers = [],
      agents = [],
      onSearch = null,
      onExport = null
    } = config;

    const root = typeof container === 'string' ? document.getElementById(container) : container;
    if (!root) return;

    const sRole = String(role).toLowerCase();
    const isOwner = sRole === 'owner' || sRole === 'admin';
    const isManager = sRole === 'manager';
    const isAgent = sRole === 'agent';
    const isClient = sRole === 'client';

    const fromVal = defaults.from || '';
    const toVal = defaults.to || '';

    // Group By chips
    const groupChips = [
      { id: 'hour', label: 'Hour', val: 'hour' },
      { id: 'date', label: 'Date', val: 'date' },
      { id: 'month', label: 'Month', val: 'month' },
      { id: 'range', label: 'Range', val: 'range' },
      { id: 'client', label: 'Client', val: 'client' },
      { id: 'number', label: 'Number', val: 'number' },
      { id: 'cli', label: 'CLI', val: 'cli' }
    ];

    const chipsHtml = groupChips.map(g => `
      <label class="apx-chip" for="apx-grp-${g.id}">
        <input type="checkbox" id="apx-grp-${g.id}" class="apx-grp-chk" value="${g.val}" onchange="this.closest('.apx-chip').classList.toggle('active', this.checked)">
        <span>${g.label}</span>
      </label>
    `).join('');

    root.innerHTML = `
      <div class="apx-filter-strip">
        <!-- Row 1: Field Controls (Role Scoped) -->
        <div class="apx-filter-fields-row">
          <div class="apx-filter-col">
            <label for="apx-f-from">From</label>
            <input type="text" id="apx-f-from" class="apx-input" value="${apxEscape(fromVal)}" placeholder="YYYY-MM-DD HH:mm:ss" onclick="if(window.zyOpenDatePicker)window.zyOpenDatePicker(this)">
          </div>

          <div class="apx-filter-col">
            <label for="apx-f-to">To</label>
            <input type="text" id="apx-f-to" class="apx-input" value="${apxEscape(toVal)}" placeholder="YYYY-MM-DD HH:mm:ss" onclick="if(window.zyOpenDatePicker)window.zyOpenDatePicker(this)">
          </div>

          ${isOwner || isManager ? `
            <div class="apx-filter-col">
              <label for="apx-f-provider">Provider</label>
              <select id="apx-f-provider" class="apx-select">
                <option value="">All Providers</option>
                ${providers.map(p => {
                  const name = typeof p === 'string' ? p : (p.name || p.provider_name || p.id);
                  return `<option value="${apxEscape(name)}">${apxEscape(name)}</option>`;
                }).join('')}
              </select>
            </div>
          ` : ''}

          <div class="apx-filter-col">
            <label for="apx-f-range">Range</label>
            <select id="apx-f-range" class="apx-select">
              <option value="">All Ranges</option>
              ${ranges.map(r => {
                const rName = r.name || r.range_name || r.country || r.id;
                const rId = r.id || rName;
                return `<option value="${apxEscape(rId)}">${apxEscape(rName)}</option>`;
              }).join('')}
            </select>
          </div>

          ${isOwner ? `
            <div class="apx-filter-col">
              <label for="apx-f-manager">Manager</label>
              <select id="apx-f-manager" class="apx-select">
                <option value="">All Managers</option>
                ${managers.map(m => {
                  const mName = m.username || m.name || m.id;
                  return `<option value="${apxEscape(mName)}">${apxEscape(mName)}</option>`;
                }).join('')}
              </select>
            </div>
          ` : ''}

          ${isOwner || isManager ? `
            <div class="apx-filter-col">
              <label for="apx-f-agent">Agent</label>
              <select id="apx-f-agent" class="apx-select">
                <option value="">All Agents</option>
                ${agents.map(a => {
                  const aName = a.username || a.name || a.id;
                  return `<option value="${apxEscape(aName)}">${apxEscape(aName)}</option>`;
                }).join('')}
              </select>
            </div>
          ` : ''}

          ${!isClient ? `
            <div class="apx-filter-col">
              <label for="apx-f-client">Client</label>
              <input type="text" id="apx-f-client" class="apx-input" placeholder="Search Client">
            </div>
          ` : ''}

          <div class="apx-filter-col">
            <label for="apx-f-num">Number</label>
            <input type="text" id="apx-f-num" class="apx-input" placeholder="Filter Number">
          </div>

          <div class="apx-filter-col">
            <label for="apx-f-cli">CLI</label>
            <input type="text" id="apx-f-cli" class="apx-input" placeholder="Filter CLI">
          </div>

          <div class="apx-filter-col">
            <label for="apx-f-cause">Cause</label>
            <select id="apx-f-cause" class="apx-select">
              <option value="All">All Causes</option>
              <option value="1">Success</option>
              <option value="2">ScrubAg</option>
              <option value="3">Others</option>
            </select>
          </div>
        </div>

        <!-- Row 2: Inline Group-By & Action Buttons -->
        <div class="apx-filter-actions-row">
          <div class="apx-groupby-group">
            <span class="apx-groupby-label">Group By:</span>
            <div class="apx-groupby-chips">
              ${chipsHtml}
            </div>
          </div>
          <div class="apx-filter-buttons">
            <button type="button" class="apx-btn apx-btn-warning apx-btn-small" id="apx-btn-export" onclick="if(window.apxFilterExportTrigger)window.apxFilterExportTrigger()">
              <i class="fas fa-file-export"></i> Export Report
            </button>
            <button type="button" class="apx-btn apx-btn-primary apx-btn-small" id="apx-btn-search" onclick="if(window.apxFilterSearchTrigger)window.apxFilterSearchTrigger()">
              <i class="fas fa-chart-column"></i> Show Report
            </button>
          </div>
        </div>
      </div>
    `;

    window.apxFilterSearchTrigger = () => {
      const selectedGroups = Array.from(root.querySelectorAll('.apx-grp-chk:checked')).map(c => c.value);
      const params = {
        from: root.querySelector('#apx-f-from')?.value || '',
        to: root.querySelector('#apx-f-to')?.value || '',
        provider: root.querySelector('#apx-f-provider')?.value || '',
        range_id: root.querySelector('#apx-f-range')?.value || '',
        manager: root.querySelector('#apx-f-manager')?.value || '',
        agent: root.querySelector('#apx-f-agent')?.value || '',
        client: root.querySelector('#apx-f-client')?.value || '',
        num: root.querySelector('#apx-f-num')?.value || '',
        cli: root.querySelector('#apx-f-cli')?.value || '',
        cause: root.querySelector('#apx-f-cause')?.value || 'All',
        group_by: selectedGroups.join(',')
      };
      if (typeof onSearch === 'function') onSearch(params);
    };

    window.apxFilterExportTrigger = () => {
      if (typeof onExport === 'function') onExport();
      else if (window.zyExportCdrAdminStream) window.zyExportCdrAdminStream();
    };
  }

  window.apxRenderFilterBar = apxRenderFilterBar;

})(window, document);
