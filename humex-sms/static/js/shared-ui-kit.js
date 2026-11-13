/* ═══════════════════════════════════════════════════════════════
   𝑴𝑨𝑰𝑻 𝑺𝑴𝑺 — Manager panel inner pages
   Same layout as the reference panel: breadcrumb > intro line >
   panel > DataTable toolbar (Search / Show Records / exports) >
   table > "Showing x to y of z entries" + pager.
   Loaded AFTER speed-panel.js
   ═══════════════════════════════════════════════════════════════ */

/* ── breadcrumb with sub levels ─────────────────────────────── */
function zyCrumb(parts) {
  const host = document.querySelector('.zy-crumb-left') || document.querySelector('.zy-crumb');
  if (!host) return;
  host.innerHTML = `<a onclick="loadPage('dashboard')">Home</a>` +
    parts.map((p, i) => `<span class="zy-sep">&raquo;</span>` +
      (i < parts.length - 1
        ? `<a>${p}</a>`
        : `<span id="breadcrumb">${p}</span>`)).join('');
}

/* ── DataTable with full toolbar ────────────────────────────── */
const ZYT2 = {};
function zyDT2(id, cfg) {
  let existingHidden = {};
  if (ZYT2[id] && ZYT2[id].cols && cfg.cols && ZYT2[id].cols.join(',') === cfg.cols.join(',')) {
    existingHidden = ZYT2[id].hiddenCols || {};
  }
  ZYT2[id] = Object.assign({
    cols: [], rows: [], page: 1, perPage: 25, sort: 0, dir: 1,
    search: '', check: false, ids: [], total: null
  }, cfg);
  ZYT2[id].hiddenCols = Object.assign({}, existingHidden, cfg.hiddenCols || {});
  return `<div class="zy-dt2" id="${id}"></div>`;
}
function zyCell2(c) { return (c && typeof c === 'object') ? c : { v: c, h: c }; }
function zyColClass(colName) {
  if (!colName || typeof colName !== 'string') return '';
  const cn = colName.trim().toLowerCase();
  if (cn.includes('payout') || cn.includes('profit') || cn.includes('rate') || cn.includes('cost') || cn.includes('revenue') || cn.includes('balance') || cn.includes('price')) {
    return 'col-money text-right';
  }
  if (cn === 'date' || cn === 'date time' || cn === 'datetime' || cn === 'timestamp' || cn === 'time') {
    return 'col-date col-fit text-center';
  }
  if (cn === 'number' || cn === 'phone' || cn === 'cli' || cn === 'ip' || cn === 'ip address' || cn.includes('phone') || cn.includes('number')) {
    return 'col-mono';
  }
  if (cn === 'status' || cn === 'cause' || cn === 'state' || cn === 'type' || cn === 'provider') {
    return 'col-status text-center';
  }
  if (cn === 'sms' || cn === 'message' || cn === 'sms message') {
    return 'text-left';
  }
  if (cn === 'currency' || cn === 'curr.' || cn === 'curr') {
    return 'col-curr text-center';
  }
  return '';
}
function zy2Data(t) {
  let rows = t.rows;
  if (t.search) {
    const q = t.search.toLowerCase();
    rows = rows.filter(r => r.some(c => String(zyCell2(c).v ?? '').toLowerCase().includes(q)));
  }
  return rows.slice().sort((a, b) => {
    const x = zyCell2(a[t.sort]).v, y = zyCell2(b[t.sort]).v;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * t.dir;
    return String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true }) * t.dir;
  });
}
function zySortIc(on, dir) {
  const isAsc = on && dir === 1;
  const isDesc = on && dir === -1;
  const stateCls = on ? (isAsc ? 'zy-sort-asc sorted' : 'zy-sort-desc sorted') : 'zy-sort-neutral';
  const title = on ? (isAsc ? 'Sorted ascending' : 'Sorted descending') : 'Click to sort column';
  return `<span class="zy-sort ${stateCls}" title="${title}" aria-hidden="true">` +
    `<svg class="zy-sort-svg" width="9" height="13" viewBox="0 0 10 14" fill="none" xmlns="http://www.w3.org/2000/svg">` +
      `<path class="zy-sort-arr zy-sort-arr-up" d="M5 2L1.8 6.2H8.2L5 2Z" fill="currentColor"/>` +
      `<path class="zy-sort-arr zy-sort-arr-down" d="M5 12L8.2 7.8H1.8L5 12Z" fill="currentColor"/>` +
    `</svg>` +
  `</span>`;
}
function zyImg(n, cls) {
  return `<img class="${cls || ''}" src="${(window.ZY_ICONS_DATA && window.ZY_ICONS_DATA[n]) || ZY_ICON_BASE + n + '.png'}">`;
}
function zy2Render(id) {
  const t = ZYT2[id], host = document.getElementById(id);
  if (!t || !host) return;
  t.hiddenCols = t.hiddenCols || {};
  const isColVisible = (i) => !t.hiddenCols[i];
  const visibleColsCount = t.cols.filter((_, i) => isColVisible(i)).length;

  let slice = [];
  let total = 0;
  let pages = 1;
  let page = 1;
  let from = 0;
  let to = 0;

  if (t.serverMode) {
    total = t.totalRecords != null ? t.totalRecords : t.rows.length;
    pages = t.totalPages || Math.max(1, Math.ceil(total / (t.perPage || 25)));
    page = t.page = Math.max(1, Math.min(t.page || 1, pages));
    from = total > 0 ? (page - 1) * (t.perPage || 25) + 1 : 0;
    to = Math.min(total, from + t.rows.length - 1);
    if (t.sort != null && t.sort >= 0 && Array.isArray(t.rows)) {
      slice = [...t.rows].sort((a, b) => {
        const va = zyCell2(a[t.sort]).v;
        const vb = zyCell2(b[t.sort]).v;
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * (t.dir || 1);
        return String(va ?? '').localeCompare(String(vb ?? ''), undefined, { numeric: true }) * (t.dir || 1);
      });
    } else {
      slice = t.rows;
    }
  } else {
    const rows = zy2Data(t);
    total = rows.length;
    pages = Math.max(1, Math.ceil(total / t.perPage));
    page = t.page = Math.min(t.page, pages);
    from = total ? (page - 1) * t.perPage + 1 : 0;
    to = Math.min(total, page * t.perPage);
    slice = rows.slice((page - 1) * t.perPage, page * t.perPage);
  }

  const nums = [];
  if (pages <= 7) {
    for (let i = 1; i <= pages; i++) nums.push(i);
  } else {
    nums.push(1);
    if (page > 3) nums.push('...');
    const start = Math.max(2, page - 1);
    const end = Math.min(pages - 1, page + 1);
    for (let i = start; i <= end; i++) {
      if (!nums.includes(i)) nums.push(i);
    }
    if (page < pages - 2) nums.push('...');
    if (!nums.includes(pages)) nums.push(pages);
  }

  const pagerButtons = nums.map(n => {
    if (n === '...') return `<span class="zy-pager-ellipsis" style="display:inline-flex;align-items:center;padding:0 6px;color:#94a3b8;font-size:12px;">…</span>`;
    return `<button class="${n === page ? 'on active' : ''}" onclick="zy2Page('${id}',${n})">${n}</button>`;
  }).join('');

  const head =
    (t.check ? `<th class="zy-cbcol"><input type="checkbox" onclick="zy2All('${id}',this)">${zyImg('ui_sort_asc','zy-cbsort')}</th>` : '') +
    t.cols.map((c, i) => {
      if (!isColVisible(i)) return '';
      const cName = typeof c === 'string' ? c : (c && (c.title || c.name || c.label || '')) || '';
      const cls = `${i === t.sort ? 'sorted' : ''} ${zyColClass(cName)}`.trim();
      return `<th class="${cls}" onclick="zy2Sort('${id}',${i})">${c}${zySortIc(i === t.sort, t.dir)}</th>`;
    }).join('');

  const body = slice.length ? slice.map((r, ri) => `<tr>` +
      (t.check ? `<td class="zy-cbcol"><input type="checkbox" class="zy-cb-${id}" value="${r.__id ?? ri}"></td>` : '') +
      r.map((c, i) => {
        if (!isColVisible(i)) return '';
        const cName = typeof t.cols[i] === 'string' ? t.cols[i] : (t.cols[i] && (t.cols[i].title || t.cols[i].name || t.cols[i].label || '')) || '';
        const cls = `${i === t.sort ? 'sorted' : ''} ${zyColClass(cName)}`.trim();
        return `<td class="${cls}">${zyCell2(c).h ?? ''}</td>`;
      }).join('') +
      `</tr>`).join('')
    : `<tr><td class="zy-empty zy-empty-cell" colspan="${visibleColsCount + (t.check ? 1 : 0)}">${
        t.search
          ? (typeof zyEmptyState === 'function'
              ? zyEmptyState({ icon: 'fa-magnifying-glass', title: 'No matching records', desc: `No entries match "${t.search.replace(/"/g, '&quot;')}".`, actionLabel: 'Clear Search', actionOnClick: `zy2Search('${id}','')` })
              : 'No matching records')
          : (typeof zyEmptyState === 'function'
              ? zyEmptyState({ icon: 'fa-inbox', title: 'No data available', desc: 'There are no records in this view.' })
              : 'No data available in table')
      }</td></tr>`;

  let footHtml = '';
  if (t.footRow) {
    const tdMatches = t.footRow.match(/<td[\s\S]*?<\/td>/gi) || [];
    const neededCols = visibleColsCount + (t.check ? 1 : 0);
    const textOf = (html) => String(html || '').replace(/<[^>]+>/g, '').trim();

    if (tdMatches.length === t.cols.length) {
      const firstVisColIdx = t.cols.findIndex((_, idx) => isColVisible(idx));
      let visibleTds = [];
      t.cols.forEach((col, i) => {
        if (!isColVisible(i)) return;
        let td = tdMatches[i];
        if (!isColVisible(0) && i === firstVisColIdx && textOf(tdMatches[0]).length > 0 && textOf(td).length === 0) {
          td = tdMatches[0];
        }
        const cName = typeof col === 'string' ? col : (col && (col.title || col.name || col.label || '')) || '';
        const alignCls = zyColClass(cName);
        if (alignCls) {
          td = td.replace(/^<td(?:\s+class="([^"]*)")?/i, (m, existing) => {
            const merged = `${existing || ''} ${alignCls}`.trim();
            return `<td class="${merged}"`;
          });
        }
        visibleTds.push(td);
      });
      if (t.check) visibleTds.unshift('<td class="zy-cbcol"></td>');
      footHtml = `<tfoot><tr>${visibleTds.join('')}</tr></tfoot>`;
    } else if (tdMatches.length > 0) {
      const isCellEmpty = (c) => textOf(c).length === 0;
      const firstEmpty = tdMatches.findIndex(isCellEmpty);
      let lastEmpty = -1;
      for (let j = tdMatches.length - 1; j >= 0; j--) {
        if (isCellEmpty(tdMatches[j])) { lastEmpty = j; break; }
      }
      const headCells = firstEmpty > -1 ? tdMatches.slice(0, firstEmpty) : (tdMatches.length ? [tdMatches[0]] : []);
      const tailCells = (lastEmpty > -1 && lastEmpty < tdMatches.length - 1) ? tdMatches.slice(lastEmpty + 1) : [];

      let dataCells = [];
      const spacersNeeded = Math.max(0, visibleColsCount - (headCells.length + tailCells.length));

      if (headCells.length + tailCells.length <= visibleColsCount) {
        dataCells = [...headCells, ...Array(spacersNeeded).fill('<td></td>'), ...tailCells];
      } else {
        const availForTail = Math.max(0, visibleColsCount - headCells.length);
        if (availForTail > 0) {
          dataCells = [...headCells, ...tailCells.slice(tailCells.length - availForTail)];
        } else {
          dataCells = headCells.slice(0, visibleColsCount);
        }
      }

      while (dataCells.length < visibleColsCount) dataCells.push('<td></td>');
      if (dataCells.length > visibleColsCount) dataCells = dataCells.slice(0, visibleColsCount);

      if (t.check) dataCells.unshift('<td class="zy-cbcol"></td>');
      footHtml = `<tfoot><tr>${dataCells.join('')}</tr></tfoot>`;
    } else {
      footHtml = `<tfoot><tr>${t.footRow}</tr></tfoot>`;
    }
  }

  const hideInternalControls = !!(t.noTopBar || t.hideToolbar || id === 'dt-cdr');

  host.innerHTML = `
    ${!hideInternalControls ? `
    <div class="zy-dt2-top">
      <div class="zy-search"><label>Search:</label>
        ${zyImg('ui_search', 'zy-mag')}
        <input value="${t.search.replace(/"/g, '&quot;')}" oninput="zy2Search('${id}',this.value)"></div>
      <div class="zy-show">
        <select onchange="zy2Size('${id}',this.value)">
          ${[10, 25, 50, 100, 500, 1000, 2000, 5000, 10000].map(n => `<option ${n === t.perPage ? 'selected' : ''}>${n}</option>`).join('')}
        </select>
        <div class="zy-show-lbl">Show Records:</div>
      </div>
    </div>
    <div class="zy-exp">
      <button onclick="zy2Export('${id}','copy')">Copy</button>
      <button onclick="zy2Export('${id}','csv')">CSV</button>
      <button onclick="zy2Export('${id}','excel')">Excel</button>
      <button onclick="zy2Export('${id}','pdf')">PDF</button>
      <button onclick="zy2Export('${id}','print')">Print</button>
      <button class="zy-cols" onclick="zy2Cols('${id}', this)">Show / hide columns</button>
    </div>` : ''}
    <div class="zy-dt-wrap apx-table-scroll"><table class="zy-dt zy-dt2-table apx-table">
      <thead><tr>${head}</tr></thead><tbody>${body}</tbody>
      ${footHtml}
    </table></div>
    <div class="zy-dt2-foot">
      <div class="zy-info">Showing ${from ? from.toLocaleString() : 0} to ${to ? to.toLocaleString() : 0} of ${total.toLocaleString()} entries</div>
      <div class="zy-pager">
        <button ${page <= 1 ? 'disabled' : ''} onclick="zy2Page('${id}',1)" title="First Page">«</button>
        <button ${page <= 1 ? 'disabled' : ''} onclick="zy2Page('${id}',${page - 1})" title="Previous Page">‹</button>
        ${pagerButtons}
        <button ${page >= pages ? 'disabled' : ''} onclick="zy2Page('${id}',${page + 1})" title="Next Page">›</button>
        <button ${page >= pages ? 'disabled' : ''} onclick="zy2Page('${id}',${pages})" title="Last Page">»</button>
      </div>
    </div>`;
}
function zy2Sort(id, i) {
  const t = ZYT2[id];
  if (!t) return;
  if (t.sort === i) t.dir = -t.dir; else { t.sort = i; t.dir = 1; }
  t.page = 1;
  zy2Render(id);
}
function zy2Page(id, p) {
  const t = ZYT2[id];
  if (!t) return;
  const targetPage = Math.max(1, p);
  if (t.serverMode && typeof t.onPageChange === 'function') {
    t.page = targetPage;
    t.onPageChange(targetPage);
    return;
  }
  t.page = targetPage;
  zy2Render(id);
}
function zy2Size(id, v) {
  const t = ZYT2[id];
  if (!t) return;
  const newSize = parseInt(v, 10) || 25;
  t.perPage = newSize;
  t.page = 1;
  if (t.serverMode && typeof t.onSizeChange === 'function') {
    t.onSizeChange(newSize);
    return;
  }
  zy2Render(id);
}
function zy2Search(id, v) { const t = ZYT2[id]; if (!t) return; t.search = v; t.page = 1; zy2Render(id); const el = document.querySelector(`#${id} .zy-search input`); if (el) { el.focus(); el.setSelectionRange(v.length, v.length); } }
function zy2All(id, el) {
  document.querySelectorAll(`.zy-cb-${id}`).forEach(c => c.checked = el.checked);
  if (typeof window.zySyncSelectionBar === 'function') window.zySyncSelectionBar(id);
}
function zy2Checked(id) { return Array.from(document.querySelectorAll(`.zy-cb-${id}`)).filter(c => c.checked).map(c => c.value); }

if (typeof document !== 'undefined') {
  document.addEventListener('change', e => {
    if (e.target && e.target.type === 'checkbox') {
      const cls = Array.from(e.target.classList || []).find(c => c.startsWith('zy-cb-'));
      if (cls && typeof window.zySyncSelectionBar === 'function') {
        window.zySyncSelectionBar(cls.replace('zy-cb-', ''));
      }
    }
  });
}

function zy2Cols(id, anchorEl) {
  let t = ZYT2[id];
  // Auto-resolve aliases if not directly matched
  if (!t) {
    if (id === 'dt-cdr') t = ZYT2['dt-reports'] || ZYT2['dt-my-sms'] || ZYT2['dt-testcdr'] || ZYT2['dt-stats'];
    else if (id === 'dt-reports') t = ZYT2['dt-cdr'];
    else if (id === 'dt-my-sms') t = ZYT2['dt-cdr'] || ZYT2['dt-reports'];
    else if (id === 'dt-testnums') t = ZYT2['dt-testnums'];
    else if (id === 'dt-testlog') t = ZYT2['dt-testlog'];
  }

  // If table is a standard HTML table in DOM (not in ZYT2)
  if (!t) {
    let table = document.getElementById(id) || document.querySelector('#' + id);
    if (!table && anchorEl) {
      table = anchorEl.closest('.card, .zy-panel, .panel-box, .table-wrap, .zy-dt-wrap')?.querySelector('table') ||
              document.querySelector(`table[data-table-id="${id}"]`) ||
              anchorEl.parentElement?.parentElement?.querySelector('table') ||
              anchorEl.parentElement?.parentElement?.nextElementSibling?.querySelector('table');
    }
    if (!table) table = document.querySelector('table');
    if (table) {
      zyHtmlTableCols(table, id, anchorEl);
      return;
    }
    return;
  }

  t.hiddenCols = t.hiddenCols || {};

  const existing = document.getElementById('zy-cols-popover');
  if (existing) {
    const wasSame = existing._targetId === id;
    existing.remove();
    if (wasSame) return;
  }

  const btn = anchorEl || (typeof event !== 'undefined' && event?.currentTarget) || document.querySelector(`#${id} .zy-cols`) || document.getElementById(id);
  const isDark = document.body.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark';
  const popBg = isDark ? '#1e293b' : '#ffffff';
  const popBorder = isDark ? '#334155' : '#cbd5e1';
  const popText = isDark ? '#f8fafc' : '#1e293b';
  const popMuted = isDark ? '#94a3b8' : '#64748b';
  const hoverBg = isDark ? '#334155' : '#f1f5f9';

  const pop = document.createElement('div');
  pop.id = 'zy-cols-popover';
  pop._targetId = id;
  pop.style.cssText = `position:absolute;z-index:99999;background:${popBg};border:1px solid ${popBorder};border-radius:8px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.25),0 8px 10px -6px rgba(0,0,0,0.15);width:230px;padding:10px 12px;font-family:inherit;font-size:13px;color:${popText};`;

  if (btn && btn.getBoundingClientRect) {
    const rect = btn.getBoundingClientRect();
    pop.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    const leftPos = rect.right + window.scrollX - 230;
    pop.style.left = Math.max(10, leftPos) + 'px';
  } else {
    pop.style.top = '120px';
    pop.style.right = '20px';
  }

  const items = t.cols.map((c, i) => {
    const isChecked = !t.hiddenCols[i];
    return `
      <label style="display:flex;align-items:center;gap:8px;padding:5px 6px;cursor:pointer;border-radius:4px;user-select:none;color:${popText};font-size:12.5px;transition:background 0.15s;" onmouseover="this.style.background='${hoverBg}'" onmouseout="this.style.background='transparent'">
        <input type="checkbox" id="zy2-chk-${id}-${i}" ${isChecked ? 'checked' : ''} onchange="zy2ToggleCol('${id}', ${i}, this.checked)" style="width:15px;height:15px;cursor:pointer;accent-color:#2563eb;">
        <span>${c}</span>
      </label>
    `;
  }).join('');

  pop.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid ${popBorder};">
      <span style="font-size:11px;font-weight:700;color:${popMuted};text-transform:uppercase;letter-spacing:0.5px;">Show / Hide Columns</span>
      <button type="button" onclick="document.getElementById('zy-cols-popover')?.remove()" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:16px;padding:0 4px;line-height:1;">&times;</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:8px;">
      <a href="javascript:void(0)" onclick="zy2SetAllCols('${id}', true)" style="font-size:11px;font-weight:600;color:#2563eb;text-decoration:none;">Show All</a>
      <span style="color:${popBorder};">|</span>
      <a href="javascript:void(0)" onclick="zy2ResetCols('${id}')" style="font-size:11px;font-weight:600;color:${popMuted};text-decoration:none;">Reset</a>
    </div>
    <div style="max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;">
      ${items}
    </div>
  `;

  document.body.appendChild(pop);

  setTimeout(() => {
    const onDocClick = (e) => {
      if (!pop.contains(e.target) && (!btn || !btn.contains(e.target))) {
        pop.remove();
        document.removeEventListener('click', onDocClick);
      }
    };
    document.addEventListener('click', onDocClick);
  }, 10);
}

function zyHtmlTableCols(table, id, anchorEl) {
  const existing = document.getElementById('zy-cols-popover');
  if (existing) {
    const wasSame = existing._targetId === id;
    existing.remove();
    if (wasSame) return;
  }

  // Extract column headers
  const ths = Array.from(table.querySelectorAll('thead th, tr:first-child th'));
  if (!ths.length) return;
  const colNames = ths.map(th => th.textContent.replace(/[▲▼↑↓]/g, '').trim());

  table._hiddenCols = table._hiddenCols || {};

  const btn = anchorEl || (typeof event !== 'undefined' && event?.currentTarget) || document.getElementById(id);
  const isDark = document.body.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark';
  const popBg = isDark ? '#1e293b' : '#ffffff';
  const popBorder = isDark ? '#334155' : '#cbd5e1';
  const popText = isDark ? '#f8fafc' : '#1e293b';
  const popMuted = isDark ? '#94a3b8' : '#64748b';
  const hoverBg = isDark ? '#334155' : '#f1f5f9';

  const pop = document.createElement('div');
  pop.id = 'zy-cols-popover';
  pop._targetId = id;
  pop.style.cssText = `position:absolute;z-index:99999;background:${popBg};border:1px solid ${popBorder};border-radius:8px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.25),0 8px 10px -6px rgba(0,0,0,0.15);width:230px;padding:10px 12px;font-family:inherit;font-size:13px;color:${popText};`;

  if (btn && btn.getBoundingClientRect) {
    const rect = btn.getBoundingClientRect();
    pop.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    const leftPos = rect.right + window.scrollX - 230;
    pop.style.left = Math.max(10, leftPos) + 'px';
  } else {
    pop.style.top = '120px';
    pop.style.right = '20px';
  }

  const items = colNames.map((c, i) => {
    const isChecked = !table._hiddenCols[i];
    return `
      <label style="display:flex;align-items:center;gap:8px;padding:5px 6px;cursor:pointer;border-radius:4px;user-select:none;color:${popText};font-size:12.5px;transition:background 0.15s;" onmouseover="this.style.background='${hoverBg}'" onmouseout="this.style.background='transparent'">
        <input type="checkbox" id="zy-html-chk-${id}-${i}" ${isChecked ? 'checked' : ''} onchange="zyToggleHtmlCol('${id}', ${i}, this.checked)" style="width:15px;height:15px;cursor:pointer;accent-color:#2563eb;">
        <span>${c || ('Col ' + (i + 1))}</span>
      </label>
    `;
  }).join('');

  pop.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid ${popBorder};">
      <span style="font-size:11px;font-weight:700;color:${popMuted};text-transform:uppercase;letter-spacing:0.5px;">Show / Hide Columns</span>
      <button type="button" onclick="document.getElementById('zy-cols-popover')?.remove()" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:16px;padding:0 4px;line-height:1;">&times;</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:8px;">
      <a href="javascript:void(0)" onclick="zySetAllHtmlCols('${id}', true)" style="font-size:11px;font-weight:600;color:#2563eb;text-decoration:none;">Show All</a>
      <span style="color:${popBorder};">|</span>
      <a href="javascript:void(0)" onclick="zySetAllHtmlCols('${id}', false)" style="font-size:11px;font-weight:600;color:${popMuted};text-decoration:none;">Reset</a>
    </div>
    <div style="max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;">
      ${items}
    </div>
  `;

  document.body.appendChild(pop);

  setTimeout(() => {
    const onDocClick = (e) => {
      if (!pop.contains(e.target) && (!btn || !btn.contains(e.target))) {
        pop.remove();
        document.removeEventListener('click', onDocClick);
      }
    };
    document.addEventListener('click', onDocClick);
  }, 10);
}

function zyToggleHtmlCol(id, colIndex, isVisible) {
  let table = document.getElementById(id) || document.querySelector('#' + id);
  if (!table) table = document.querySelector(`table[data-table-id="${id}"]`) || document.querySelector('table');
  if (!table) return;

  table._hiddenCols = table._hiddenCols || {};
  const ths = Array.from(table.querySelectorAll('thead th, tr:first-child th'));
  const totalCols = ths.length;

  if (isVisible) {
    delete table._hiddenCols[colIndex];
  } else {
    const visibleCount = totalCols - Object.keys(table._hiddenCols).length;
    if (visibleCount <= 1) {
      if (typeof toast === 'function') toast('At least one column must remain visible', 'warning');
      const cb = document.getElementById(`zy-html-chk-${id}-${colIndex}`);
      if (cb) cb.checked = true;
      return;
    }
    table._hiddenCols[colIndex] = true;
  }

  zyApplyHtmlColVisibility(table);
}

function zyApplyHtmlColVisibility(table) {
  if (!table) return;
  table._hiddenCols = table._hiddenCols || {};
  const rows = Array.from(table.querySelectorAll('thead tr, tbody tr'));
  rows.forEach(tr => {
    const cells = Array.from(tr.children);
    cells.forEach((cell, idx) => {
      if (table._hiddenCols[idx]) {
        cell.style.display = 'none';
      } else {
        cell.style.display = '';
      }
    });
  });

  // Handle tfoot rows: if normal cells, toggle display; if single colspan cell, update colspan dynamically
  const footRows = Array.from(table.querySelectorAll('tfoot tr'));
  const ths = Array.from(table.querySelectorAll('thead th, tr:first-child th'));
  const visibleCount = Math.max(1, ths.length - Object.keys(table._hiddenCols).length);

  footRows.forEach(tr => {
    const cells = Array.from(tr.children);
    if (cells.length === 1 && cells[0].hasAttribute('colspan')) {
      cells[0].colSpan = visibleCount;
    } else {
      cells.forEach((cell, idx) => {
        if (table._hiddenCols[idx]) {
          cell.style.display = 'none';
        } else {
          cell.style.display = '';
        }
      });
    }
  });
}

function zySetAllHtmlCols(id, visible) {
  let table = document.getElementById(id) || document.querySelector('#' + id);
  if (!table) table = document.querySelector(`table[data-table-id="${id}"]`) || document.querySelector('table');
  if (!table) return;
  table._hiddenCols = {};
  const ths = Array.from(table.querySelectorAll('thead th, tr:first-child th'));
  ths.forEach((_, i) => {
    const cb = document.getElementById(`zy-html-chk-${id}-${i}`);
    if (cb) cb.checked = true;
  });
  zyApplyHtmlColVisibility(table);
}

function zyExportHtmlTable(id, kind) {
  let table = document.getElementById(id) || document.querySelector('#' + id) || document.querySelector('table');
  if (!table) return;
  const rows = Array.from(table.querySelectorAll('tr'));
  const visibleRows = rows.map(r =>
    Array.from(r.children).filter(c => c.style.display !== 'none').map(c => c.innerText.trim().replace(/\n+/g, ' '))
  );
  if (!visibleRows.length) return;

  if (kind === 'copy') {
    const text = visibleRows.map(r => r.join('\t')).join('\n');
    navigator.clipboard && navigator.clipboard.writeText(text);
    if (typeof toast === 'function') toast('Copied ' + visibleRows.length + ' rows', 'success');
    return;
  }
  if (kind === 'csv' || kind === 'excel') {
    const csv = visibleRows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = id + (kind === 'excel' ? '.xls' : '.csv');
    a.click();
    return;
  }
  if (kind === 'print') {
    const w = window.open('', '_blank');
    w.document.write(`<table border=1 cellspacing=0 cellpadding=6>${visibleRows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`);
    w.document.close();
    w.print();
  }
}

function zyPrintHtmlTable(id) {
  zyExportHtmlTable(id, 'print');
}

function zyRenderTableToolbar(tableId, opts = {}) {
  const title = opts.title || '';
  return `
    <div class="zy-table-toolbar" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-bottom:none;border-radius:6px 6px 0 0;">
      <div style="font-size:12.5px;font-weight:600;color:#475569;">
        ${title ? `<i class="fas fa-table" style="margin-right:6px;color:#64748b;"></i>${title}` : ''}
      </div>
      <div class="zy-toolbar-pills" style="display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" class="zy-btn-pill" onclick="zyExportHtmlTable('${tableId}','copy')"><i class="fas fa-copy"></i> Copy</button>
        <button type="button" class="zy-btn-pill" onclick="zyExportHtmlTable('${tableId}','csv')"><i class="fas fa-file-csv"></i> CSV</button>
        <button type="button" class="zy-btn-pill" onclick="zyExportHtmlTable('${tableId}','excel')"><i class="fas fa-file-excel"></i> Excel</button>
        <button type="button" class="zy-btn-pill" onclick="zyPrintHtmlTable('${tableId}')"><i class="fas fa-print"></i> Print</button>
        <button type="button" class="zy-btn-pill" onclick="zyToggleColumnsModal('${tableId}', this)"><i class="fas fa-columns"></i> Columns</button>
      </div>
    </div>
  `;
}

function zy2ToggleCol(id, i, isVisible) {
  const t = ZYT2[id];
  if (!t) return;
  t.hiddenCols = t.hiddenCols || {};
  if (isVisible) {
    delete t.hiddenCols[i];
  } else {
    const visibleCount = t.cols.filter((_, idx) => !t.hiddenCols[idx]).length;
    if (visibleCount <= 1) {
      if (typeof toast === 'function') toast('At least one column must remain visible', 'warning');
      const cb = document.getElementById(`zy2-chk-${id}-${i}`);
      if (cb) cb.checked = true;
      return;
    }
    t.hiddenCols[i] = true;
  }
  zy2Render(id);
}

function zy2SetAllCols(id, visible) {
  const t = ZYT2[id];
  if (!t) return;
  t.hiddenCols = {};
  t.cols.forEach((_, i) => {
    const cb = document.getElementById(`zy2-chk-${id}-${i}`);
    if (cb) cb.checked = true;
  });
  zy2Render(id);
}

function zy2ResetCols(id) {
  zy2SetAllCols(id, true);
}

function zy2Export(id, kind) {
  const t = ZYT2[id], rows = zy2Data(t);
  t.hiddenCols = t.hiddenCols || {};
  const isColVisible = (i) => !t.hiddenCols[i];
  const visibleCols = t.cols.filter((_, i) => isColVisible(i));
  const visibleRows = rows.map(r => r.filter((_, i) => isColVisible(i)));

  const text = [visibleCols.join('\t')].concat(visibleRows.map(r => r.map(c => String(zyCell2(c).v ?? '')).join('\t'))).join('\n');
  if (kind === 'copy') {
    navigator.clipboard && navigator.clipboard.writeText(text);
    if (typeof toast === 'function') toast('Copied ' + visibleRows.length + ' rows', 'success');
    return;
  }
  if (kind === 'csv' || kind === 'excel') {
    const csv = [visibleCols.join(',')].concat(visibleRows.map(r => r.map(c => `"${String(zyCell2(c).v ?? '').replace(/"/g, '""')}"`).join(','))).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = id + (kind === 'excel' ? '.xls' : '.csv'); a.click();
    return;
  }
  const w = window.open('', '_blank');
  w.document.write(`<table border=1 cellspacing=0 cellpadding=6><tr>${visibleCols.map(c => `<th>${c}</th>`).join('')}</tr>` +
    visibleRows.map(r => `<tr>${r.map(c => `<td>${zyCell2(c).v ?? ''}</td>`).join('')}</tr>`).join('') + `</table>`);
  w.document.close(); w.print();
}


/* ── select2-style picker (same behaviour as the source panel) ── */
const ZY_S2 = {};
function zyS2(id, placeholder, items, onPick) {
  ZY_S2[id] = { items: items || [], value: '', onPick: onPick || null, ph: placeholder };
  return `<div class="zy-s2" id="${id}">
    <div class="zy-s2-box" onclick="zyS2Toggle('${id}')"><span>${placeholder}</span>${zyImg('ui_caret')}</div>
    <div class="zy-s2-drop">
      <div class="zy-s2-search"><input placeholder="" oninput="zyS2Filter('${id}',this.value)"></div>
      <div class="zy-s2-list"></div>
    </div></div>`;
}
function zyS2Fill(id, list) {
  const host = document.querySelector(`#${id} .zy-s2-list`); if (!host) return;
  const t = ZY_S2[id];
  host.innerHTML = list.length
    ? list.map(v => `<div class="${v === t.value ? 'on' : ''}" data-v="${zyEsc(v)}" onclick="zyS2Pick('${id}',this.dataset.v)">- ${zyEsc(v)}</div>`).join('')
    : `<div class="zy-s2-none">No results found</div>`;
}
function zyS2Toggle(id) {
  const el = document.getElementById(id); if (!el) return;
  document.querySelectorAll('.zy-s2.open').forEach(o => { if (o !== el) o.classList.remove('open'); });
  el.classList.toggle('open');
  if (el.classList.contains('open')) {
    zyS2Fill(id, ZY_S2[id].items);
    const inp = el.querySelector('.zy-s2-search input'); if (inp) { inp.value = ''; inp.focus(); }
  }
}
function zyS2Filter(id, q) {
  const s = (q || '').toLowerCase();
  zyS2Fill(id, ZY_S2[id].items.filter(v => v.toLowerCase().includes(s)));
}
function zyS2Pick(id, v) {
  const t = ZY_S2[id]; t.value = v;
  const box = document.querySelector(`#${id} .zy-s2-box`);
  box.classList.add('picked'); box.querySelector('span').textContent = v;
  document.getElementById(id).classList.remove('open');
  if (t.onPick) t.onPick(v);
}
function zyS2Value(id) { return (ZY_S2[id] || {}).value || ''; }
document.addEventListener('click', e => {
  if (!e.target.closest('.zy-s2')) document.querySelectorAll('.zy-s2.open').forEach(o => o.classList.remove('open'));
});

/* ── modal in the reference panel's style ───────────────────── */
function zyModal(title, body, footer) {
  const m = document.getElementById('modal');
  m.classList.add('zy-modal');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML =
    `<div class="zy-modal-body">${body}</div>` + (footer ? `<div class="zy-modal-foot">${footer}</div>` : '');
  const ov = document.getElementById('modal-overlay');
  ov.classList.add('active', 'show');   // 'show' is what style.css actually displays
  ov.style.display = 'flex';
}

/* The panels' own closeModal() only drops the 'show' class, so a modal opened
   by zyModal (which also sets an inline display:flex) stayed on screen after
   Add/Delete — the page looked stuck on the form. Close it properly. */
(function () {
  const prev = window.closeModal;
  window.closeModal = function () {
    if (typeof prev === 'function') { try { prev(); } catch (e) {} }
    const ov = document.getElementById('modal-overlay');
    if (ov) { ov.classList.remove('active', 'show'); ov.style.display = ''; }
    const m = document.getElementById('modal');
    if (m) m.classList.remove('zy-modal');
  };
})();

const zyList = v => Array.isArray(v) ? v : ((v && v.data) || []);
const zyEsc = s => String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

/* Request Numbers & Self-Allocate Modals (Real Backend Policy & Limits) */
window.zyFetchAllocPolicy = async function() {
  if (typeof apiFetch !== 'function') return { mode: 'request', daily_limit: 0, total_limit: 0, used_today: 0, total_held: 0, pending_requested: 0 };
  try {
    const p = await apiFetch('/api/numbers/allocation-policy');
    if (p && p.mode) {
      window.ZY_ALLOC_POLICY = p;
      return p;
    }
  } catch (_) {}
  return window.ZY_ALLOC_POLICY || { mode: 'request', daily_limit: 0, total_limit: 0, used_today: 0, total_held: 0, pending_requested: 0 };
};

window.zyFormatAllocLimitHint = function(policy, actionWord) {
  if (!policy) return '';
  const parts = [];
  if (Number(policy.daily_limit) > 0) {
    parts.push(`Daily limit: <b>${Number(policy.daily_remaining ?? 0).toLocaleString()}</b> of <b>${Number(policy.daily_limit).toLocaleString()}</b> left today (used ${Number(policy.used_today || 0).toLocaleString()})`);
  } else {
    parts.push(`Daily limit: <b>Unlimited</b> (used ${Number(policy.used_today || 0).toLocaleString()} today)`);
  }
  if (Number(policy.total_limit) > 0) {
    parts.push(`Overall limit: <b>${Number(policy.total_remaining ?? 0).toLocaleString()}</b> of <b>${Number(policy.total_limit).toLocaleString()}</b> left (held ${Number(policy.total_held || 0).toLocaleString()}, pending ${Number(policy.pending_requested || 0).toLocaleString()})`);
  }
  return parts.join('<br>');
};

window.zyOpenRequestNumbersModal = async function(rangeName, rangeId, passedPolicy, onDone) {
  const policy = passedPolicy || await window.zyFetchAllocPolicy();
  window._zyOnAllocModalDone = typeof onDone === 'function' ? onDone : null;
  if (policy && policy.mode === 'self_allocate') {
    return window.zyOpenSelfAllocateModal(rangeName, rangeId, policy, onDone);
  }
  const maxByDaily = Number(policy.daily_limit) > 0 ? Math.max(0, Number(policy.daily_remaining ?? 0)) : Infinity;
  const maxByTotal = Number(policy.total_limit) > 0 ? Math.max(0, Number(policy.total_remaining ?? 0)) : Infinity;
  const maxAllowed = Math.min(maxByDaily, maxByTotal, 5000);
  const blocked = maxAllowed <= 0 && (Number(policy.daily_limit) > 0 || Number(policy.total_limit) > 0);
  const limitHint = window.zyFormatAllocLimitHint(policy, 'request');

  zyModal('Request Numbers', `
    <div class="zy-modal-summary-card" style="background:#f8fafc;border-radius:12px;padding:12px 14px;margin-bottom:14px;border:1px solid #e2e8f0;">
      <div style="font-weight:800;color:#0f172a;font-size:14px;">${zyEsc(rangeName)}</div>
      <div style="font-size:11.5px;color:#475569;margin-top:4px;">Mode: <b>Request Approval</b></div>
    </div>
    <div style="margin-bottom:12px;">
      <label style="display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:6px;">Payment Term</label>
      <select id="req-payterm" class="zy-select-pill">
        <option value="Weekly" selected>Weekly</option>
        <option value="1/1">1/1</option>
        <option value="7/1">7/1</option>
        <option value="7/7">7/7</option>
        <option value="15/15">15/15</option>
        <option value="15/30">15/30</option>
        <option value="Monthly60">Monthly60</option>
      </select>
    </div>
    <div style="margin-bottom:12px;">
      <label style="display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:6px;">Quantity</label>
      <input type="number" id="req-qty" class="zy-select-pill" min="1" ${Number.isFinite(maxAllowed) ? `max="${Math.max(1, maxAllowed)}"` : ''} value="${blocked ? 0 : Math.min(10, Number.isFinite(maxAllowed) ? Math.max(1, maxAllowed) : 10)}" ${blocked ? 'disabled' : ''}>
      <div style="font-size:11.5px;color:${blocked ? '#dc2626' : '#64748b'};margin-top:6px;line-height:1.5;">
        ${blocked ? '<b>Limit reached:</b> You have 0 remaining numbers available under your assigned limit.' : limitHint}
      </div>
    </div>
    <div style="margin-bottom:8px;">
      <label style="display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:6px;">Notes (Optional)</label>
      <input type="text" id="req-notes" class="zy-select-pill" placeholder="Optional note for approval">
    </div>
  `, `
    <div style="display:flex;justify-content:flex-end;align-items:center;gap:10px;width:100%;">
      <button type="button" class="zy-btn-pill-cancel" onclick="closeModal()">Close</button>
      <button type="button" class="zy-btn-pill-submit" id="zy-req-submit-btn" ${blocked ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''} onclick="zySubmitRangeRequest('${zyEsc(rangeName)}','${zyEsc(rangeId || '')}')">Submit Request</button>
    </div>
  `);
};

window.zySubmitRangeRequest = async function(rangeName, rangeId) {
  const pt = document.getElementById('req-payterm')?.value || 'Weekly';
  const qty = parseInt(document.getElementById('req-qty')?.value || '0', 10);
  const notes = (document.getElementById('req-notes')?.value || '').trim();
  const btn = document.getElementById('zy-req-submit-btn');
  if (!qty || qty < 1) {
    if (typeof toast === 'function') toast('Please enter a valid quantity', 'error');
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }
  try {
    const res = await apiFetch('/api/numbers/request', {
      method: 'POST',
      body: JSON.stringify({
        range_id: rangeId ? (Number(rangeId) || rangeId) : undefined,
        range_name: rangeName,
        payterm: pt,
        quantity: qty,
        notes: notes ? `Payterm: ${pt} | ${notes}` : `Payterm: ${pt}`,
        urgency: 'normal'
      })
    });
    if (!res || res.error) {
      throw new Error((res && res.error) || 'Failed to submit number request');
    }
    if (typeof closeModal === 'function') closeModal();
    const msg = res.message || `Requested ${qty} number(s) for ${rangeName} (${pt})`;
    if (typeof toast === 'function') toast(msg, 'success');
    else if (typeof zyFlash === 'function') zyFlash(msg);
    if (typeof window._zyOnAllocModalDone === 'function') window._zyOnAllocModalDone();
  } catch (e) {
    if (typeof toast === 'function') toast(e.message || 'Request failed', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Submit Request'; }
  }
};

window.zyOpenSelfAllocateModal = async function(rangeName, rangeId, passedPolicy, onDone) {
  const policy = passedPolicy || await window.zyFetchAllocPolicy();
  window._zyOnAllocModalDone = typeof onDone === 'function' ? onDone : null;
  if (policy && policy.mode === 'request') {
    return window.zyOpenRequestNumbersModal(rangeName, rangeId, policy, onDone);
  }
  const maxByDaily = Number(policy.daily_limit) > 0 ? Math.max(0, Number(policy.daily_remaining ?? 0)) : Infinity;
  const maxByTotal = Number(policy.total_limit) > 0 ? Math.max(0, Number(policy.total_remaining ?? 0)) : Infinity;
  const maxAllowed = Math.min(maxByDaily, maxByTotal, 5000);
  const blocked = maxAllowed <= 0 && (Number(policy.daily_limit) > 0 || Number(policy.total_limit) > 0);
  const limitHint = window.zyFormatAllocLimitHint(policy, 'allocate');

  zyModal('Self-Allocate Numbers', `
    <div class="zy-modal-summary-card" style="background:#f8fafc;border-radius:12px;padding:12px 14px;margin-bottom:14px;border:1px solid #e2e8f0;">
      <div style="font-weight:800;color:#0f172a;font-size:14px;">${zyEsc(rangeName)}</div>
      <div style="font-size:11.5px;color:#047857;margin-top:4px;">Mode: <b>Self-Allocate (Instant Pool Assignment)</b></div>
    </div>
    <div style="margin-bottom:12px;">
      <label style="display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:6px;">Quantity</label>
      <input type="number" id="sa-qty" class="zy-select-pill" min="1" ${Number.isFinite(maxAllowed) ? `max="${Math.max(1, maxAllowed)}"` : ''} value="${blocked ? 0 : Math.min(10, Number.isFinite(maxAllowed) ? Math.max(1, maxAllowed) : 10)}" ${blocked ? 'disabled' : ''}>
      <div style="font-size:11.5px;color:${blocked ? '#dc2626' : '#64748b'};margin-top:6px;line-height:1.5;">
        ${blocked ? '<b>Limit reached:</b> You have 0 remaining numbers available under your assigned limit.' : limitHint}
      </div>
    </div>
  `, `
    <div style="display:flex;justify-content:flex-end;align-items:center;gap:10px;width:100%;">
      <button type="button" class="zy-btn-pill-cancel" onclick="closeModal()">Close</button>
      <button type="button" class="zy-btn-pill-submit" id="zy-sa-submit-btn" ${blocked ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''} onclick="zySubmitSelfAllocate('${zyEsc(rangeName)}','${zyEsc(rangeId || '')}')">Allocate Now</button>
    </div>
  `);
};

window.zySubmitSelfAllocate = async function(rangeName, rangeId) {
  const qty = parseInt(document.getElementById('sa-qty')?.value || '0', 10);
  const btn = document.getElementById('zy-sa-submit-btn');
  if (!qty || qty < 1) {
    if (typeof toast === 'function') toast('Please enter a valid quantity', 'error');
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Allocating...'; }
  try {
    const res = await apiFetch('/api/numbers/agent-allocate', {
      method: 'POST',
      body: JSON.stringify({
        range_id: rangeId ? (Number(rangeId) || rangeId) : undefined,
        range_name: rangeName,
        count: qty,
        quantity: qty
      })
    });
    if (!res || res.error) {
      throw new Error((res && res.error) || 'Self-allocation failed');
    }
    if (typeof closeModal === 'function') closeModal();
    const msg = res.message || `Allocated ${res.allocated_count || qty} number(s) from ${rangeName}`;
    if (typeof toast === 'function') toast(msg, 'success');
    else if (typeof zyFlash === 'function') zyFlash(msg);
    if (typeof window._zyOnAllocModalDone === 'function') window._zyOnAllocModalDone();
  } catch (e) {
    if (typeof toast === 'function') toast(e.message || 'Self-allocation failed', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Allocate Now'; }
  }
};
const zyTick = on => on ? zyImg('ui_tick', 'zy-tick') : '';

/* CLI privacy — every panel EXCEPT admin shows only the first character of
   the CLI and masks the rest ("1Engage" -> "1XXXXX"). The admin panel does
   not load this kit, so it keeps the full CLI. */
const zyMaskCli = v => { const s = String(v ?? ''); return s ? zyEsc(s.slice(0, 1)) + 'XXXXX' : ''; };

/* CDR totals — the footer block sums the payouts per currency (USD/EUR/GBP)
   exactly like the reference panel, instead of the old fixed 0 / 0 / 0. */
const ZY_CCY = ['USD', 'EUR', 'GBP'];
function zyCcy(v) {
  const c = String(v || 'USD').toUpperCase();
  if (c === '$' || c === 'USD') return 'USD';
  if (c === '€' || c === 'EUR') return 'EUR';
  if (c === '£' || c === 'GBP') return 'GBP';
  return 'USD';
}
/* rows: [{currency, value}] -> "0<br>0<br>0" in USD/EUR/GBP order */
function zySumByCcy(items, pick) {
  const t = { USD: 0, EUR: 0, GBP: 0 };
  (items || []).forEach(it => {
    const v = parseFloat(pick(it));
    if (!isNaN(v)) t[zyCcy(it.currency)] += v;
  });
  return ZY_CCY.map(c => zyRound(t[c])).join('<br>');
}
const zyRound = n => (Math.round((n + Number.EPSILON) * 10000) / 10000) || 0;


/* Country list for the Add/Edit modals (same order as the reference panel) */
const ZY_COUNTRY_LIST = ['Afghanistan','Aland Islands','Albania','Algeria','American Samoa','Andorra','Angola',
 'Anguilla','Antarctica','Antigua and Barbuda','Argentina','Armenia','Aruba','Australia','Austria','Azerbaijan',
 'Bahamas','Bahrain','Bangladesh','Barbados','Belarus','Belgium','Belize','Benin','Bermuda','Bhutan','Bolivia',
 'Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria','Burkina Faso','Burundi','Cambodia','Cameroon',
 'Canada','Cape Verde','Cayman Islands','Central African Republic','Chad','Chile','China','Colombia','Comoros',
 'Congo','Costa Rica','Croatia','Cuba','Cyprus','Czech Republic','Denmark','Djibouti','Dominica','Dominican Republic',
 'Ecuador','Egypt','El Salvador','Equatorial Guinea','Eritrea','Estonia','Ethiopia','Fiji','Finland','France',
 'Gabon','Gambia','Georgia','Germany','Ghana','Gibraltar','Greece','Greenland','Grenada','Guatemala','Guinea',
 'Guyana','Haiti','Honduras','Hong Kong','Hungary','Iceland','India','Indonesia','Iran','Iraq','Ireland','Israel',
 'Italy','Ivory Coast','Jamaica','Japan','Jordan','Kazakhstan','Kenya','Kuwait','Kyrgyzstan','Laos','Latvia',
 'Lebanon','Lesotho','Liberia','Libya','Liechtenstein','Lithuania','Luxembourg','Macao','Madagascar','Malawi',
 'Malaysia','Maldives','Mali','Malta','Mauritania','Mauritius','Mexico','Moldova','Monaco','Mongolia','Montenegro',
 'Morocco','Mozambique','Myanmar','Namibia','Nepal','Netherlands','New Zealand','Nicaragua','Niger','Nigeria',
 'North Macedonia','Norway','Oman','Pakistan','Palestine','Panama','Papua New Guinea','Paraguay','Peru',
 'Philippines','Poland','Portugal','Puerto Rico','Qatar','Romania','Russia','Rwanda','Saudi Arabia','Senegal',
 'Serbia','Seychelles','Sierra Leone','Singapore','Slovakia','Slovenia','Somalia','South Africa','South Korea',
 'South Sudan','Spain','Sri Lanka','Sudan','Suriname','Sweden','Switzerland','Syria','Taiwan','Tajikistan',
 'Tanzania','Thailand','Togo','Tonga','Trinidad and Tobago','Tunisia','Turkey','Turkmenistan','Uganda','Ukraine',
 'United Arab Emirates','United Kingdom','United States','Uruguay','Uzbekistan','Venezuela','Vietnam','Yemen',
 'Zambia','Zimbabwe'];

/* ═══ shared filter box (dates + agent + Show Report) ═══════ */
function getLocalDateStr(dateObj = new Date()) {
  const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function zyMonthStart() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}
function zyToday() { return getLocalDateStr(); }

function onCdrDateInputChange(fromId, toId) {
  const f = document.getElementById(fromId);
  const t = document.getElementById(toId);
  if (!f || !t) return;
  if (f.value && t.value && f.value > t.value) {
    t.value = f.value;
  }
}
window.onCdrDateInputChange = onCdrDateInputChange;

function zyFilterBox(id, onShow, extraBtn) {
  const today = getLocalDateStr();
  return `<div class="zy-filterbox">
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
      <label style="font-size:12px;font-weight:700;color:var(--text-secondary,#64748b);">From:</label>
      <input type="date" class="zy-fb-input" id="${id}-from" value="${today}" style="cursor:pointer;padding:6px 10px;font-weight:600;">
      <label style="font-size:12px;font-weight:700;color:var(--text-secondary,#64748b);">To:</label>
      <input type="date" class="zy-fb-input" id="${id}-to" value="${today}" style="cursor:pointer;padding:6px 10px;font-weight:600;">
      <select class="zy-fb-input" id="${id}-agent"><option value="">Filter Agent</option></select>
    </div>
    <div class="zy-fb-btns">${extraBtn || ''}
      <button class="zy-btn-blue" onclick="${onShow}">Show Report</button></div>
  </div>`;
}

// Auto Date Rollover Watcher (handles automatic midnight & day date change without manual intervention)
(function initAutoDateRolloverWatcher() {
  if (window._autoDateWatcherStarted) return;
  window._autoDateWatcherStarted = true;
  let lastDay = getLocalDateStr();

  // Watch every 10 seconds for date changes (midnight rollover or day change)
  setInterval(() => {
    const currentDay = getLocalDateStr();
    if (currentDay !== lastDay) {
      console.log(`[AutoDateWatcher] Date rollover detected: ${lastDay} -> ${currentDay}`);
      const oldDay = lastDay;
      lastDay = currentDay;

      // Update date labels across the top bar / dashboard headers
      const formattedDate = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      document.querySelectorAll('.fa-calendar-day').forEach(icon => {
        if (icon && icon.parentElement) {
          // If this is a date badge/indicator, update the date text
          const p = icon.parentElement;
          if (p.textContent && (p.textContent.includes(oldDay) || p.classList.contains('header-date') || p.id === 'header-date' || p.closest('.page-header') || p.closest('.zy-dash-head'))) {
            p.innerHTML = `<i class="fas fa-calendar-day"></i> ${formattedDate}`;
          }
        }
      });

      // Check all active date from/to inputs on the page
      const pairs = [
        ['rp-from', 'rp-to'],
        ['cdr-from', 'cdr-to'],
        ['c-from', 'c-to'],
        ['tc-from', 'tc-to'],
        ['mcdr-from', 'mcdr-to'],
        ['csms-from', 'csms-to'],
        ['cs-from', 'cs-to'],
        ['my-from', 'my-to'],
        ['ad-rs-from', 'ad-rs-to'],
        ['th-date-from', 'th-date-to']
      ];
      let didUpdate = false;
      for (const [fId, tId] of pairs) {
        const fEl = document.getElementById(fId);
        const tEl = document.getElementById(tId);
        if (fEl && tEl) {
          // If the filter was previously set to today / the old day, roll it forward automatically!
          if (fEl.value.includes(oldDay) && tEl.value.includes(oldDay)) {
            fEl.value = fEl.type === 'date' ? currentDay : `${currentDay} 00:00:00`;
            tEl.value = tEl.type === 'date' ? currentDay : `${currentDay} 23:59:59`;
            didUpdate = true;
          }
        }
      }

      // Also scan any other standalone date inputs on the screen
      document.querySelectorAll('input[type="date"]').forEach(inp => {
        if (inp.value === oldDay) {
          inp.value = currentDay;
          didUpdate = true;
        }
      });

      if (didUpdate) {
        // Updated input date values silently without disturbing report filtering
      }
    }
  }, 10000);
})();
async function zyFillAgents(selectId) {
  const res = await apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=200`);
  ZY_AGENTS = (res && res.data) || [];
  const el = document.getElementById(selectId);
  if (el) el.innerHTML = `<option value="">Filter Agent</option>` +
    ZY_AGENTS.map(a => `<option value="${a.id}">${zyEsc(a.username)}</option>`).join('');
  return ZY_AGENTS;
}
const zyAgentName = id => (ZY_AGENTS.find(a => String(a.id) === String(id)) || {}).username || '';
const zyDateOnly = s => String(s || '').replace('T', ' ').slice(0, 19);

function zyFormatDateTimeStacked(raw) {
  if (!raw) return { v: '', h: '—' };
  const str = String(raw).replace('T', ' ').trim().slice(0, 19);
  const parts = str.split(' ');
  const datePart = parts[0] || '—';
  const timePart = parts[1] || '';
  if (!timePart) return { v: str, h: `<span class="zy-dt-date monospace">${datePart}</span>` };
  return {
    v: str,
    h: `<div class="zy-dt-stacked"><span class="zy-dt-date">${datePart}</span><span class="zy-dt-time">${timePart}</span></div>`
  };
}
window.zyFormatDateTimeStacked = zyFormatDateTimeStacked;

function zyInRange(id, ts) {
  const f = (document.getElementById(id + '-from') || {}).value || '';
  const t = (document.getElementById(id + '-to') || {}).value || '';
  const v = zyDateOnly(ts);
  if (f && v && v < f) return false;
  if (t && v && v > t) return false;
  return true;
}
function zyAgentFilter(id) { return (document.getElementById(id + '-agent') || {}).value || ''; }

/* ═══════════════════════════════════════════════════════════════
   HUMEX SMS — F1 Sidebar Accordion Controller
   ONE function zyToggleGroup(id) that closes every other group
   before opening the clicked one. Used by mouse, tap and keyboard.
   The group of the active page opens on load. aria-expanded in sync.
   ═══════════════════════════════════════════════════════════════ */
function zyToggleGroup(id) {
  let targetEl = null;
  if (!id && typeof event !== 'undefined') id = event.currentTarget || event.target;
  if (id && typeof id === 'object') {
    if (id.target || id.currentTarget) targetEl = id.currentTarget || id.target;
    else if (id.nodeType) targetEl = id;
  } else if (typeof id === 'string') {
    targetEl = document.getElementById(id) ||
               document.getElementById('sb-' + id) ||
               document.getElementById('grp-' + id) ||
               document.getElementById('grp-adm-' + id) ||
               (document.querySelector ? (document.querySelector(`[aria-controls="${id}"]`) || document.querySelector(`[aria-controls="sb-${id}"]`)) : null);
  }
  if (!targetEl) return;

  const nav = (targetEl.closest && targetEl.closest('.zy-sidenav')) || document.getElementById('zy-sidenav');
  let header = null;
  let sub = null;

  if (targetEl.classList && targetEl.classList.contains('zy-snav')) {
    header = targetEl;
    const subId = header.getAttribute('aria-controls');
    sub = subId ? document.getElementById(subId) : (header.nextElementSibling && header.nextElementSibling.classList.contains('zy-ssub') ? header.nextElementSibling : null);
  } else if (targetEl.classList && targetEl.classList.contains('zy-ssub')) {
    sub = targetEl;
    header = (nav && nav.querySelector ? nav.querySelector(`[aria-controls="${sub.id}"]`) : null) || (sub.previousElementSibling && sub.previousElementSibling.classList.contains('zy-snav') ? sub.previousElementSibling : null);
  } else {
    header = targetEl.closest ? targetEl.closest('.zy-snav') : null;
    if (header) {
      const subId = header.getAttribute('aria-controls');
      sub = subId ? document.getElementById(subId) : (header.nextElementSibling && header.nextElementSibling.classList.contains('zy-ssub') ? header.nextElementSibling : null);
    } else {
      sub = targetEl.closest ? targetEl.closest('.zy-ssub') : null;
      if (sub) {
        header = (nav && nav.querySelector ? nav.querySelector(`[aria-controls="${sub.id}"]`) : null) || (sub.previousElementSibling && sub.previousElementSibling.classList.contains('zy-snav') ? sub.previousElementSibling : null);
      }
    }
  }

  if (!header || !sub) return;

  const wasOpen = sub.classList.contains('open') || header.classList.contains('open') || header.getAttribute('aria-expanded') === 'true';

  // Single-open accordion rule: close all other groups in desktop and mobile drawer
  const allNavs = document.querySelectorAll('.zy-sidenav');
  const scopeList = allNavs && allNavs.length ? Array.from(allNavs) : (nav ? [nav] : [document]);
  scopeList.forEach(scope => {
    scope.querySelectorAll('.zy-snav').forEach(h => {
      if (h !== header) {
        h.classList.remove('open');
        if (h.hasAttribute('aria-expanded')) h.setAttribute('aria-expanded', 'false');
        const otherSubId = h.getAttribute('aria-controls');
        if (otherSubId) {
          const otherSub = document.getElementById(otherSubId);
          if (otherSub && otherSub !== sub) otherSub.classList.remove('open');
        }
      }
    });
    scope.querySelectorAll('.zy-ssub').forEach(s => {
      if (s !== sub) s.classList.remove('open');
    });
  });

  if (wasOpen) {
    header.classList.remove('open');
    header.setAttribute('aria-expanded', 'false');
    sub.classList.remove('open');
  } else {
    header.classList.add('open');
    header.setAttribute('aria-expanded', 'true');
    sub.classList.add('open');
  }
}
window.zyToggleGroup = zyToggleGroup;

function zyToggleAccordion(subId, triggerEl) {
  zyToggleGroup(triggerEl || subId);
}
window.zyToggleAccordion = zyToggleAccordion;

function zySideSub(subId, triggerEl) {
  zyToggleGroup(triggerEl || subId);
}
window.zySideSub = zySideSub;

function zySyncAccordionActive(page) {
  if (!page) return;
  const nav = document.getElementById('zy-sidenav');
  if (!nav) return;

  // 1. Clear previous active highlights
  nav.querySelectorAll('.active').forEach(el => el.classList.remove('active'));

  // 2. Find target element matching page
  let target = nav.querySelector(`[data-page="${page}"]`) || document.getElementById(`nav-${page}`);
  if (!target) {
    target = Array.from(nav.querySelectorAll('[onclick]')).find(el => {
      const oc = el.getAttribute('onclick') || '';
      return oc.includes(`'${page}'`) || oc.includes(`"${page}"`);
    });
  }

  if (target) {
    target.classList.add('active');

    // If target is inside a submenu (.zy-ssub), open that group and close other groups
    const sub = target.closest ? target.closest('.zy-ssub') : null;
    if (sub) {
      const subId = sub.id;
      const header = (nav && nav.querySelector ? nav.querySelector(`[aria-controls="${subId}"]`) : null) || sub.previousElementSibling;

      document.querySelectorAll('.zy-sidenav').forEach(n => {
        n.querySelectorAll('.zy-snav').forEach(h => {
          if (h !== header) {
            h.classList.remove('open');
            if (h.hasAttribute('aria-expanded')) h.setAttribute('aria-expanded', 'false');
            const otherSubId = h.getAttribute('aria-controls');
            if (otherSubId) {
              const otherSub = document.getElementById(otherSubId);
              if (otherSub && otherSub !== sub) otherSub.classList.remove('open');
            }
          }
        });
        n.querySelectorAll('.zy-ssub').forEach(s => {
          if (s !== sub) s.classList.remove('open');
        });
      });

      if (header) {
        header.classList.add('open');
        header.setAttribute('aria-expanded', 'true');
      }
      sub.classList.add('open');
    } else if (target.classList.contains('zy-snav')) {
      // Top-level item active, close any open groups
      document.querySelectorAll('.zy-sidenav').forEach(n => {
        n.querySelectorAll('.zy-snav').forEach(h => {
          h.classList.remove('open');
          if (h.hasAttribute('aria-expanded')) h.setAttribute('aria-expanded', 'false');
        });
        n.querySelectorAll('.zy-ssub').forEach(s => s.classList.remove('open'));
      });
    }
  }
}
window.zySyncAccordionActive = zySyncAccordionActive;

/* Mobile drawer controls */
window.zyToggleSidebar = function() {
  const isMobile = window.innerWidth < 992;
  if (isMobile) {
    document.body.classList.toggle('sidebar-open');
    const side = document.getElementById('sidebar');
    if (side) side.classList.toggle('mobile-open');
    const backdrop = document.getElementById('zy-side-backdrop');
    if (backdrop) backdrop.classList.toggle('active');
  } else {
    // PC version: sidebar must NEVER hide or collapse per user instructions
    document.body.classList.remove('sidebar-collapsed');
  }
};
window.zyCloseSidebar = function() {
  document.body.classList.remove('sidebar-open');
  const side = document.getElementById('sidebar');
  if (side) side.classList.remove('mobile-open');
  const backdrop = document.getElementById('zy-side-backdrop');
  if (backdrop) backdrop.classList.remove('active');
};

/* ═══════════════════════════════════════════════════════════════
   HUMEX SMS — V3 Universal Skeleton Loading Helpers
   Smooth shimmer placeholders during async page transitions
   ═══════════════════════════════════════════════════════════════ */
function zySkeletonLine(cls = '') {
  return `<div class="zy-skeleton zy-skeleton-line ${cls}"></div>`;
}
function zySkeletonBox(height = 36, width = '100%') {
  return `<div class="zy-skeleton" style="height:${height}px;width:${width};border-radius:6px;"></div>`;
}

function zySkeleton(type = 'auto', page = '') {
  const p = String(page || '').toLowerCase();
  let resolvedType = type;
  if (resolvedType === 'auto') {
    if (!p || p.includes('dashboard')) resolvedType = 'dashboard';
    else if (p.includes('report') || p.includes('detailed-sms') || p.includes('summary-sms') || p.includes('my-sms') || p.includes('cdr')) resolvedType = 'report';
    else if (p.startsWith('add-') || p.includes('upload') || p.includes('profile') || p.includes('settings')) resolvedType = 'form';
    else resolvedType = 'table';
  }

  if (resolvedType === 'dashboard') {
    return `
      <div class="zy-skeleton-screen" role="status" aria-busy="true" aria-label="Loading dashboard...">
        <div class="zy-skeleton-kpis">
          ${[1, 2, 3, 4].map(() => `
            <div class="zy-skeleton-kpi">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                ${zySkeletonLine('med')}
                <div class="zy-skeleton" style="width:32px;height:32px;border-radius:8px;"></div>
              </div>
              <div class="zy-skeleton" style="height:28px;width:50%;border-radius:6px;margin:4px 0;"></div>
              ${zySkeletonLine('short')}
            </div>
          `).join('')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px;">
          <div class="zy-skeleton-card" style="height:260px;display:flex;flex-direction:column;justify-content:space-between;">
            <div style="display:flex;justify-content:space-between;">
              ${zySkeletonLine('med')}
              <div class="zy-skeleton" style="width:80px;height:24px;border-radius:6px;"></div>
            </div>
            <div class="zy-skeleton" style="height:170px;width:100%;border-radius:8px;"></div>
          </div>
          <div class="zy-skeleton-card" style="height:260px;display:flex;flex-direction:column;gap:12px;">
            ${zySkeletonLine('short')}
            ${[1, 2, 3, 4, 5].map(() => `
              <div style="display:flex;gap:12px;align-items:center;">
                <div class="zy-skeleton" style="width:24px;height:24px;border-radius:50%;"></div>
                <div style="flex:1;">${zySkeletonLine('full')}${zySkeletonLine('med')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  if (resolvedType === 'report') {
    return `
      <div class="zy-skeleton-screen" role="status" aria-busy="true" aria-label="Loading report...">
        <div class="zy-skeleton-filters">
          <div class="zy-skeleton" style="height:36px;width:160px;border-radius:6px;"></div>
          <div class="zy-skeleton" style="height:36px;width:160px;border-radius:6px;"></div>
          <div class="zy-skeleton" style="height:36px;width:140px;border-radius:6px;"></div>
          <div class="zy-skeleton" style="height:36px;width:100px;border-radius:6px;margin-left:auto;"></div>
        </div>
        <div class="zy-skeleton-kpis" style="grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));">
          ${[1, 2, 3].map(() => `
            <div class="zy-skeleton-kpi" style="padding:14px;">
              ${zySkeletonLine('short')}
              <div class="zy-skeleton" style="height:22px;width:60%;border-radius:4px;"></div>
            </div>
          `).join('')}
        </div>
        <div class="zy-skeleton-card" style="padding:0;overflow:hidden;">
          <table class="zy-skeleton-table">
            <thead>
              <tr style="background:var(--sp-bg-subtle, #f1f5f9);">
                ${[1, 2, 3, 4, 5, 6].map(() => `<th><div class="zy-skeleton" style="height:14px;width:70%;border-radius:4px;"></div></th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${[1, 2, 3, 4, 5, 6].map(() => `
                <tr>
                  ${[1, 2, 3, 4, 5, 6].map((i) => `<td><div class="zy-skeleton" style="height:14px;width:${i === 1 ? '85%' : i === 6 ? '50%' : '70%'};border-radius:4px;"></div></td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  if (resolvedType === 'form') {
    return `
      <div class="zy-skeleton-screen" role="status" aria-busy="true" aria-label="Loading form...">
        <div class="zy-skeleton-card" style="max-width:760px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:18px;">
          <div style="border-bottom:1px solid var(--sp-border, #e2e8f0);padding-bottom:12px;">
            <div class="zy-skeleton" style="height:24px;width:40%;border-radius:6px;margin-bottom:8px;"></div>
            ${zySkeletonLine('med')}
          </div>
          ${[1, 2, 3, 4].map(() => `
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${zySkeletonLine('short')}
              <div class="zy-skeleton" style="height:38px;width:100%;border-radius:6px;"></div>
            </div>
          `).join('')}
          <div style="display:flex;gap:12px;margin-top:8px;">
            <div class="zy-skeleton" style="height:40px;width:120px;border-radius:6px;"></div>
            <div class="zy-skeleton" style="height:40px;width:90px;border-radius:6px;"></div>
          </div>
        </div>
      </div>
    `;
  }

  // Default: Table / List
  return `
    <div class="zy-skeleton-screen" role="status" aria-busy="true" aria-label="Loading content...">
      <div class="zy-skeleton-filters">
        <div class="zy-skeleton" style="height:36px;width:220px;border-radius:6px;"></div>
        <div class="zy-skeleton" style="height:36px;width:150px;border-radius:6px;"></div>
        <div class="zy-skeleton" style="height:36px;width:130px;border-radius:6px;"></div>
        <div class="zy-skeleton" style="height:36px;width:100px;border-radius:6px;margin-left:auto;"></div>
      </div>
      <div class="zy-skeleton-card" style="padding:0;overflow:hidden;">
        <table class="zy-skeleton-table">
          <thead>
            <tr style="background:var(--sp-bg-subtle, #f1f5f9);">
              ${[1, 2, 3, 4, 5].map(() => `<th><div class="zy-skeleton" style="height:14px;width:65%;border-radius:4px;"></div></th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${[1, 2, 3, 4, 5, 6, 7].map(() => `
              <tr>
                ${[1, 2, 3, 4, 5].map((i) => `<td><div class="zy-skeleton" style="height:14px;width:${i === 1 ? '90%' : i === 5 ? '40%' : '75%'};border-radius:4px;"></div></td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
window.zySkeleton = zySkeleton;

function zyShowSkeleton(page, targetId = 'page-content') {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.innerHTML = zySkeleton('auto', page);
}
window.zyShowSkeleton = zyShowSkeleton;

/* ═══════════════════════════════════════════════════════════════
   HUMEX SMS — V4 Dashboard Helpers (Breadcrumb, UTC Clock, KPI Cards, SVG Sparklines, Recent SMS)
   ═══════════════════════════════════════════════════════════════ */

/* 1. Live Panel Timezone Clock & Formatting Engine */
function zyGetPanelTimezone() {
  let tz = 'UTC';
  try {
    const s = window.__BRAND_SETTINGS__ || JSON.parse(localStorage.getItem('app_brand_settings') || '{}');
    if (s && s.timezone) tz = s.timezone;
  } catch (_) {}
  return tz;
}
window.zyGetPanelTimezone = zyGetPanelTimezone;

function zyFormatUtc(d = new Date(), withTz = false) {
  if (!d) d = new Date();
  if (!(d instanceof Date)) d = new Date(d);
  if (isNaN(d.getTime())) return '—';

  const tz = zyGetPanelTimezone();

  if (tz === 'UTC') {
    const p = n => String(n).padStart(2, '0');
    const base = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
    return withTz ? `${base} (UTC)` : base;
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(d);
    const get = type => (parts.find(p => p.type === type) || {}).value || '';
    const base = `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
    return withTz ? `${base} (${tz.split('/').pop().replace(/_/g, ' ')})` : base;
  } catch (e) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  }
}
window.zyFormatUtc = zyFormatUtc;
window.zyFormatPanelTime = zyFormatUtc;

function zyFormatShortTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return zyFormatUtc(d, false);
  } catch {
    return '—';
  }
}
window.zyFormatShortTime = zyFormatShortTime;

function zyUpdateClockLive() {
  const tz = zyGetPanelTimezone();
  const now = new Date();
  const str = zyFormatUtc(now, false);

  document.querySelectorAll('#zy-utc-time, .zy-utc-live').forEach(el => {
    el.textContent = str;
  });
  const sideClock = document.getElementById('zy-clock');
  if (sideClock) {
    sideClock.textContent = str;
    sideClock.title = `Panel Timezone: ${tz}`;
  }
  const tzLabel = document.getElementById('zy-tz-label');
  if (tzLabel) {
    tzLabel.textContent = tz === 'UTC' ? 'UTC' : tz.split('/').pop().replace(/_/g, ' ');
  }
}
window.zyUpdateClockLive = zyUpdateClockLive;

function zyStartUtcClock() {
  zyUpdateClockLive();
  if (!window._zyUtcInterval) {
    window._zyUtcInterval = setInterval(zyUpdateClockLive, 1000);
  }
}
window.zyStartUtcClock = zyStartUtcClock;

// Auto-start UTC clock
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', zyStartUtcClock);
  } else {
    zyStartUtcClock();
  }
}

/* 2. Breadcrumb Sync Helper */
function zyUpdateBreadcrumb(page, label) {
  const crumb = document.querySelector('.zy-crumb');
  if (!crumb) return;
  const isDash = !page || page === 'dashboard';
  const displayLabel = label || (page ? page.charAt(0).toUpperCase() + page.slice(1).replace(/-/g, ' ') : 'Dashboard');
  const leftHtml = isDash
    ? `<a onclick="loadPage('dashboard')">Home</a><span class="zy-sep">&raquo;</span><span id="breadcrumb">Dashboard</span>`
    : `<a onclick="loadPage('dashboard')">Home</a><span class="zy-sep">&raquo;</span><span id="breadcrumb">${displayLabel}</span>`;

  const leftContainer = crumb.querySelector('.zy-crumb-left');
  if (leftContainer) {
    leftContainer.innerHTML = leftHtml;
  } else {
    crumb.innerHTML = `<div class="zy-crumb-left">${leftHtml}</div>`;
  }
}
window.zyUpdateBreadcrumb = zyUpdateBreadcrumb;

/* 3. Responsive SVG Sparkline Generator */
function zySparklineSvg(data = [], options = {}) {
  const width = options.width || 100;
  const height = options.height || 32;
  const stroke = options.stroke || 'var(--sp-primary, #166534)';
  const fill = options.fill || stroke;
  const fillOpacity = options.fillOpacity != null ? options.fillOpacity : 0.15;
  const strokeWidth = options.strokeWidth || 2;

  const rawVals = Array.isArray(data) ? data.map(Number) : [];
  const vals = rawVals.length >= 2 ? rawVals : [0, 0, 0, 0, 0, 0, 0];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = (max - min) || 1;
  const padX = 2;
  const padY = 3;
  const w = width - (padX * 2);
  const h = height - (padY * 2);

  const points = vals.map((v, i) => {
    const x = padX + (i / Math.max(1, vals.length - 1)) * w;
    const y = padY + h - ((v - min) / range) * h;
    return [x.toFixed(1), y.toFixed(1)];
  });

  const polylinePath = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.join(',')).join(' ');
  const first = points[0];
  const last = points[points.length - 1];
  const areaPath = `${polylinePath} L ${last[0]},${height} L ${first[0]},${height} Z`;
  const gradId = 'spk-' + Math.random().toString(36).slice(2, 8);

  return `
    <svg class="zy-sparkline" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="overflow:visible;display:block;">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${fill}" stop-opacity="${fillOpacity}"/>
          <stop offset="100%" stop-color="${fill}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#${gradId})"/>
      <path d="${polylinePath}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="2.5" fill="${stroke}"/>
    </svg>
  `;
}
window.zySparklineSvg = zySparklineSvg;

/* 4. Modern KPI Card Renderer */
function zyKpiCard(cfg) {
  const title = cfg.title || 'Metric';
  const val = cfg.value != null ? cfg.value : '0';
  const icon = cfg.icon || 'fa-chart-line';
  const color = cfg.color || 'var(--sp-primary, #166534)';
  const bgLight = cfg.bgLight || 'rgba(22, 101, 52, 0.1)';
  const trend = cfg.trend || '';
  const trendDir = cfg.trendDir || 'up';
  const subtitle = cfg.subtitle || '';
  const click = cfg.onClick ? `onclick="${cfg.onClick}" style="cursor:pointer;"` : '';
  const sparkData = cfg.sparklineData || [12, 19, 15, 25, 22, 30, 28];
  const sparklineHtml = zySparklineSvg(sparkData, { stroke: color, fill: color });

  const trendIcon = trendDir === 'up' ? 'fa-arrow-trend-up' : trendDir === 'down' ? 'fa-arrow-trend-down' : 'fa-minus';

  return `
    <div class="zy-kpi-card stat-card" ${click}>
      <div class="zy-kpi-head">
        <span class="zy-kpi-title stat-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${title}</span>
        <span class="zy-kpi-icon" style="background:${bgLight};color:${color};">
          <i class="fas ${icon}"></i>
        </span>
      </div>
      <div class="zy-kpi-body">
        <div class="zy-kpi-value stat-value" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${val}</div>
        <div class="zy-kpi-sparkline-wrap">${sparklineHtml}</div>
      </div>
      ${(trend || subtitle) ? `
      <div class="zy-kpi-foot stat-subtext" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${trend ? `<span class="zy-kpi-trend ${trendDir}"><i class="fas ${trendIcon}"></i> ${trend}</span>` : ''}
        ${subtitle ? `<span>${subtitle}</span>` : ''}
      </div>` : ''}
    </div>
  `;
}
window.zyKpiCard = zyKpiCard;

/* Notification Logic Removed — awaiting new user specification */
window.zyUpdateNotificationBadge = function () {
  document.querySelectorAll('.zy-bell-badge').forEach(el => {
    el.textContent = '';
    el.style.display = 'none';
  });
};
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    window.zyUpdateNotificationBadge();
  });
}

/* Clean Number & Money Formatter (Removes ugly extra trailing zeros e.g. 0.0200 -> 0.02, 0.000800 -> 0.0008) */
function zyFmtMoney(val, maxDecimals = 4) {
  if (val === null || val === undefined || val === '') return '0';
  const n = Number(val);
  if (isNaN(n) || n === 0) return '0';
  return parseFloat(n.toFixed(maxDecimals)).toString();
}
window.zyFmtMoney = zyFmtMoney;
window.cleanMoney = zyFmtMoney;

/* 5. Recent SMS Live Stream Card */
function zyRecentSmsCard(logs = [], options = {}) {
  const title = options.title || 'Recent SMS Stream';
  const onRefresh = options.onRefresh || "loadPage('dashboard')";
  const onViewAll = options.onViewAll || "loadPage('detailed-sms')";
  const list = Array.isArray(logs) ? logs.slice(0, options.limit || 8) : [];

  const rowsHtml = list.length > 0 ? list.map(sms => {
    const ts = String(sms.timestamp || sms.created || sms.time || '').replace('T', ' ').slice(0, 19) || 'Just now';
    const cli = sms.cli || sms.app || sms.sender || '—';
    const num = sms.number || sms.destination || '—';
    const msg = sms.message || sms.otp || sms.text || sms.content || '—';
    const st = String(sms.status || 'DELIVRD').toUpperCase();
    const pillClass = (st === 'DELIVRD' || st === 'DELIVERED' || st === 'ACTIVE')
      ? 'zy-status-delivrd'
      : (st === 'PENDING' || st === 'SUBMITTED')
      ? 'zy-status-pending'
      : 'zy-status-failed';
    const dotColor = (st === 'DELIVRD' || st === 'DELIVERED') ? '#10b981' : st === 'PENDING' ? '#f59e0b' : '#ef4444';

    return `
      <tr>
        <td style="font-family:monospace;font-size:11px;color:var(--sp-text-muted);white-space:nowrap;">${ts}</td>
        <td><span class="badge" style="background:var(--sp-bg-subtle);color:var(--sp-text-primary);border:1px solid var(--sp-border);font-family:monospace;font-weight:600;">${cli}</span></td>
        <td style="font-family:monospace;font-weight:600;">${num}</td>
        <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${msg}">${msg}</td>
        <td>
          <span class="zy-status-pill ${pillClass}">
            <span style="width:6px;height:6px;border-radius:50%;background:${dotColor};display:inline-block;"></span>
            ${st}
          </span>
        </td>
      </tr>
    `;
  }).join('') : `
    <tr>
      <td colspan="5" style="text-align:center;padding:28px 12px;color:var(--sp-text-muted);">
        <i class="fas fa-inbox" style="font-size:24px;margin-bottom:8px;display:block;opacity:0.6;"></i>
        No recent SMS activity yet. Waiting for live traffic.
      </td>
    </tr>
  `;

  return `
    <div class="zy-panel" style="margin-top:20px;">
      <div class="zy-panel-head" style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 6px #10b981;display:inline-block;"></span>
          <span style="font-weight:700;color:var(--sp-text-primary);">${title}</span>
          <span class="badge" style="background:var(--sp-bg-subtle);color:var(--sp-text-secondary);font-size:11px;">Live</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="sp-btn sp-btn-secondary sp-btn-sm" onclick="${onViewAll}">
            View All Reports <i class="fas fa-arrow-right" style="font-size:10px;margin-left:4px;"></i>
          </button>
        </div>
      </div>
      <div class="zy-panel-body" style="padding:0;overflow-x:auto;">
        <table class="zy-recent-sms-table">
          <thead>
            <tr>
              <th style="width:140px;">Time (UTC)</th>
              <th style="width:110px;">Sender / CLI</th>
              <th style="width:130px;">Destination</th>
              <th>Message Snippet / OTP</th>
              <th style="width:110px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
window.zyRecentSmsCard = zyRecentSmsCard;

/* ═══════════════════════════════════════════════════════════════
   HUMEX SMS — V5 CDR & Show Report Helpers
   Date Presets, Tabs, Interactive Group-By Chips, Total Row
   ═══════════════════════════════════════════════════════════════ */

/* 1. Date Range Presets */
const zyDatePresetsList = [
  { key: 'today',      label: 'Today',        icon: 'fa-calendar-day' },
  { key: 'yesterday',  label: 'Yesterday',    icon: 'fa-clock-rotate-left' },
  { key: 'this_week',  label: 'This Week',    icon: 'fa-calendar-week' },
  { key: 'last_7',     label: 'Last 7 Days',  icon: 'fa-calendar-days' },
  { key: 'this_month', label: 'This Month',   icon: 'fa-calendar' },
  { key: 'last_30',    label: 'Last 30 Days', icon: 'fa-chart-line' }
];
window.zyDatePresetsList = zyDatePresetsList;

function zyPad2(n) {
  return String(n).padStart(2, '0');
}
window.zyPad2 = zyPad2;

function zyFormatDateStr(d) {
  return `${d.getFullYear()}-${zyPad2(d.getMonth() + 1)}-${zyPad2(d.getDate())}`;
}
window.zyFormatDateStr = zyFormatDateStr;

function zyGetDatePresetRange(key) {
  const now = new Date();
  const todayStr = zyFormatDateStr(now);
  let fromD = new Date(now);
  let toD = new Date(now);

  switch (key) {
    case 'today':
      fromD = new Date(now);
      toD = new Date(now);
      break;
    case 'yesterday':
      fromD.setDate(fromD.getDate() - 1);
      toD.setDate(toD.getDate() - 1);
      break;
    case 'this_week': {
      const day = fromD.getDay(); // 0 is Sun
      const diff = fromD.getDate() - day + (day === 0 ? -6 : 1); // Monday
      fromD = new Date(fromD.setDate(diff));
      toD = new Date(now);
      break;
    }
    case 'last_7':
      fromD.setDate(fromD.getDate() - 6);
      toD = new Date(now);
      break;
    case 'this_month':
      fromD = new Date(now.getFullYear(), now.getMonth(), 1);
      toD = new Date(now);
      break;
    case 'last_30':
      fromD.setDate(fromD.getDate() - 29);
      toD = new Date(now);
      break;
    default:
      fromD = new Date(now);
      toD = new Date(now);
      break;
  }

  const fromDate = zyFormatDateStr(fromD);
  const toDate = zyFormatDateStr(toD);
  return {
    key,
    fromDate,
    toDate,
    fromDateTime: `${fromDate} 00:00:00`,
    toDateTime: `${toDate} 23:59:59`
  };
}
window.zyGetDatePresetRange = zyGetDatePresetRange;

function zyApplyDatePreset(key, fromId = 'rp-from', toId = 'rp-to', chipContainer = null) {
  const range = zyGetDatePresetRange(key);
  const fromEl = document.getElementById(fromId);
  const toEl = document.getElementById(toId);

  if (fromEl) {
    if (fromEl.type === 'date') fromEl.value = range.fromDate;
    else fromEl.value = range.fromDateTime;
  }
  if (toEl) {
    if (toEl.type === 'date') toEl.value = range.toDate;
    else toEl.value = range.toDateTime;
  }

  // Update active chip UI
  const root = chipContainer ? (typeof chipContainer === 'string' ? document.querySelector(chipContainer) : chipContainer) : document;
  if (root) {
    root.querySelectorAll('.zy-preset-chip').forEach(chip => {
      if (chip.getAttribute('data-preset') === key) {
        chip.classList.add('active');
        chip.setAttribute('aria-pressed', 'true');
      } else {
        chip.classList.remove('active');
        chip.setAttribute('aria-pressed', 'false');
      }
    });
  }
  return range;
}
window.zyApplyDatePreset = zyApplyDatePreset;

function zyRenderDatePresets(activeKey = 'today', onSelectFn = 'zyApplyDatePreset') {
  return `
    <div class="zy-date-presets" role="toolbar" aria-label="Date range quick presets">
      <span class="zy-presets-label"><i class="fas fa-bolt"></i> Presets:</span>
      ${zyDatePresetsList.map(p => {
        const isActive = p.key === activeKey;
        const call = typeof onSelectFn === 'string' ? `${onSelectFn}('${p.key}')` : '';
        return `
          <button type="button" class="zy-preset-chip ${isActive ? 'active' : ''}"
                  data-preset="${p.key}"
                  role="button"
                  aria-pressed="${isActive}"
                  ${call ? `onclick="${call}"` : ''}>
            <i class="fas ${p.icon}" style="font-size:10px;opacity:0.85;"></i>
            ${p.label}
          </button>
        `;
      }).join('')}
    </div>
  `;
}
window.zyRenderDatePresets = zyRenderDatePresets;

/* 2. Modern CDR Navigation Tabs */
function zyCdrTabs(tabs = [], activeTab = '', onSwitchFn = 'zySwitchCdrTab') {
  const list = tabs && tabs.length ? tabs : [
    { id: 'detailed', label: 'Detailed Records', icon: 'fa-list-check' },
    { id: 'grouped',  label: 'Grouped Summary',  icon: 'fa-layer-group' }
  ];
  const cur = activeTab || list[0].id;

  return `
    <div class="zy-cdr-tabs" role="tablist" aria-label="CDR Report View Tabs">
      ${list.map(t => {
        const isActive = t.id === cur;
        const call = typeof onSwitchFn === 'string' ? `${onSwitchFn}('${t.id}')` : '';
        return `
          <button type="button" class="zy-cdr-tab ${isActive ? 'active' : ''}"
                  id="tab-${t.id}"
                  role="tab"
                  aria-selected="${isActive}"
                  aria-controls="panel-${t.id}"
                  ${call ? `onclick="${call}"` : ''}>
            <i class="fas ${t.icon || 'fa-chart-pie'}"></i>
            <span>${t.label}</span>
            ${t.badge != null ? `<span class="zy-cdr-tab-badge">${t.badge}</span>` : ''}
          </button>
        `;
      }).join('')}
    </div>
  `;
}
window.zyCdrTabs = zyCdrTabs;

/* 3. Interactive Group-By Chips */
function zyToggleGroupChip(chipEl) {
  if (!chipEl) return;
  const cb = chipEl.querySelector('input[type="checkbox"]');
  if (cb) {
    cb.checked = !cb.checked;
    if (cb.checked) {
      chipEl.classList.add('active');
      chipEl.setAttribute('aria-checked', 'true');
    } else {
      chipEl.classList.remove('active');
      chipEl.setAttribute('aria-checked', 'false');
    }
    const evt = new Event('change', { bubbles: true });
    cb.dispatchEvent(evt);
  }
}
window.zyToggleGroupChip = zyToggleGroupChip;

function zyRenderGroupChips(dimensions = [], activeList = []) {
  const dims = dimensions && dimensions.length ? dimensions : ['Date', 'Month', 'Range', 'Client', 'Number', 'CLI'];
  const activeSet = new Set((activeList || []).map(s => String(s).toLowerCase()));

  return `
    <div class="zy-groupby-row">
      <span class="zy-groupby-label"><i class="fas fa-layer-group"></i> <b>Group By:</b></span>
      <div class="zy-group-chips" role="group" aria-label="Group by dimensions">
        ${dims.map(d => {
          const val = d.toLowerCase();
          const isActive = activeSet.has(val);
          return `
            <div class="zy-group-chip ${isActive ? 'active' : ''}"
                 role="checkbox"
                 tabindex="0"
                 aria-checked="${isActive}"
                 onclick="zyToggleGroupChip(this)"
                 onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();zyToggleGroupChip(this);}">
              <i class="fas fa-check zy-chip-check"></i>
              <span>${d}</span>
              <input type="checkbox" class="grp-chk" value="${val}" ${isActive ? 'checked' : ''} style="display:none;" onclick="event.stopPropagation();">
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}
window.zyRenderGroupChips = zyRenderGroupChips;

/* 4. Comprehensive CDR Table Total Row Builder */
function zyBuildCdrTotalRow(data = [], isGrouped = false, options = {}) {
  const sum = options && options.summary ? options.summary : null;
  const list = Array.isArray(data) ? data : [];
  const count = (sum && sum.total_groups != null && isGrouped) ? sum.total_groups : list.length;
  const totalSms = (sum && sum.total_sms != null) ? sum.total_sms : list.reduce((s, item) => s + (Number(item.sms_count || item.count || 1) || 0), 0);
  const totalPayout = (sum && sum.payout != null) ? Number(sum.payout) : list.reduce((s, item) => s + (parseFloat(item.payout || item.my_payout || 0) || 0), 0);
  const totalClientPayout = (sum && sum.client_payout != null) ? Number(sum.client_payout) : list.reduce((s, item) => s + (parseFloat(item.client_payout || item.agent_payout || 0) || 0), 0);
  const totalProfit = (sum && sum.profit != null) ? Number(sum.profit) : list.reduce((s, item) => {
    if (item.profit != null) return s + (parseFloat(item.profit) || 0);
    const p = parseFloat(item.payout || item.my_payout || 0) || 0;
    const cp = parseFloat(item.client_payout || item.agent_payout || 0) || 0;
    return s + (p - cp);
  }, 0);

  const profitCls = totalProfit >= 0 ? 'zy-total-profit-pos' : 'zy-total-profit-neg';

  return {
    totalSms,
    totalPayout,
    totalClientPayout,
    totalProfit,
    count,
    formatted: {
      smsBadge: `<span class="zy-total-badge"><i class="fas fa-comment-sms"></i> Total SMS: <b>${totalSms.toLocaleString()}</b></span>`,
      groupsBadge: `<span class="zy-total-badge"><i class="fas fa-layer-group"></i> Total Groups: <b>${count.toLocaleString()}</b></span>`,
      payout: `$${totalPayout.toFixed(4)}`,
      clientPayout: `$${totalClientPayout.toFixed(4)}`,
      profit: `<span class="${profitCls}">$${totalProfit.toFixed(4)}</span>`
    }
  };
}
window.zyBuildCdrTotalRow = zyBuildCdrTotalRow;

/* 5. Streaming CDR CSV Export Helper */
function zyExportCdrStream(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v != null && v !== '') params.append(k, v);
  });
  params.append('export', 'csv');
  const url = `/api/sms/export?${params.toString()}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `sms_cdr_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
window.zyExportCdrStream = zyExportCdrStream;

/* ═══════════════════════════════════════════════════════════════
   HUMEX SMS — V6 Numbers Pages & Bulk Queue Helpers
   Selection Bar, Actions Toolbar, Bulk Add Queue Manager
   ═══════════════════════════════════════════════════════════════ */

function zyRunSelectionAction(fnExpr) {
  if (!fnExpr) return;
  if (typeof fnExpr === 'function') {
    fnExpr();
    return;
  }
  const parts = String(fnExpr).split('||').map(s => (s || '').trim()).filter(Boolean);
  for (const p of parts) {
    if (typeof window[p] === 'function') {
      window[p]();
      return;
    }
  }
}
window.zyRunSelectionAction = zyRunSelectionAction;

/* 1. Dynamic Numbers Selection Bar */
function zySyncSelectionBar(tableId = 'dt-numbers', customActions = null) {
  const tableEl = document.getElementById(tableId);
  if (!tableEl) return;
  let bar = document.getElementById(`zy-sel-bar-${tableId}`);

  const ids = (typeof zy2Checked === 'function') ? zy2Checked(tableId) : [];
  const count = ids.length;

  if (count === 0) {
    if (bar) bar.style.display = 'none';
    return;
  }

  if (!bar) {
    bar = document.createElement('div');
    bar.id = `zy-sel-bar-${tableId}`;
    bar.className = 'zy-selection-bar';
    tableEl.parentNode.insertBefore(bar, tableEl);
  }

  bar.style.display = 'flex';

  const defaultActions = customActions || [
    { label: 'Allocate', icon: 'fa-user-plus', cls: 'sp-btn-primary', fn: 'zyOwnerAllocateAll || zyActionAllocate || zyAllocateAll' },
    { label: 'Unallocate', icon: 'fa-rotate-left', cls: 'sp-btn-secondary', fn: 'zyOwnerUnallocateAll || zyActionUnallocate || zyUnassignSelected' },
    { label: 'Return', icon: 'fa-arrow-up', cls: 'sp-btn-danger', fn: 'zyActionReturn || zyReturnSelected || zyOwnerDeleteAll' },
    { label: 'Move', icon: 'fa-right-left', cls: 'sp-btn-ghost', fn: 'zyActionMove' }
  ];

  bar.innerHTML = `
    <div class="zy-selection-info">
      <span class="zy-selected-counter">
        <i class="fas fa-check-double"></i>
        <span><b>${count}</b> number${count === 1 ? '' : 's'} selected</span>
      </span>
      <button class="sp-btn sp-btn-ghost sp-btn-sm" onclick="document.querySelectorAll('.zy-cb-${tableId}').forEach(c=>c.checked=false);zySyncSelectionBar('${tableId}');" style="font-size:11px;">
        Clear selection
      </button>
    </div>
    <div class="zy-selection-actions">
      ${defaultActions.map(act => {
        const fnStr = typeof act.fn === 'string' ? act.fn : '';
        return `
        <button class="sp-btn ${act.cls || 'sp-btn-secondary'} sp-btn-sm"
                onclick="window.zyRunSelectionAction('${fnStr.replace(/'/g, "\\'")}')">
          <i class="fas ${act.icon}" style="margin-right:4px;"></i>
          ${act.label}
        </button>
      `;
      }).join('')}
    </div>
  `;
}
window.zySyncSelectionBar = zySyncSelectionBar;

/* 2. Bulk Add Queue Manager */
function zyRenderBulkQueueCard(jobs = [], poolStats = {}) {
  const availCount = poolStats.available || 0;
  const availCls = availCount > 50 ? 'high' : availCount > 0 ? 'low' : 'none';

  const rowsHtml = jobs && jobs.length ? jobs.map(j => {
    const status = (j.status || 'QUEUED').toUpperCase();
    const stCls = status === 'COMPLETED' ? 'completed' : status === 'PROCESSING' ? 'processing' : status === 'FAILED' ? 'failed' : 'queued';
    const percent = Math.min(100, Math.round(((j.allocated || 0) / Math.max(1, j.requested || 1)) * 100));

    return `
      <tr>
        <td style="font-family:monospace;font-size:11px;">${j.id || 'JOB-' + Math.random().toString(36).slice(2, 7).toUpperCase()}</td>
        <td><b>${j.client_name || j.client || '—'}</b></td>
        <td><span class="badge" style="background:var(--sp-bg-subtle);">${j.range_name || j.range || 'All'}</span></td>
        <td style="font-family:monospace;">${j.allocated || 0} / ${j.requested || 0}</td>
        <td style="width:140px;">
          <span class="zy-queue-status ${stCls}">${status}</span>
          <div class="zy-queue-progress">
            <div class="zy-queue-progress-bar" style="width:${percent}%;"></div>
          </div>
        </td>
        <td style="font-size:11px;color:var(--sp-text-muted);">${j.created_at || 'Just now'}</td>
      </tr>
    `;
  }).join('') : `
    <tr>
      <td colspan="6" style="text-align:center;padding:24px;color:var(--sp-text-muted);">
        <i class="fas fa-inbox" style="font-size:24px;display:block;margin-bottom:6px;opacity:0.6;"></i>
        No active bulk add jobs. Submit a job above to queue numbers.
      </td>
    </tr>
  `;

  return `
    <div class="zy-panel" style="margin-top:20px;">
      <div class="zy-panel-head" style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:8px;">
          <i class="fas fa-list-check" style="color:var(--sp-primary);"></i>
          <span>Bulk Add Queue &amp; Recent Allocations</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="zy-pool-avail-badge ${availCls}">
            <i class="fas fa-cubes"></i> Pool Available: <b>${availCount}</b>
          </span>
        </div>
      </div>
      <div class="zy-panel-body" style="padding:0;overflow-x:auto;">
        <table class="zy-bulk-queue-table">
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Target Client</th>
              <th>Range</th>
              <th>Progress</th>
              <th>Status</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
window.zyRenderBulkQueueCard = zyRenderBulkQueueCard;

/* ═══════════════════════════════════════════════════════════════
   HUMEX SMS — V7: PAYTERM LIST & POLISH & EMPTY/LOADING STATES
   ═══════════════════════════════════════════════════════════════ */

const ZY_DEFAULT_MASTER_PAYTERMS = [
  'Weekly',
  'Monthly',
  '7/1',
  '30/30',
  '1/1',
  '7/7',
  '15/15',
  '15/30',
  'Monthly60'
];

const ZY_PAYTERM_ALIAS_MAP = {
  '7/1': 'Weekly',
  'weekly': 'Weekly',
  'Weekly (7/1)': 'Weekly',
  '1/1': 'Weekly',
  '7/7': 'Weekly',
  'Daily': 'Weekly',
  'daily': 'Weekly',
  '30/30': 'Monthly',
  'monthly': 'Monthly',
  'Monthly (30/30)': 'Monthly',
  'Monthly60': 'Monthly',
  '30/1': 'Monthly',
  '15/15': 'Monthly',
  '15/30': 'Monthly',
  '15/1': 'Monthly',
  'Bi-Weekly': 'Monthly'
};

function zyMasterPaytermsList() {
  if (typeof window !== 'undefined' && Array.isArray(window._masterPayterms) && window._masterPayterms.length) {
    return window._masterPayterms;
  }
  return ZY_DEFAULT_MASTER_PAYTERMS;
}

function zyNormalizePayterm(term) {
  if (!term) return 'Weekly';
  const raw = String(term).trim();
  if (ZY_PAYTERM_ALIAS_MAP[raw]) return ZY_PAYTERM_ALIAS_MAP[raw];
  const lower = raw.toLowerCase();
  if (ZY_PAYTERM_ALIAS_MAP[lower]) return ZY_PAYTERM_ALIAS_MAP[lower];
  const master = zyMasterPaytermsList();
  const match = master.find(m => m.toLowerCase() === lower);
  return match || raw;
}

function zyRenderPaytermOptions(selectedTerm = '', customList = null) {
  const norm = zyNormalizePayterm(selectedTerm);
  const isMonthly = norm === 'Monthly' || selectedTerm === 'Monthly' || selectedTerm === '30/30' || selectedTerm === 'Monthly60';
  return `
    <option value="Weekly" ${!isMonthly ? 'selected' : ''}>Weekly (7/1)</option>
    <option value="Monthly" ${isMonthly ? 'selected' : ''}>Monthly (30/30)</option>
  `;
}

function zyPaytermBadge(term) {
  if (!term) return '';
  const norm = zyNormalizePayterm(term);
  const isMonthly = norm === 'Monthly' || term === 'Monthly' || term === '30/30' || term === 'Monthly60';
  const label = isMonthly ? 'Monthly (30/30)' : 'Weekly (7/1)';
  const slug = isMonthly ? 'monthly' : 'weekly';
  const icon = isMonthly ? 'fa-calendar-alt' : 'fa-calendar-week';
  return `<span class="zy-payterm-badge zy-pt-${slug}"><i class="fas ${icon}"></i> ${label}</span>`;
}

function zyEmptyState(options = {}) {
  const icon = options.icon || 'fa-folder-open';
  const title = options.title || 'No data found';
  const desc = options.desc || 'There are no records to display matching your criteria.';
  const actionLabel = options.actionLabel || options.btnLabel || '';
  const actionOnClick = options.actionOnClick || options.onClick || '';

  return `
    <div class="zy-empty-state">
      <div class="zy-empty-icon"><i class="fas ${icon}"></i></div>
      <div class="zy-empty-title">${title}</div>
      <div class="zy-empty-desc">${desc}</div>
      ${actionLabel && actionOnClick ? `
        <div class="zy-empty-action">
          <button class="sp-btn sp-btn-primary" onclick="${actionOnClick}">
            ${actionLabel}
          </button>
        </div>` : ''}
    </div>
  `;
}

function zyLoadingSpinner(text = 'Loading data, please wait…') {
  return `
    <div class="zy-loading-wrap" role="status" aria-live="polite">
      <div class="zy-loading-spinner" aria-hidden="true"></div>
      <div class="zy-loading-text">${text}</div>
    </div>
  `;
}

function zyShowLoading(containerId, text = 'Loading data, please wait…') {
  const el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
  if (!el) return;
  const existing = el.querySelector('.zy-loading-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.className = 'zy-loading-overlay';
  overlay.id = `zy-loading-overlay-${typeof containerId === 'string' ? containerId : 'elem'}`;
  overlay.innerHTML = zyLoadingSpinner(text);
  if (typeof window !== 'undefined' && window.getComputedStyle) {
    if (window.getComputedStyle(el).position === 'static') {
      el.style.position = 'relative';
    }
  }
  el.appendChild(overlay);
}

function zyHideLoading(containerId) {
  const el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
  if (!el) return;
  const overlay = el.querySelector('.zy-loading-overlay') || (typeof document !== 'undefined' && document.getElementById(`zy-loading-overlay-${containerId}`));
  if (overlay) overlay.remove();
}

window.ZY_DEFAULT_MASTER_PAYTERMS = ZY_DEFAULT_MASTER_PAYTERMS;
window.ZY_PAYTERM_ALIAS_MAP = ZY_PAYTERM_ALIAS_MAP;
window.zyMasterPaytermsList = zyMasterPaytermsList;
window.zyNormalizePayterm = zyNormalizePayterm;
window.zyRenderPaytermOptions = zyRenderPaytermOptions;
window.zyPaytermBadge = zyPaytermBadge;
window.zyEmptyState = zyEmptyState;
window.zyLoadingSpinner = zyLoadingSpinner;
window.zyShowLoading = zyShowLoading;
window.zyHideLoading = zyHideLoading;

/* ═══════════════════════════════════════════════════════════════
   F5: CDR FILTER BAR & UNIFIED .zy-filter-grid COMPONENT HELPERS
   ═══════════════════════════════════════════════════════════════ */

function zyDefaultFromDateTime() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} 00:00:00`;
}

function zyDefaultToDateTime() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} 23:59:59`;
}

function zyRenderCdrFilterGrid(options = {}) {
  const fromVal = options.fromVal || zyDefaultFromDateTime();
  const toVal = options.toVal || zyDefaultToDateTime();
  const rangeOptions = options.rangeOptions || '<option value="">All</option>';
  const clientOptions = options.clientOptions || '<option value="">All</option>';
  const onExport = options.onExport || "typeof zyTriggerCdrExport === 'function' ? zyTriggerCdrExport() : null";
  const onShow = options.onShow || "typeof zyTriggerCdrLoad === 'function' ? zyTriggerCdrLoad() : null";
  const onLimit = options.onLimit || "typeof zyTriggerCdrLoad === 'function' ? zyTriggerCdrLoad() : null";
  const onSearch = options.onSearch || "typeof zyToolbarFilter === 'function' ? zyToolbarFilter(this.value) : null";
  const tableId = options.tableId || 'dt-cdr';
  const selectedLimit = options.selectedLimit || '25';

  const groupChips = [
    { id: 'hour', label: 'Hour', val: 'hour' },
    { id: 'date', label: 'Date', val: 'date' },
    { id: 'month', label: 'Month', val: 'month' },
    { id: 'range', label: 'Range', val: 'range' },
    { id: 'client', label: 'Client', val: 'client' },
    { id: 'number', label: 'Number', val: 'number' },
    { id: 'cli', label: 'CLI', val: 'cli' }
  ];

  const chipsHtml = groupChips.map(c => `
    <label class="zy-chip-pill" for="grp-chip-${c.id}">
      <input type="checkbox" id="grp-chip-${c.id}" class="grp-chk" value="${c.val}" onchange="this.closest('.zy-chip-pill').classList.toggle('active', this.checked)">
      ${c.label}
    </label>
  `).join('');

  return `
    <div class="zy-filter-grid">
      <div class="zy-filter-grid-fields">
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="rp-from">From</label>
          <input type="text" id="rp-from" class="zy-filter-input" value="${fromVal}" placeholder="YYYY-MM-DD HH:mm:ss" onclick="if(window.zyOpenDatePicker)window.zyOpenDatePicker(this)">
        </div>
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="rp-to">To</label>
          <input type="text" id="rp-to" class="zy-filter-input" value="${toVal}" placeholder="YYYY-MM-DD HH:mm:ss" onclick="if(window.zyOpenDatePicker)window.zyOpenDatePicker(this)">
        </div>
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="rp-range">Range</label>
          <select id="rp-range" class="zy-filter-input">${rangeOptions}</select>
        </div>
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="rp-client">Client</label>
          <select id="rp-client" class="zy-filter-input">${clientOptions}</select>
        </div>
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="rp-num">Number</label>
          <input type="text" id="rp-num" class="zy-filter-input" placeholder="Number contains...">
        </div>
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="rp-cli">CLI</label>
          <input type="text" id="rp-cli" class="zy-filter-input" placeholder="CLI contains...">
        </div>
      </div>

      <div class="zy-groupby-card">
        <div class="zy-groupby-title">
          <i class="fas fa-layer-group" style="font-size:11px;color:var(--sp-text-muted,#64748b);"></i>
          Group By :
        </div>
        <div class="zy-groupby-chips">
          ${chipsHtml}
        </div>
      </div>

      <div class="zy-filter-actions">
        <button type="button" class="zy-btn-amber" id="btn-export-report" onclick="${onExport}">
          <i class="fas fa-file-export"></i> Export Report
        </button>
        <button type="button" class="zy-btn-blue-solid" id="btn-show-report" onclick="${onShow}">
          <i class="fas fa-chart-column"></i> Show Report
        </button>
      </div>

      <hr class="zy-filter-divider">

      <div class="zy-table-toolbar">
        <div class="zy-toolbar-left">
          <div class="zy-search-wrap">
            <i class="fas fa-search"></i>
            <input type="text" class="zy-toolbar-search" placeholder="Number, CLI, message, range" oninput="${onSearch}">
          </div>
          <div class="zy-toolbar-select-wrap">
            <label class="zy-toolbar-label" for="rp-limit">Show Records</label>
            <select id="rp-limit" class="zy-toolbar-select" onchange="${onLimit}">
              <option value="10" ${selectedLimit === '10' ? 'selected' : ''}>10</option>
              <option value="25" ${selectedLimit === '25' || !selectedLimit ? 'selected' : ''}>25</option>
              <option value="50" ${selectedLimit === '50' ? 'selected' : ''}>50</option>
              <option value="100" ${selectedLimit === '100' ? 'selected' : ''}>100</option>
              <option value="500" ${selectedLimit === '500' ? 'selected' : ''}>500</option>
              <option value="1000" ${selectedLimit === '1000' ? 'selected' : ''}>1000</option>
              <option value="2000" ${selectedLimit === '2000' ? 'selected' : ''}>2000</option>
              <option value="5000" ${selectedLimit === '5000' ? 'selected' : ''}>5000</option>
              <option value="10000" ${selectedLimit === '10000' ? 'selected' : ''}>10000</option>
              <option value="all" ${selectedLimit === 'all' ? 'selected' : ''}>All</option>
            </select>
          </div>
        </div>
        <div class="zy-toolbar-right">
          <div class="zy-toolbar-pills">
            <button type="button" class="zy-btn-pill" onclick="zyExportTableCopy('${tableId}')"><i class="fas fa-copy"></i> Copy</button>
            <button type="button" class="zy-btn-pill" onclick="zyExportTableCsv('${tableId}')"><i class="fas fa-file-csv"></i> CSV</button>
            <button type="button" class="zy-btn-pill" onclick="zyExportTableExcel('${tableId}')"><i class="fas fa-file-excel"></i> Excel</button>
            <button type="button" class="zy-btn-pill" onclick="zyExportTablePdf('${tableId}')"><i class="fas fa-file-pdf"></i> PDF</button>
            <button type="button" class="zy-btn-pill" onclick="zyPrintTable('${tableId}')"><i class="fas fa-print"></i> Print</button>
            <button type="button" class="zy-btn-pill" onclick="zyToggleColumnsModal('${tableId}', this)"><i class="fas fa-columns"></i> Columns</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function zyRenderNumbersFilterGrid(options = {}) {
  const rangeOptions = options.rangeOptions || '<option value="">All Ranges</option>';
  const clientOptions = options.clientOptions || '<option value="">All Clients</option>';
  const allocationOptions = options.allocationOptions || '<option value="">All Allocations</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned</option><option value="active">Active</option><option value="inactive">Inactive</option>';
  const onFilter = options.onFilter || "typeof zyApplyFilters === 'function' ? zyApplyFilters() : null";
  const onReset = options.onReset || "typeof zyResetFilters === 'function' ? zyResetFilters() : null";

  return `
    <div class="zy-filter-grid">
      <div class="zy-filter-grid-fields">
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="num-range">Range</label>
          <select id="num-range" class="zy-filter-input">${rangeOptions}</select>
        </div>
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="num-client">Client</label>
          <select id="num-client" class="zy-filter-input">${clientOptions}</select>
        </div>
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="num-status">Allocation</label>
          <select id="num-status" class="zy-filter-input">${allocationOptions}</select>
        </div>
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="num-starts-with">Number starts with</label>
          <input type="text" id="num-starts-with" class="zy-filter-input" placeholder="Number starts with...">
        </div>
        <div class="zy-filter-field" style="grid-column: 1 / -1;">
          <label class="zy-filter-label" for="num-range-contains">Range contains</label>
          <input type="text" id="num-range-contains" class="zy-filter-input" placeholder="Range contains...">
        </div>
      </div>

      <div class="zy-filter-actions">
        <button type="button" class="zy-btn-blue-solid" onclick="${onFilter}">
          <i class="fas fa-filter"></i> Filter
        </button>
        <button type="button" class="zy-btn-amber" style="background:#64748b;border-color:#475569;" onclick="${onReset}">
          <i class="fas fa-undo"></i> Reset
        </button>
      </div>
    </div>
  `;
}

function zyExportTableCopy(tableId = 'dt-cdr') {
  if (typeof zy2Export === 'function') {
    zy2Export(tableId, 'copy');
    return;
  }
  const table = document.getElementById(tableId) || document.querySelector('.zy-dt');
  if (!table) return;
  const rows = Array.from(table.querySelectorAll('tr')).map(r =>
    Array.from(r.querySelectorAll('th, td')).map(c => c.textContent.trim()).join('\t')
  ).join('\n');
  if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(rows).then(() => {
      if (typeof toast === 'function') toast('Table copied to clipboard', 'success');
    }).catch(() => {});
  }
}

function zyExportTableCsv(tableId = 'dt-cdr') {
  if (typeof zyExportCdrStream === 'function' && tableId === 'dt-cdr') {
    const fromEl = document.getElementById('rp-from');
    const toEl = document.getElementById('rp-to');
    const rangeEl = document.getElementById('rp-range');
    const managerEl = document.getElementById('rp-manager');
    const agentEl = document.getElementById('rp-agent');
    const clientEl = document.getElementById('rp-client');
    const numEl = document.getElementById('rp-num');
    const cliEl = document.getElementById('rp-cli');
    const groupCbs = Array.from(document.querySelectorAll('.grp-chk:checked')).map(cb => cb.value).join(',');
    zyExportCdrStream({
      date_from: fromEl ? fromEl.value : '',
      date_to: toEl ? toEl.value : '',
      range: rangeEl ? rangeEl.value : '',
      manager_id: managerEl ? managerEl.value : '',
      agent_id: agentEl ? agentEl.value : '',
      client_id: clientEl ? clientEl.value : '',
      search: numEl ? numEl.value : '',
      cli: cliEl ? cliEl.value : '',
      group_by: groupCbs
    });
    return;
  }
  if (typeof zy2Export === 'function') {
    zy2Export(tableId, 'csv');
  }
}

function zyExportTableExcel(tableId = 'dt-cdr') {
  if (typeof zy2Export === 'function') {
    zy2Export(tableId, 'excel');
    return;
  }
  zyExportTableCsv(tableId);
}

function zyExportTablePdf(tableId = 'dt-cdr') {
  if (typeof zy2Export === 'function') {
    zy2Export(tableId, 'pdf');
    return;
  }
  window.print();
}

function zyPrintTable(tableId = 'dt-cdr') {
  if (typeof zy2Export === 'function') {
    zy2Export(tableId, 'print');
    return;
  }
  window.print();
}

function zyToggleColumnsModal(tableId = 'dt-cdr', anchorEl) {
  const anchor = anchorEl || (typeof event !== 'undefined' && event?.target ? (event.target.closest('button') || event.target) : null);
  if (typeof zy2Cols === 'function') {
    zy2Cols(tableId, anchor);
    return;
  }
  if (typeof toast === 'function') {
    toast('Showing all default report columns', 'info');
  }
}

function zyToolbarFilter(val) {
  const table = document.querySelector('.zy-dt') || document.getElementById('dt-cdr');
  if (!table) return;
  const q = String(val || '').toLowerCase().trim();
  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(r => {
    if (r.querySelector('.zy-empty')) return;
    const txt = r.textContent.toLowerCase();
    r.style.display = (!q || txt.includes(q)) ? '' : 'none';
  });
}

function zyFilterTable(tableId, val) {
  let table = null;
  if (tableId) {
    table = document.getElementById(tableId);
    if (table && !table.matches('table')) {
      table = table.querySelector('table') || table;
    }
  }
  if (!table) table = document.querySelector('.zy-dt') || document.getElementById('dt-cdr');
  if (!table) return;
  const q = String(val || '').toLowerCase().trim();
  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(r => {
    if (r.querySelector('.zy-empty')) return;
    const txt = r.textContent.toLowerCase();
    r.style.display = (!q || txt.includes(q)) ? '' : 'none';
  });
}

window.zyDefaultFromDateTime = zyDefaultFromDateTime;
window.zyDefaultToDateTime = zyDefaultToDateTime;
window.zyRenderCdrFilterGrid = zyRenderCdrFilterGrid;
window.zyRenderNumbersFilterGrid = zyRenderNumbersFilterGrid;
window.zyExportTableCopy = zyExportTableCopy;
window.zyExportTableCsv = zyExportTableCsv;
window.zyExportTableExcel = zyExportTableExcel;
window.zyExportTablePdf = zyExportTablePdf;
window.zyPrintTable = zyPrintTable;
window.zyToggleColumnsModal = zyToggleColumnsModal;
window.zyToolbarFilter = zyToolbarFilter;
window.zyFilterTable = zyFilterTable;
window.zyToolbarFilterTable = zyFilterTable;
window.zyExportHtmlTable = zyExportHtmlTable;
window.zyPrintHtmlTable = zyPrintHtmlTable;
window.zyRenderTableToolbar = zyRenderTableToolbar;
window.zyHtmlTableCols = zyHtmlTableCols;
window.zyToggleHtmlCol = zyToggleHtmlCol;

// ── Copy Number with Live Green Tick Animation ──────────────────────────
window.zyCopyNumber = function(num, el) {
  if (!num) return;
  const str = String(num).trim();
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(str);
    } else {
      const ta = document.createElement('textarea');
      ta.value = str;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  } catch (_) {}

  if (el) {
    const badge = el.querySelector ? el.querySelector('.zy-copy-badge') : null;
    if (el.classList && el.classList.contains('zy-num-copy-box') && badge) {
      if (!badge.dataset.origHtml) badge.dataset.origHtml = badge.innerHTML;
      el.classList.add('copied');
      badge.innerHTML = '<i class="fas fa-check"></i> Copied';
      if (el._copyTimer) clearTimeout(el._copyTimer);
      el._copyTimer = setTimeout(() => {
        el.classList.remove('copied');
        badge.innerHTML = badge.dataset.origHtml || '<i class="far fa-copy"></i> Copy';
      }, 1400);
    } else {
      if (!el.dataset.origHtml) el.dataset.origHtml = el.innerHTML;
      el.innerHTML = '<i class="fas fa-check" style="color:#10b981;font-size:12px;"></i>';
      if (el._copyTimer) clearTimeout(el._copyTimer);
      el._copyTimer = setTimeout(() => {
        el.innerHTML = el.dataset.origHtml || '<i class="far fa-copy"></i>';
      }, 1400);
    }
  }
  if (typeof toast === 'function') toast('Copied: ' + str, 'success');
  else if (typeof zyFlash === 'function') zyFlash('Copied: ' + str);
};

// ── Large Clickable One-Click Number Copy Box (My Numbers / Test Numbers) ─
window.zyRenderNumberCopyBox = function(num) {
  const clean = String(num || '').trim();
  if (!clean || clean === '—') return '—';
  const esc = typeof zyEsc === 'function' ? zyEsc(clean) : clean.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<button type="button" class="zy-num-copy-box" onclick="event.stopPropagation();window.zyCopyNumber('${esc}', this)" title="Click to copy number"><span class="zy-copy-num">${esc}</span><span class="zy-copy-badge"><i class="far fa-copy"></i> Copy</span></button>`;
};

// ── Professional Interactive Day-to-Day Calendar Picker ──────────────────
window.zyOpenDatePicker = function(inputEl) {
  if (!inputEl) return;
  const existing = document.getElementById('zy-datepicker-popover');
  if (existing) {
    const wasSame = existing._targetEl === inputEl;
    existing.remove();
    if (wasSame) return;
  }

  let currDate = new Date();
  if (inputEl.value) {
    const parsed = new Date(inputEl.value.replace(' ', 'T'));
    if (!isNaN(parsed.getTime())) currDate = parsed;
  }

  let viewYear = currDate.getFullYear();
  let viewMonth = currDate.getMonth();
  let selDay = currDate.getDate();
  let selHour = String(currDate.getHours()).padStart(2, '0');
  let selMin = String(currDate.getMinutes()).padStart(2, '0');
  let selSec = String(currDate.getSeconds()).padStart(2, '0');

  const pop = document.createElement('div');
  pop.id = 'zy-datepicker-popover';
  pop._targetEl = inputEl;
  pop.style.cssText = 'position:absolute;z-index:99999;background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.18),0 8px 10px -6px rgba(0,0,0,0.1);width:290px;padding:14px;font-family:inherit;font-size:13px;';

  const rect = inputEl.getBoundingClientRect();
  pop.style.top = (rect.bottom + window.scrollY + 4) + 'px';
  pop.style.left = Math.max(10, rect.left + window.scrollX) + 'px';

  const renderCal = () => {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();

    let daysHtml = '';
    for (let i = 0; i < firstDayIndex; i++) {
      daysHtml += '<div></div>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const isSel = (d === selDay && viewMonth === currDate.getMonth() && viewYear === currDate.getFullYear());
      daysHtml += `<button type="button" class="zy-cal-day" data-day="${d}" style="width:32px;height:32px;border-radius:50%;border:none;cursor:pointer;font-size:12px;font-weight:600;background:${isSel ? '#2563eb' : 'transparent'};color:${isSel ? '#ffffff' : '#1e293b'};">${d}</button>`;
    }

    pop.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <button type="button" id="zy-cal-prev" style="background:none;border:none;cursor:pointer;font-size:16px;color:#475569;padding:4px 8px;">&lsaquo;</button>
        <span style="font-weight:700;color:#0f172a;font-size:13.5px;">${monthNames[viewMonth]} ${viewYear}</span>
        <button type="button" id="zy-cal-next" style="background:none;border:none;cursor:pointer;font-size:16px;color:#475569;padding:4px 8px;">&rsaquo;</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7, 1fr);text-align:center;font-size:11px;font-weight:700;color:#94a3b8;margin-bottom:6px;">
        <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7, 1fr);justify-items:center;align-items:center;gap:3px;margin-bottom:12px;">
        ${daysHtml}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;border-top:1px solid #f1f5f9;font-size:12px;">
        <div style="display:flex;align-items:center;gap:4px;">
          <input type="number" id="zy-cal-h" min="0" max="23" value="${selHour}" style="width:36px;height:26px;border:1px solid #cbd5e1;border-radius:4px;text-align:center;font-size:11.5px;">:
          <input type="number" id="zy-cal-m" min="0" max="59" value="${selMin}" style="width:36px;height:26px;border:1px solid #cbd5e1;border-radius:4px;text-align:center;font-size:11.5px;">:
          <input type="number" id="zy-cal-s" min="0" max="59" value="${selSec}" style="width:36px;height:26px;border:1px solid #cbd5e1;border-radius:4px;text-align:center;font-size:11.5px;">
        </div>
        <div style="display:flex;gap:6px;">
          <button type="button" id="zy-cal-today" style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:4px;padding:3px 8px;font-size:11px;font-weight:600;cursor:pointer;color:#475569;">Today</button>
          <button type="button" id="zy-cal-apply" style="background:#2563eb;color:#fff;border:none;border-radius:4px;padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer;">Apply</button>
        </div>
      </div>
    `;

    pop.querySelector('#zy-cal-prev').onclick = () => {
      viewMonth--;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      renderCal();
    };
    pop.querySelector('#zy-cal-next').onclick = () => {
      viewMonth++;
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      renderCal();
    };
    pop.querySelectorAll('.zy-cal-day').forEach(b => {
      b.onclick = () => {
        selDay = parseInt(b.dataset.day);
        pop.querySelectorAll('.zy-cal-day').forEach(d => {
          d.style.background = 'transparent';
          d.style.color = '#1e293b';
        });
        b.style.background = '#2563eb';
        b.style.color = '#ffffff';
      };
    });
    pop.querySelector('#zy-cal-today').onclick = () => {
      const now = new Date();
      viewYear = now.getFullYear();
      viewMonth = now.getMonth();
      selDay = now.getDate();
      selHour = '00'; selMin = '00'; selSec = '00';
      renderCal();
    };
    pop.querySelector('#zy-cal-apply').onclick = () => {
      const h = String(pop.querySelector('#zy-cal-h').value || '00').padStart(2, '0');
      const m = String(pop.querySelector('#zy-cal-m').value || '00').padStart(2, '0');
      const s = String(pop.querySelector('#zy-cal-s').value || '00').padStart(2, '0');
      const mFormatted = String(viewMonth + 1).padStart(2, '0');
      const dFormatted = String(selDay).padStart(2, '0');
      inputEl.value = `${viewYear}-${mFormatted}-${dFormatted} ${h}:${m}:${s}`;
      inputEl.dispatchEvent(new Event('change'));
      pop.remove();
    };
  };

  renderCal();
  document.body.appendChild(pop);

  setTimeout(() => {
    const onDocClick = (e) => {
      if (!pop.contains(e.target) && e.target !== inputEl) {
        pop.remove();
        document.removeEventListener('click', onDocClick);
      }
    };
    document.addEventListener('click', onDocClick);
  }, 10);
};

// ── Universal Interactive Date Picker Global Click Delegator ─────────────
document.addEventListener('click', (e) => {
  const el = e.target;
  if (!el || el.tagName !== 'INPUT') return;
  const id = el.id || '';
  const cls = el.className || '';
  const ph = el.placeholder || '';
  if (
    id === 'rp-from' || id === 'rp-to' ||
    id === 'cs-from' || id === 'cs-to' ||
    id === 'cdr-from' || id === 'cdr-to' ||
    id === 'th-date-from' || id === 'th-date-to' ||
    id === 'csms-from' || id === 'csms-to' ||
    id === 'mcdr-from' || id === 'mcdr-to' ||
    id === 'tc-from' || id === 'tc-to' ||
    cls.includes('zy-datepicker') ||
    ph.includes('YYYY-MM-DD')
  ) {
    el.style.cursor = 'pointer';
    if (!el.getAttribute('onclick') || !el.getAttribute('onclick').includes('zyOpenDatePicker')) {
      if (typeof window.zyOpenDatePicker === 'function') {
        window.zyOpenDatePicker(el);
      }
    }
  }
});

// ── Global Real-Time Username Uniqueness Checker ─────────────────────────
window.setupUsernameAvailabilityCheck = function(inputId, feedbackId, submitBtnId, table = 'users', excludeId = null) {
  const input = typeof inputId === 'string' ? document.getElementById(inputId) : inputId;
  const feedback = typeof feedbackId === 'string' ? document.getElementById(feedbackId) : feedbackId;
  const btn = typeof submitBtnId === 'string' ? document.getElementById(submitBtnId) : submitBtnId;
  if (!input) return;

  let timer = null;
  const check = async () => {
    const val = (input.value || '').trim();
    if (!val) {
      if (feedback) feedback.innerHTML = '';
      input.style.borderColor = '';
      if (btn) btn.disabled = false;
      return;
    }
    try {
      const q = `/api/check-username?username=${encodeURIComponent(val)}${excludeId ? `&exclude_id=${excludeId}` : ''}${table ? `&table=${table}` : ''}`;
      const tok = localStorage.getItem('session_token') || sessionStorage.getItem('session_token') || '';
      const headers = tok ? { 'Authorization': 'Bearer ' + tok, 'X-Session-Token': tok } : {};
      const res = await fetch(q, { headers, credentials: 'include' });
      const data = await res.json();
      if (data.exists) {
        if (feedback) {
          feedback.innerHTML = `<span style="color:#ef4444;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px;"><i class="fas fa-exclamation-circle"></i> This username already exists</span>`;
        }
        input.style.borderColor = '#ef4444';
        if (btn) btn.disabled = true;
      } else {
        if (feedback) {
          feedback.innerHTML = `<span style="color:#10b981;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px;"><i class="fas fa-check-circle"></i> Username is available</span>`;
        }
        input.style.borderColor = '#10b981';
        if (btn) btn.disabled = false;
      }
    } catch (_) {}
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(check, 200);
  });
  input.addEventListener('blur', check);
  if (input.value && input.value.trim()) {
    check();
  }
};

// ── Highlight OTP codes in SMS messages ──────────────────────────────────
window.zyHighlightOtp = function(msg) {
  if (!msg) return '';
  const escaped = (typeof zyEsc === 'function' ? zyEsc(msg) : String(msg).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  // Match 4 to 8 digit numbers, or standalone codes
  return escaped.replace(/\b(\d{4,8})\b/g, '<span class="zy-otp-badge" style="background:#eff6ff;color:#1d4ed8;font-weight:700;border:1px solid #bfdbfe;padding:1px 6px;border-radius:4px;letter-spacing:0.5px;font-family:monospace;display:inline-block;margin:0 2px;">$1</span>');
};

// ── Floating Action Button (FAB) (Hidden as requested) ──
window.zyRenderFab = function(_tooltipText = '', _onClickHandler = '') {
  return '';
};

window.zyOpenFabModal = function() {
  if (typeof zyActionAllocate === 'function') {
    zyActionAllocate();
  } else if (typeof zyAllocateAll === 'function') {
    zyAllocateAll();
  } else if (typeof zyOwnerAllocateAll === 'function') {
    zyOwnerAllocateAll();
  } else if (typeof loadPage === 'function') {
    loadPage('my-sms-numbers');
  }
};

// ── Excel-Style KPI Column Boxes Helper ──────────────────────────────────
window.zyRenderExcelKpiBoxes = function(boxes = []) {
  if (!boxes || !boxes.length) return '';
  return `
    <div class="zy-excel-kpi-grid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));gap:10px;margin-bottom:16px;">
      ${boxes.map(b => `
        <div class="zy-excel-kpi-box" style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:8px;padding:10px 14px;box-shadow:0 1px 3px rgba(0,0,0,0.03);position:relative;overflow:hidden;">
          <div style="font-size:10.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">${b.label}</div>
          <div style="font-size:19px;font-weight:800;color:${b.color || '#0f172a'};margin-top:2px;font-family:monospace;">${b.value}</div>
          ${b.sub ? `<div style="font-size:10.5px;color:#64748b;margin-top:2px;">${b.sub}</div>` : ''}
          ${b.borderLeft ? `<div style="position:absolute;left:0;top:0;bottom:0;width:3.5px;background:${b.borderLeft};"></div>` : ''}
        </div>
      `).join('')}
    </div>
  `;
};

// ── Inject Excel-Style Spreadsheet Table Grid Rules ──────────────────────
(function() {
  if (document.getElementById('zy-excel-grid-css')) return;
  const style = document.createElement('style');
  style.id = 'zy-excel-grid-css';
  style.textContent = `
    /* Excel Spreadsheet Style Grid */
    .zy-dt2-table, table.data-table, .zy-table-excel {
      border-collapse: collapse !important;
      border: 1.5px solid #cbd5e1 !important;
      font-size: 12.5px !important;
      width: 100% !important;
    }
    .zy-dt2-table th, table.data-table th, .zy-table-excel th {
      background: #f1f5f9 !important;
      color: #1e293b !important;
      font-weight: 700 !important;
      font-size: 11.5px !important;
      text-transform: uppercase !important;
      letter-spacing: 0.4px !important;
      border: 1px solid #cbd5e1 !important;
      border-bottom: 2px solid #94a3b8 !important;
      padding: 8px 10px !important;
      white-space: nowrap !important;
    }
    .zy-dt2-table td, table.data-table td, .zy-table-excel td {
      border: 1px solid #e2e8f0 !important;
      padding: 7px 10px !important;
      color: #334155 !important;
    }
    .zy-dt2-table tbody tr:nth-child(even), table.data-table tbody tr:nth-child(even) {
      background: #f8fafc !important;
    }
    .zy-dt2-table tbody tr:hover, table.data-table tbody tr:hover {
      background: #e0f2fe !important;
    }
    .zy-dt2-table tfoot td, table.data-table tfoot td {
      background: #f1f5f9 !important;
      font-weight: 700 !important;
      border: 1px solid #cbd5e1 !important;
      border-top: 2px solid #64748b !important;
    }
    .zy-excel-cell-mono {
      font-family: 'JetBrains Mono', 'Roboto Mono', monospace !important;
      font-weight: 600 !important;
    }
  `;
  document.head.appendChild(style);
})();

