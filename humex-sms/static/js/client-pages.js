/* ═══════════════════════════════════════════════════════════════
   𝑴𝑨𝑰𝑻 𝑺𝑴𝑺 — CLIENT pages. Requires speed-kit.js
   ═══════════════════════════════════════════════════════════════ */

let ZY_RANGES = [], ZY_NUMROWS = [], ZY_TESTNUMS = [];

/* ═══ 1. SMS RANGES & RATECARD MASTER CATALOG ═════════════════════════ */
let ZY_CLIENT_RANGE_LIST = [];

async function pgSmsRanges() {
  const c = document.getElementById('page-content');
  zyCrumb(['SMS Module', 'Ranges & Rate Card']);
  c.innerHTML = `
    <div class="page-header" style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div>
        <div class="page-title" style="font-size:18px;font-weight:800;color:#0f172a;">
          <i class="fas fa-table-list" style="color:#0ea5e9;margin-right:6px;"></i> Ranges &amp; Rate Card
        </div>
        <div class="page-subtitle" style="font-size:12.5px;color:#64748b;">
          Master catalog of available termination ranges, payout rates, and real-time numbers room.
        </div>
      </div>
      <div class="page-actions" style="display:flex;gap:8px;">
        <button class="btn btn-primary btn-sm" onclick="loadPage('my-numbers')">
          <i class="fas fa-mobile-screen"></i> My Numbers
        </button>
      </div>
    </div>
    <div id="cl-range-kpis" style="margin-bottom:16px;"><div class="zy-loading">Loading metric summaries…</div></div>
    <div class="apx-card" style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      <div class="apx-card-header" style="height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:#f8fafc;border-bottom:1px solid #cbd5e1;">
        <span style="font-weight:700;font-size:13px;color:#1e293b;">
          <i class="fas fa-table-list" style="color:#0ea5e9;margin-right:6px;"></i> Available Termination Ranges &amp; Client Rates
        </span>
        <div style="display:flex;gap:6px;align-items:center;">
          <span id="cl-mode-badge" class="badge badge-admin-managed" style="font-size:10.5px;padding:2px 8px;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;border-radius:4px;">Loading Policy…</span>
        </div>
      </div>
      <div class="apx-card-body" id="cl-ranges-table-host" style="padding:14px;"><div class="zy-loading">Loading termination ranges…</div></div>
    </div>`;

  try {
    const [rangesRes, myNumsRes, policy] = await Promise.all([
      apiFetch('/api/numbers/sms-ranges').catch(() => []),
      apiFetch(`/api/numbers?client_id=${CLIENT_ID}&limit=1`).catch(() => ({ total: 0, data: [] })),
      typeof zyFetchAllocPolicy === 'function' ? zyFetchAllocPolicy() : Promise.resolve({ mode: 'request' })
    ]);

    const list = zyList(rangesRes);
    const heldNumbersCount = (myNumsRes && typeof myNumsRes.total === 'number') ? myNumsRes.total : (zyList(myNumsRes).length);
    ZY_CLIENT_RANGE_LIST = list;
    window._zyClPolicy = policy || { mode: 'request' };
    const isSelfAlloc = window._zyClPolicy.mode === 'self_allocate';
    const modeBadge = document.getElementById('cl-mode-badge');
    if (modeBadge) {
      modeBadge.textContent = isSelfAlloc ? 'Mode: Self-Allocate Only' : 'Mode: Request Only';
      modeBadge.style.background = isSelfAlloc ? '#ecfdf5' : '#eff6ff';
      modeBadge.style.color = isSelfAlloc ? '#047857' : '#1d4ed8';
      modeBadge.style.borderColor = isSelfAlloc ? '#a7f3d0' : '#bfdbfe';
    }

    // Calculate metrics
    const totalRanges = list.length;
    const providers = new Set(list.map(r => r.provider || 'Direct')).size;
    let sumWeekly = 0, sumMonthly = 0;
    list.forEach(r => {
      const pts = r.payterms || {};
      const w = parseFloat(pts['Weekly'] !== undefined ? pts['Weekly'] : (pts['7/1'] !== undefined ? pts['7/1'] : (r.payout ?? 0.01))) || 0;
      const m = parseFloat(pts['Monthly'] !== undefined ? pts['Monthly'] : (pts['30/30'] !== undefined ? pts['30/30'] : (pts['Monthly60'] ?? (pts['15/15'] ?? w)))) || 0;
      sumWeekly += w;
      sumMonthly += m;
    });
    const avgWeekly = totalRanges ? (sumWeekly / totalRanges).toFixed(4) : '0.0000';
    const avgMonthly = totalRanges ? (sumMonthly / totalRanges).toFixed(4) : '0.0000';

    const kpiEl = document.getElementById('cl-range-kpis');
    if (kpiEl) {
      kpiEl.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));gap:10px;">
          <div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:8px;padding:10px 14px;box-shadow:0 1px 2px rgba(0,0,0,0.03);">
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Total Ranges</div>
            <div style="font-size:20px;font-weight:800;color:#0f172a;margin-top:2px;">${totalRanges}</div>
            <div style="font-size:11px;color:#10b981;margin-top:2px;">${providers} Unique Provider(s)</div>
          </div>
          <div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:8px;padding:10px 14px;box-shadow:0 1px 2px rgba(0,0,0,0.03);">
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Held in Pool</div>
            <div style="font-size:20px;font-weight:800;color:#2563eb;margin-top:2px;">${heldNumbersCount}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;">Allocated Numbers in Pool</div>
          </div>
          <div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:8px;padding:10px 14px;box-shadow:0 1px 2px rgba(0,0,0,0.03);">
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Network Status</div>
            <div style="font-size:20px;font-weight:800;color:#059669;margin-top:2px;">Online</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;">All Termination Routes Active</div>
          </div>
          <div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:8px;padding:10px 14px;box-shadow:0 1px 2px rgba(0,0,0,0.03);">
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Settlement Schedule</div>
            <div style="font-size:20px;font-weight:800;color:#7c3aed;margin-top:2px;">Standard</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;">Automated Account Credit</div>
          </div>
        </div>`;
    }

    const rows = list.map((r, i) => {
      const rName = r.range_name || r.name || r.country || '—';
      const curr = r.currency || 'USD';
      const currSym = curr === 'EUR' ? '€' : (curr === 'GBP' ? '£' : '$');
      const clientRate = r.payout != null ? r.payout : (r.client_rate != null ? r.client_rate : 0.01);
      const roomCount = Math.max(0, (r.available != null ? r.available : (r.free_count ?? 1500)));

      return [
        i + 1,
        zyEsc(r.provider || 'Direct'),
        `<strong style="color:#0f172a;">${zyEsc(rName)}</strong>`,
        `<span class="monospace" style="font-weight:700;color:#2563eb;">${zyEsc(r.prefix || '—')}</span>`,
        { v: r.active === false ? '' : 'yes', h: zyTick(r.active !== false) },
        `<span style="font-weight:700;">${zyEsc(curr)}</span>`,
        `<span class="badge badge-purple" style="font-size:10.5px;">${zyEsc(r.payterm || 'Weekly')}</span>`,
        `<span style="font-family:monospace;font-weight:700;color:#16a34a;">${currSym} ${Number(clientRate).toFixed(4)}</span>`,
        { v: '', h: `<div style="display:inline-flex;align-items:center;gap:4px;">
          <button type="button" class="apx-btn apx-btn-icon apx-btn-small" style="color:#0284c7;border-color:#bae6fd;background:#f0f9ff;" onclick="zyViewClientRange(${i})" title="View Details"><i class="fas fa-eye"></i></button>
          ${isSelfAlloc
            ? `<button type="button" class="apx-btn apx-btn-small" style="color:#059669;border-color:#a7f3d0;background:#ecfdf5;" onclick="zyOpenSelfAllocateModal('${zyEsc(rName)}', ${r.id || 'null'}, window._zyClPolicy, pgSmsRanges)" title="Self-Allocate Numbers"><i class="fas fa-bolt"></i> Self-Allocate</button>`
            : `<button type="button" class="apx-btn apx-btn-small" style="color:#2563eb;border-color:#bfdbfe;background:#eff6ff;" onclick="zyOpenRequestNumbersModal('${zyEsc(rName)}', ${r.id || 'null'}, window._zyClPolicy, pgSmsRanges)" title="Request Numbers"><i class="fas fa-phone-volume"></i> Request</button>`}
        </div>` }
      ];
    });

    const host = document.getElementById('cl-ranges-table-host');
    if (host) {
      host.innerHTML = zyDT2('dt-cl-ranges', {
        cols: ['#', 'Provider', 'Name', 'Prefix', 'Active', 'Currency', 'Payterm', 'Payout Rate', 'Actions'],
        rows
      });
      zy2Render('dt-cl-ranges');
    }
  } catch (err) {
    console.error('Failed to load client ranges:', err);
    const host = document.getElementById('cl-ranges-table-host');
    if (host) host.innerHTML = `<div class="text-danger" style="padding:20px;text-align:center;">Failed to load SMS Ranges: ${zyEsc(err.message || 'Network error')}</div>`;
  }
}

/* 3-Column Range Specification Modal matching Owner/Manager/Agent */
function zyViewClientRange(i) {
  const r = ZY_CLIENT_RANGE_LIST[i] || {};
  const rName = r.name || r.range_name || `${r.country || ''} ${r.provider || ''}`.trim() || 'Details';
  const pts = r.payterms || {};
  const dailyVal = pts['Daily'] !== undefined ? pts['Daily'] : (pts['1/1'] !== undefined ? pts['1/1'] : (r.payout ?? 0.01));
  const weeklyVal = pts['Weekly'] !== undefined ? pts['Weekly'] : (pts['7/1'] !== undefined ? pts['7/1'] : (r.payout ?? 0.01));
  const biweekly15 = pts['15/15'] !== undefined ? pts['15/15'] : weeklyVal;
  const biweekly30 = pts['15/30'] !== undefined ? pts['15/30'] : weeklyVal;
  const monthlyVal = pts['Monthly'] !== undefined ? pts['Monthly'] : (pts['30/30'] !== undefined ? pts['30/30'] : weeklyVal);
  const monthly60 = pts['Monthly60'] !== undefined ? pts['Monthly60'] : monthlyVal;
  const curr = r.currency || 'USD';
  const currSym = curr === 'EUR' ? '€' : (curr === 'GBP' ? '£' : '$');
  const clis = r.cli_list || (Array.isArray(r.clis) && r.clis.length ? r.clis.join(', ') : (r.cli || 'All CLIs'));
  const clientRate = r.payout != null ? r.payout : (r.client_rate != null ? r.client_rate : 0.01);
  const roomCount = Math.max(0, (r.available != null ? r.available : (r.free_count ?? 1500)));

  zyModal(`Range Specification: ${zyEsc(rName)}`, `
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:12px;margin-bottom:12px;">
      <!-- Col 1: General Info -->
      <div style="background:#f8fafc;padding:12px;border:1px solid #cbd5e1;border-radius:6px;">
        <h5 style="margin:0 0 10px 0;font-size:12px;font-weight:700;text-transform:uppercase;color:#1e293b;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">
          <i class="fas fa-tower-broadcast" style="color:#0284c7;margin-right:4px;"></i> General Info
        </h5>
        <div style="font-size:12px;line-height:22px;">
          <div><span style="color:#64748b;">Provider:</span> <b>${zyEsc(r.provider || 'Direct')}</b></div>
          <div><span style="color:#64748b;">Range Name:</span> <b>${zyEsc(rName)}</b></div>
          <div><span style="color:#64748b;">Country:</span> <b>${zyEsc(r.country || '—')}</b></div>
          <div><span style="color:#64748b;">Prefix:</span> <b class="monospace" style="color:#2563eb;">${zyEsc(r.prefix || '—')}</b></div>
          <div><span style="color:#64748b;">Currency:</span> <b>${zyEsc(curr)}</b></div>
          <div><span style="color:#64748b;">Default Payterm:</span> <b class="badge badge-purple" style="font-size:10.5px;">${zyEsc(r.payterm || 'Weekly')}</b></div>
        </div>
      </div>

      <!-- Col 2: Limits & Routing -->
      <div style="background:#f8fafc;padding:12px;border:1px solid #cbd5e1;border-radius:6px;">
        <h5 style="margin:0 0 10px 0;font-size:12px;font-weight:700;text-transform:uppercase;color:#1e293b;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">
          <i class="fas fa-sliders" style="color:#10b981;margin-right:4px;"></i> Limits &amp; Routing
        </h5>
        <div style="font-size:12px;line-height:22px;">
          <div><span style="color:#64748b;">Status:</span> ${r.active !== false ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Inactive</span>'}</div>
          <div><span style="color:#64748b;">Max SMS / Day:</span> <b>${r.max_sms_day != null ? r.max_sms_day : (r.otp_limit || 'Unlimited')}</b></div>
          <div><span style="color:#64748b;">Room in Pool:</span> <b style="color:#10b981;">${roomCount.toLocaleString()} numbers</b></div>
          <div><span style="color:#64748b;">Memo:</span> <span style="font-style:italic;">${zyEsc(r.memo || 'None')}</span></div>
          <div><span style="color:#64748b;">Allowed CLIs:</span> <small style="display:block;color:#64748b;line-height:1.3;margin-top:2px;">${zyEsc(clis)}</small></div>
        </div>
      </div>

      <!-- Col 3: Client Rate & Terms -->
      <div style="background:#f8fafc;padding:12px;border:1px solid #cbd5e1;border-radius:6px;">
        <h5 style="margin:0 0 10px 0;font-size:12px;font-weight:700;text-transform:uppercase;color:#1e293b;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">
          <i class="fas fa-coins" style="color:#d97706;margin-right:4px;"></i> Payout &amp; Terms
        </h5>
        <div style="font-size:12px;line-height:22px;">
          <div><span style="color:#64748b;">Payout Rate:</span> <b style="font-family:monospace;font-size:14px;color:#16a34a;">${currSym} ${Number(clientRate).toFixed(4)}</b> / SMS</div>
          <div><span style="color:#64748b;">Currency:</span> <b style="color:#0f172a;">${zyEsc(curr)}</b></div>
          <div><span style="color:#64748b;">Payout Schedule:</span> <span class="badge badge-purple">${zyEsc(r.payterm || 'Weekly')}</span></div>
          <div><span style="color:#64748b;">Traffic Status:</span> <span class="badge badge-green">Live Acceptance</span></div>
          <div style="margin-top:8px;font-size:11px;color:#64748b;line-height:1.4;">
            <i class="fas fa-check-circle" style="color:#10b981;"></i> Standard rate approved for your client profile.
          </div>
        </div>
      </div>
    </div>`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     ${(window._zyClPolicy && window._zyClPolicy.mode === 'self_allocate')
       ? `<button class="zy-btn-blue" onclick="closeModal();zyOpenSelfAllocateModal('${zyEsc(rName)}', ${r.id || 'null'}, window._zyClPolicy, pgSmsRanges)"><i class="fas fa-bolt"></i> Self-Allocate Numbers</button>`
       : `<button class="zy-btn-blue" onclick="closeModal();zyOpenRequestNumbersModal('${zyEsc(rName)}', ${r.id || 'null'}, window._zyClPolicy, pgSmsRanges)"><i class="fas fa-phone-volume"></i> Request Numbers</button>`}`);
}

async function pgRateCard() {
  await pgSmsRanges();
}

/* ═══ MY SMS NUMBERS ════════════════════════════════════════ */
async function pgMyNumbers() {
  const c = document.getElementById('page-content');
  zyCrumb(['My SMS Numbers']);
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title"><i class="fas fa-mobile-screen" style="color:#2563eb;"></i> My SMS Numbers Pool</div>
        <div class="page-subtitle">Active numbers allocated to your client account. (SD: Daily, SW: Weekly)</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-danger btn-sm" onclick="zyClientReturnSelected()"><i class="fas fa-arrow-up"></i> Return to Agent</button>
      </div>
    </div>
    <div class="card apx-card" style="margin-top:10px;">
      <div class="card-header apx-card-header">
        <span class="card-title"><i class="fas fa-mobile-screen" style="color:#10b981;margin-right:6px;"></i> My SMS Numbers Pool</span>
        <div class="zy-head-acts" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-danger btn-sm" onclick="zyClientReturnSelected()" title="Return selected numbers back to agent pool">
            <i class="fas fa-arrow-up"></i> Return to Agent
          </button>
        </div>
      </div>
      <div class="zy-filter-grid" style="margin:14px;background:#ffffff;border:1.5px solid #cbd5e1;border-radius:8px;padding:14px;">
        <div class="zy-filter-grid-fields" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;align-items:flex-end;">
          <div class="zy-filter-field">
            <label class="zy-filter-label" for="num-range" style="font-size:11.5px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;display:block;">Range</label>
            <select id="num-range" class="zy-filter-input" style="width:100%;height:38px;min-height:38px;border-radius:6px;border:1.5px solid #cbd5e1;padding:0 10px;font-size:13px;background:#ffffff;box-sizing:border-box;" onchange="zyClientNumFilter()">
              <option value="">All Ranges</option>
            </select>
          </div>
          <div class="zy-filter-field">
            <label class="zy-filter-label" for="num-starts-with" style="font-size:11.5px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;display:block;">Number starts with</label>
            <input type="text" id="num-starts-with" class="zy-filter-input" placeholder="Number starts with..." style="width:100%;height:38px;min-height:38px;border-radius:6px;border:1.5px solid #cbd5e1;padding:0 10px;font-size:13px;background:#ffffff;box-sizing:border-box;" oninput="zyClientNumFilter()">
          </div>
          <div class="zy-filter-field">
            <label class="zy-filter-label" for="num-range-contains" style="font-size:11.5px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;display:block;">Range contains</label>
            <input type="text" id="num-range-contains" class="zy-filter-input" placeholder="Range contains..." style="width:100%;height:38px;min-height:38px;border-radius:6px;border:1.5px solid #cbd5e1;padding:0 10px;font-size:13px;background:#ffffff;box-sizing:border-box;" oninput="zyClientNumFilter()">
          </div>
        </div>
        <div class="zy-filter-actions" style="margin-top:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button type="button" class="zy-btn-blue-solid" style="height:38px;padding:0 20px;font-size:12.5px;font-weight:700;border-radius:6px;display:inline-flex;align-items:center;gap:6px;" onclick="zyClientNumFilter()">
            <i class="fas fa-filter"></i> Filter
          </button>
          <button type="button" class="zy-btn-amber" style="height:38px;padding:0 18px;font-size:12.5px;font-weight:700;border-radius:6px;background:#64748b;border-color:#475569;display:inline-flex;align-items:center;gap:6px;" onclick="zyResetClientNumFilter()">
            <i class="fas fa-undo"></i> Reset
          </button>
        </div>
      </div>
      <div class="apx-card-body zy-panel-body" id="cl-numbers-table-host" style="padding:0 14px 14px 14px;"><div class="zy-loading">Loading numbers…</div></div>
    </div>`;

  const [nums, ranges] = await Promise.all([
    apiFetch(`/api/numbers?client_id=${CLIENT_ID}&limit=100000`),
    apiFetch('/api/numbers/sms-ranges').catch(() => [])
  ]);
  ZY_RANGES = zyList(ranges);
  window._zyClientRawNums = zyList(nums);

  const rangeSel = document.getElementById('num-range');
  if (rangeSel) {
    const uniqueRanges = Array.from(new Set(window._zyClientRawNums.map(n => n.range || n.country || '').filter(Boolean)));
    rangeSel.innerHTML = '<option value="">All Ranges</option>' +
      uniqueRanges.map(r => `<option value="${zyEsc(r)}">${zyEsc(r)}</option>`).join('');
  }

  zyRenderClientNumbers(window._zyClientRawNums);
}

function zyRenderClientNumbers(list) {
  ZY_NUMROWS = (list || []).map(n => {
    const rangeName = n.range || `${n.country || ''} ${n.provider || ''}`.trim() || '—';
    const numHtml = typeof zyRenderNumberCopyBox === 'function'
      ? zyRenderNumberCopyBox(n.number)
      : (n.number ? `<span style="font-family:monospace;font-weight:600;color:var(--sp-primary,#166534);">${zyEsc(n.number)}</span>` : '—');

    const r = [
      { v: rangeName, h: `<span style="font-weight:600;">${zyEsc(rangeName)}</span>` },
      { v: n.prefix || '', h: n.prefix || '—' },
      { v: n.number || '', h: numHtml },
      { v: n.payterm || 'Weekly', h: `<span class="badge" style="background:var(--sp-bg-subtle);">${zyEsc(n.payterm || 'Weekly')}</span>` },
      { v: n.payout ?? '', h: n.payout != null ? `<span style="font-weight:700;color:var(--sp-primary,#166534);">$${Number(n.payout).toFixed(4)}</span>` : '—' },
      { v: (n.sms_daily || 0) + (n.sms_weekly || 0), h: `SD: <b>${n.sms_daily || 0}</b> | SW: <b>${n.sms_weekly || 0}</b>` }
    ];
    r.__id = n.id;
    return r;
  });

  const body = document.querySelector('#page-content .zy-panel-body');
  if (body) {
    body.innerHTML = zyDT2('dt-numbers', {
      cols: ['Range', 'Prefix', 'Number', 'My Payterm', 'My Payout', 'Limits'],
      rows: ZY_NUMROWS,
      check: true
    });
    zy2Render('dt-numbers');
  }
}

function zyClientNumFilter() {
  const rVal = (document.getElementById('num-range')?.value || '').toLowerCase();
  const startsWith = (document.getElementById('num-starts-with')?.value || '').trim().toLowerCase();
  const rangeContains = (document.getElementById('num-range-contains')?.value || '').trim().toLowerCase();

  const filtered = (window._zyClientRawNums || []).filter(n => {
    if (rVal) {
      const r = (n.range || n.country || '').toLowerCase();
      if (!r.includes(rVal)) return false;
    }
    if (rangeContains) {
      const r = (n.range || n.country || '').toLowerCase();
      if (!r.includes(rangeContains)) return false;
    }
    if (startsWith) {
      const num = String(n.number || '').toLowerCase();
      if (!num.startsWith(startsWith)) return false;
    }
    return true;
  });

  zyRenderClientNumbers(filtered);
}

function zyResetClientNumFilter() {
  const r = document.getElementById('num-range');
  const sw = document.getElementById('num-starts-with');
  const rc = document.getElementById('num-range-contains');
  if (r) r.value = '';
  if (sw) sw.value = '';
  if (rc) rc.value = '';
  zyRenderClientNumbers(window._zyClientRawNums || []);
}

window.zyClientReturnSelected = async function() {
  const ids = zy2Checked('dt-numbers');
  if (!ids.length) { toast('Please select at least one number to return', 'error'); return; }
  if (!confirm(`Return ${ids.length} selected number(s) back to agent pool?`)) return;

  try {
    for (const id of ids) {
      await apiFetch(`/api/numbers/${id}/return`, { method: 'POST' });
    }
    toast(`Successfully returned ${ids.length} number(s) to agent pool`, 'success');
    pgMyNumbers();
  } catch (err) {
    toast(err.message || 'Failed to return numbers', 'error');
  }
};

/* ═══ SMS CDR STATS (CDR & STATISTICS V5) ══════════════════════ */
async function pgMySms(summary = false) {
  const c = document.getElementById('page-content');
  zyCrumb(['CDR & Statistics']);

  const defaultFrom = typeof zyDefaultFromDateTime === 'function' ? zyDefaultFromDateTime() : `${(typeof zyToday === 'function' ? zyToday() : new Date().toISOString().slice(0, 10))} 00:00:00`;
  const defaultTo = typeof zyDefaultToDateTime === 'function' ? zyDefaultToDateTime() : `${(typeof zyToday === 'function' ? zyToday() : new Date().toISOString().slice(0, 10))} 23:59:59`;

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
    <label class="zy-compact-groupby-item">
      <input type="checkbox" class="grp-chk" value="${g.val}">
      <span>${g.label}</span>
    </label>
  `).join('');

  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title"><i class="fas fa-chart-column" style="color:#2563eb;"></i> CDR &amp; Statistics</div>
        <div class="page-subtitle">Here You can view all the call detail records, traffic stats, and export reports.</div>
      </div>
    </div>

    <div class="zy-filter-grid">
      <div class="zy-filter-grid-fields">
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="rp-from">From</label>
          <input type="text" id="rp-from" class="zy-filter-input" value="${defaultFrom}" placeholder="YYYY-MM-DD HH:mm:ss" onclick="if(window.zyOpenDatePicker)window.zyOpenDatePicker(this)">
        </div>
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="rp-to">To</label>
          <input type="text" id="rp-to" class="zy-filter-input" value="${defaultTo}" placeholder="YYYY-MM-DD HH:mm:ss" onclick="if(window.zyOpenDatePicker)window.zyOpenDatePicker(this)">
        </div>
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="rp-range">Range</label>
          <select id="rp-range" class="zy-filter-input">
            <option value="">Filter Range</option>
          </select>
        </div>
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="rp-num">Number</label>
          <input type="text" id="rp-num" class="zy-filter-input" placeholder="Search Number">
        </div>
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="rp-cli">CLI</label>
          <input type="text" id="rp-cli" class="zy-filter-input" placeholder="Search CLI">
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
        <button type="button" class="zy-btn-amber" id="btn-export-report" onclick="zyClientExportReport()">
          <i class="fas fa-file-export"></i> Export Report
        </button>
        <button type="button" class="zy-btn-blue-solid" id="btn-show-report" onclick="pgMySmsLoad()">
          <i class="fas fa-chart-column"></i> Show Report
        </button>
      </div>

      <hr class="zy-filter-divider">

      <div class="zy-table-toolbar">
        <div class="zy-toolbar-left">
          <div class="zy-search-wrap">
            <i class="fas fa-search"></i>
            <input type="text" class="zy-toolbar-search" placeholder="Number, CLI, message, range" oninput="if(typeof zyToolbarFilter==='function')zyToolbarFilter(this.value)">
          </div>
          <div class="zy-toolbar-select-wrap">
            <label class="zy-toolbar-label" for="rp-limit">Show Records</label>
            <select id="rp-limit" class="zy-toolbar-select" onchange="pgMySmsLoad()">
              <option value="10">10</option>
              <option value="25" selected>25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="500">500</option>
              <option value="1000">1000</option>
              <option value="5000">5000</option>
              <option value="10000">10000</option>
              <option value="15000">15000</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>
        <div class="zy-toolbar-right">
          <div class="zy-toolbar-pills">
            <button type="button" class="zy-btn-pill" onclick="zyExportTableCopy('dt-cdr')"><i class="fas fa-copy"></i> Copy</button>
            <button type="button" class="zy-btn-pill" onclick="zyExportTableCsv('dt-cdr')"><i class="fas fa-file-csv"></i> CSV</button>
            <button type="button" class="zy-btn-pill" onclick="zyExportTableExcel('dt-cdr')"><i class="fas fa-file-excel"></i> Excel</button>
            <button type="button" class="zy-btn-pill" onclick="zyExportTablePdf('dt-cdr')"><i class="fas fa-file-pdf"></i> PDF</button>
            <button type="button" class="zy-btn-pill" onclick="zyPrintTable('dt-cdr')"><i class="fas fa-print"></i> Print</button>
            <button type="button" class="zy-btn-pill" onclick="zyToggleColumnsModal('dt-cdr')"><i class="fas fa-columns"></i> Columns</button>
          </div>
        </div>
      </div>

      <!-- Results Table: seamless unified report body inside the single card -->
      <div class="zy-panel-body" id="rp-body" style="padding:0;margin-top:12px;">
        <div class="zy-loading" style="padding:40px;text-align:center;color:#64748b;">Loading CDR records…</div>
      </div>
    </div>`;

  const ranges = zyList(await apiFetch('/api/numbers/sms-ranges'));
  ZY_RANGES = ranges;
  const rEl = document.getElementById('rp-range');
  if (rEl) {
    rEl.innerHTML = `<option value="">Filter Range</option>` +
      ranges.map(r => `<option value="${r.id}">${zyEsc(r.range_name || r.name || r.country || '')}${r.prefix ? ` (${zyEsc(r.prefix)})` : ''}</option>`).join('');
  }
  // Auto-run first load
  pgMySmsLoad(summary);
}

window.zyClientExportReport = function() {
  const val = id => (document.getElementById(id) || {}).value || '';
  const checkedBoxes = Array.from(document.querySelectorAll('.grp-chk:checked')).map(cb => cb.value);
  zyExportCdrStream({
    client_id: typeof CLIENT_ID !== 'undefined' ? CLIENT_ID : '',
    date_from: val('rp-from'),
    date_to: val('rp-to'),
    range: val('rp-range'),
    search: val('rp-num'),
    cli: val('rp-cli'),
    status: val('rp-status') !== 'All' ? val('rp-status') : '',
    group_by: checkedBoxes.join(',')
  });
};

async function pgMySmsLoad(pageOrSummary = 1) {
  const targetPage = typeof pageOrSummary === 'number' ? pageOrSummary : 1;
  const isSummaryMode = typeof pageOrSummary === 'boolean' ? pageOrSummary : false;

  const body = document.getElementById('rp-body');
  if (!body) return;

  if (window._clientCdrAbortController) {
    try { window._clientCdrAbortController.abort(); } catch (_) {}
  }
  window._clientCdrAbortController = new AbortController();
  const reqSignal = window._clientCdrAbortController.signal;

  if (typeof zySkeleton === 'function') {
    body.innerHTML = zySkeleton('report');
  } else {
    body.innerHTML = `<div class="zy-loading" style="padding:40px;text-align:center;color:#64748b;">
      <div style="display:inline-block;margin-bottom:8px;"><i class="fas fa-spinner fa-spin fa-2x" style="color:#0ea5e9;"></i></div>
      <div>Loading report…</div>
    </div>`;
  }

  const val = id => (document.getElementById(id) || {}).value || '';
  const from = val('rp-from'), to = val('rp-to');
  const rangeId = val('rp-range');
  const num = val('rp-num'), cli = val('rp-cli');

  const checkedBoxes = Array.from(document.querySelectorAll('.grp-chk:checked')).map(cb => cb.value);

  const params = new URLSearchParams();
  if (typeof CLIENT_ID !== 'undefined' && CLIENT_ID) params.append('client_id', CLIENT_ID);
  if (from) params.append('date_from', from);
  if (to) params.append('date_to', to);
  if (rangeId) params.append('range', rangeId);
  if (num) params.append('search', num);
  if (cli) params.append('cli', cli);
  if (checkedBoxes.length) params.append('group_by', checkedBoxes.join(','));

  const limitVal = val('rp-limit') || '25';
  const limitNum = limitVal === 'all' ? 10000 : (parseInt(limitVal, 10) || 25);
  params.append('limit', limitVal);
  params.append('page', String(targetPage));

  try {
    const logs = await apiFetch(`/api/sms/logs?${params.toString()}`, { signal: reqSignal });
    if (!logs) return;
    const data = (logs && logs.data) || [];

    if (logs && logs.grouped && checkedBoxes.length) {
      const keyLabels = {
        hour: 'Hour',
        day: 'Day',
        date: 'Date',
        month: 'Month',
        range: 'Range',
        number: 'Number',
        cli: 'CLI',
        status: 'Status'
      };
      const cols = [
        ...checkedBoxes.map(k => keyLabels[k] || k),
        'SMS Count',
        'Currency',
        'My Payout'
      ];
      const rows = data.map(g => [
        ...checkedBoxes.map(k => g[k] || '—'),
        g.sms_count || 0,
        g.currency || 'USD',
        `$${Number(g.client_payout || g.payout || 0).toFixed(4)}`
      ]);

      const sum = logs && logs.summary;
      const totalSms = (sum && sum.total_sms != null) ? sum.total_sms : data.reduce((s, g) => s + (g.sms_count || 0), 0);
      const totalPayout = (sum && sum.client_payout != null) ? sum.client_payout : data.reduce((s, g) => s + (parseFloat(g.client_payout || g.payout) || 0), 0);
      const totalGroups = (sum && sum.total_groups != null) ? sum.total_groups : data.length;

      const footTds = [
        `<td><b>Total Groups: ${totalGroups}</b></td>`,
        ...Array(Math.max(0, checkedBoxes.length - 1)).fill('<td></td>'),
        `<td><span class="zy-total-badge"><i class="fas fa-comment-sms"></i> Total SMS: <b>${totalSms.toLocaleString()}</b></span></td>`,
        `<td><span class="badge" style="background:var(--sp-bg-subtle);">USD</span></td>`,
        `<td><b>$${totalPayout.toFixed(4)}</b></td>`
      ];

      body.innerHTML = zyDT2('dt-cdr', {
        cols,
        rows,
        sort: checkedBoxes.length,
        dir: -1,
        perPage: limitNum,
        serverMode: false,
        footRow: footTds.join('')
      });
      zy2Render('dt-cdr');
    } else {
      const cols = ['Date', 'Provider', 'Range', 'Type', 'Number', 'CLI', 'SMS', 'Currency', 'My Payout', 'Cause', 'IP'];
      const rows = data.map(s => {
        const dtCell = typeof zyFormatDateTimeStacked === 'function'
          ? zyFormatDateTimeStacked(s.timestamp || s.date)
          : { v: (s.timestamp || s.date || '').replace('T', ' ').slice(0, 19), h: (s.timestamp || s.date || '').replace('T', ' ').slice(0, 19) };
        const myP = parseFloat(s.client_payout != null ? s.client_payout : (s.client_amount != null ? s.client_amount : (s.client_rate != null ? s.client_rate : (s.my_payout || 0)))) || 0;
        const causeVal = (s.cause || (s.status === 'delivered' || s.status === 'success' ? 'Success' : (s.status || '—')));

        const maskedCli = typeof zyMaskCli === 'function' ? zyMaskCli(s.cli || s.app || '—') : (s.cli || s.app || '—');
        const smsCellHtml = typeof zyRenderSmsCell === 'function' ? zyRenderSmsCell(s.message || '') : `<div class="zy-sms-cell">${typeof zyEsc === 'function' ? zyEsc(s.message || '') : (s.message || '')}</div>`;
        const numStr = String(s.number || '').trim();

        return [
          dtCell,
          zyEsc(s.provider || '—'),
          zyEsc(s.range_name || s.range_label || s.range || (s.country || '—')),
          s.type === 'Test Panel' ? 'Test Panel' : 'General',
          { v: numStr, h: numStr ? `<span class="monospace" style="font-weight:600;">${zyEsc(numStr)}</span>` : '—' },
          { v: s.cli || '—', h: `<span class="monospace">${zyEsc(maskedCli)}</span>` },
          { v: s.message || '', h: smsCellHtml },
          zyEsc(s.currency || '$'),
          zyFmtMoney(myP, 4),
          zyEsc(causeVal),
          zyEsc(s.ip || '—')
        ];
      });

      const sum = logs.summary || {};
      const totalSms = (sum.total_sms != null) ? sum.total_sms : (logs.total != null ? logs.total : rows.length);
      const totalPayout = (sum.client_payout != null) ? sum.client_payout : data.reduce((acc, s) => acc + (parseFloat(s.client_payout != null ? s.client_payout : (s.client_rate || 0)) || 0), 0);

      const footRow = `<td><b>Total SMS<br>${totalSms.toLocaleString()}</b></td>` +
        '<td></td>'.repeat(6) +
        `<td></td>` +
        `<td><b>My Payout<br>${zyFmtMoney(totalPayout, 4)}</b></td>` +
        '<td></td><td></td>';

      body.innerHTML = zyDT2('dt-cdr', {
        cols,
        rows,
        sort: 0,
        dir: -1,
        perPage: limitNum,
        serverMode: true,
        totalRecords: logs.total != null ? logs.total : data.length,
        totalPages: logs.total_pages || 1,
        page: logs.page || targetPage,
        onPageChange: (p) => pgMySmsLoad(p),
        onSizeChange: (s) => {
          const sel = document.getElementById('rp-limit');
          if (sel) sel.value = String(s);
          pgMySmsLoad(1);
        },
        footRow
      });
      zy2Render('dt-cdr');
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    console.error('Client CDR load error:', err);
    body.innerHTML = '<div class="zy-empty" style="padding:40px;text-align:center;color:#ef4444;">Failed to load CDR records. Please try again.</div>';
  }
}

/* ═══ SMS TEST PANEL ════════════════════════════════════════ */
async function pgSmsTestPanel() {
  const c = document.getElementById('page-content');
  zyCrumb(['SMS Test Panel']);
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title"><i class="fas fa-flask" style="color:#2563eb;"></i> SMS Test Panel</div>
        <div class="page-subtitle">Here you can see all test numbers, test them, and view test reports.</div>
      </div>
    </div>
    <div class="card apx-card" style="margin-top:10px;margin-bottom:16px;">
      <div class="card-header apx-card-header">
        <span class="card-title"><i class="fas fa-flask" style="color:#0ea5e9;margin-right:6px;"></i> SMS Test Numbers</span>
        <div class="zy-head-acts" style="display:flex;align-items:center;gap:6px;">
          ${zyS2('tp-range', 'Select Range', [])}
          <button class="btn btn-primary btn-sm" onclick="zyTestFilter()"><i class="fas fa-filter"></i> Filter</button>
        </div>
      </div>
      <div class="card-body apx-card-body zy-panel-body"><div class="zy-loading">Loading…</div></div>
    </div>
    <div class="card apx-card">
      <div class="card-header apx-card-header">
        <span class="card-title"><i class="fas fa-list-check" style="color:#10b981;margin-right:6px;"></i> Recent SMS Test</span>
      </div>
      <div class="apx-card-body" id="tp-recent" style="padding:14px;"><div class="zy-loading">Loading…</div></div>
    </div>`;

  const [ranges, nums, logs] = await Promise.all([
    apiFetch('/api/numbers/sms-ranges'),
    apiFetch('/api/sms/test-numbers?limit=500'),
    apiFetch('/api/sms/test-logs?limit=500')
  ]);
  ZY_RANGES = zyList(ranges);
  ZY_S2['tp-range'].items = ZY_RANGES.map(r => r.name || r.country || '');

  ZY_TESTNUMS = zyList(nums).map(n => [
    n.range_label || '—',
    { v: n.number || '', h: typeof zyRenderNumberCopyBox === 'function' ? zyRenderNumberCopyBox(n.number) : `<span class="monospace fw-600">${zyEsc(n.number || '—')}</span>` }
  ]);

  c.querySelector('.zy-panel-body').innerHTML = zyDT2('dt-testnums', {
    cols: ['Range', 'Test Number'], rows: ZY_TESTNUMS });
  zy2Render('dt-testnums');

  const mask = s => String(s || '').replace(/./g, '*').slice(0, 6);
  const rows = zyList(logs).map(s => [
    typeof zyFormatDateTimeStacked === 'function' ? zyFormatDateTimeStacked(s.timestamp || s.date) : zyDateOnly(s.timestamp),
    zyEsc(s.provider || '—'),
    zyEsc(s.range_label || s.range_name || '—'),
    'Test Panel',
    { v: s.number || '', h: `<span class="monospace" style="font-weight:600;">${zyEsc(s.number || '—')}</span>` },
    { v: s.cli || '', h: `<span class="monospace">${zyEsc(zyMaskCli(s.cli))}</span>` },
    mask(s.message)
  ]);
  document.getElementById('tp-recent').innerHTML = zyDT2('dt-testlog', {
    cols: ['Date', 'Provider', 'Range', 'Type', 'Number', 'CLI', 'SMS'], rows, sort: 0, dir: -1 });
  zy2Render('dt-testlog');
}
function zyTestFilter() {
  const q = zyS2Value('tp-range').toLowerCase();
  const t = ZYT2['dt-testnums']; if (!t) return;
  t.rows = q ? ZY_TESTNUMS.filter(r => String(zyCell2(r[0]).v).toLowerCase().includes(q)) : ZY_TESTNUMS;
  t.page = 1; zy2Render('dt-testnums');
}

/* ═══ CLI SEARCH (AstraSMS-Style Realtime Route Inspector) ═════ */
let _clCliHours = 24;
let _clCliRoutes = [];

window.zySetClCliTimeFilter = function(hours) {
  _clCliHours = hours;
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - (hours * 3600 * 1000));
  const fmt = d => {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const fromEl = document.getElementById('cs-from');
  const toEl = document.getElementById('cs-to');
  if (fromEl) fromEl.value = fmt(fromDate);
  if (toEl) toEl.value = fmt(toDate);

  document.querySelectorAll('.zy-cl-cli-chip').forEach(btn => {
    const val = parseFloat(btn.getAttribute('data-hours'));
    const isAct = val === hours;
    btn.style.background = isAct ? '#2563eb' : '#f1f5f9';
    btn.style.color = isAct ? '#ffffff' : '#334155';
    btn.style.borderColor = isAct ? '#2563eb' : '#cbd5e1';
  });

  pgAccessSearchLoad();
};

async function pgAccessSearch() {
  const c = document.getElementById('page-content');
  zyCrumb(['SMS Module', 'CLI Search']);

  const defaultFrom = typeof zyDefaultFromDateTime === 'function' ? zyDefaultFromDateTime() : `${(new Date().toISOString().slice(0, 10))} 00:00:00`;
  const defaultTo = typeof zyDefaultToDateTime === 'function' ? zyDefaultToDateTime() : `${(new Date().toISOString().slice(0, 10))} 23:59:59`;

  c.innerHTML = `
    <div class="page-header" style="margin-bottom:14px;">
      <div>
        <div class="page-title" style="font-size:18px;font-weight:800;color:#0f172a;">CLI Search &amp; Route Inspector</div>
        <div class="page-subtitle" style="font-size:12.5px;color:#64748b;">Search active routes and message feed running on your numbers</div>
      </div>
    </div>

    <!-- Time Range Presets -->
    <div class="zy-panel" style="margin-bottom:14px;padding:12px 16px;background:#ffffff;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-right:4px;">
          <i class="far fa-clock" style="margin-right:4px;"></i> Time Range:
        </span>
        ${[
          { label: '30m', hours: 0.5 },
          { label: '1h',  hours: 1 },
          { label: '4h',  hours: 4 },
          { label: '12h', hours: 12 },
          { label: '24h', hours: 24 }
        ].map(t => `
          <button type="button" class="zy-cl-cli-chip" data-hours="${t.hours}" onclick="zySetClCliTimeFilter(${t.hours})"
                  style="border:1px solid ${t.hours === 24 ? '#2563eb' : '#cbd5e1'};background:${t.hours === 24 ? '#2563eb' : '#f1f5f9'};color:${t.hours === 24 ? '#ffffff' : '#334155'};padding:4px 12px;border-radius:9999px;font-size:12px;font-weight:700;cursor:pointer;">
            ${t.label}
          </button>
        `).join('')}
      </div>
    </div>

    <!-- Filters Bar -->
    <div class="zy-panel" style="margin-bottom:16px;padding:14px 16px;background:#ffffff;">
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;align-items:end;">
        <div>
          <label style="display:block;font-size:11.5px;font-weight:700;color:#475569;margin-bottom:4px;">From Date</label>
          <input class="zy-fb-input" id="cs-from" value="${defaultFrom}" style="width:100%;height:38px;padding:0 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;cursor:pointer;" onclick="if(window.zyOpenDatePicker)window.zyOpenDatePicker(this)">
        </div>
        <div>
          <label style="display:block;font-size:11.5px;font-weight:700;color:#475569;margin-bottom:4px;">To Date</label>
          <input class="zy-fb-input" id="cs-to" value="${defaultTo}" style="width:100%;height:38px;padding:0 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;cursor:pointer;" onclick="if(window.zyOpenDatePicker)window.zyOpenDatePicker(this)">
        </div>
        <div>
          <label style="display:block;font-size:11.5px;font-weight:700;color:#475569;margin-bottom:4px;">Sender (CLI)</label>
          <input class="zy-fb-input" id="cs-cli" placeholder="e.g. facebook, google" style="width:100%;height:38px;padding:0 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;" onkeyup="if(event.key==='Enter')pgAccessSearchLoad()">
        </div>
        <div>
          <label style="display:block;font-size:11.5px;font-weight:700;color:#475569;margin-bottom:4px;">Message Text</label>
          <input class="zy-fb-input" id="cs-text" placeholder="Content filter" style="width:100%;height:38px;padding:0 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;" onkeyup="if(event.key==='Enter')pgAccessSearchLoad()">
        </div>
        <div style="display:flex;gap:8px;">
          <button class="zy-btn-blue" onclick="pgAccessSearchLoad()" style="height:38px;padding:0 16px;flex:1;"><i class="fas fa-search"></i> Search</button>
          <button class="btn btn-outline btn-sm" onclick="document.getElementById('cs-cli').value='';document.getElementById('cs-text').value='';zySetClCliTimeFilter(24);" style="height:38px;padding:0 12px;"><i class="fas fa-undo"></i></button>
        </div>
      </div>
    </div>

    <!-- Results Panel -->
    <div class="zy-panel">
      <div class="zy-panel-head" style="display:flex;align-items:center;justify-content:space-between;">
        <span><i class="fas fa-list-check" style="color:#00a86b;margin-right:6px;"></i> Active Routes &amp; Conversion</span>
        <span id="cs-result-count" class="badge badge-green" style="font-size:11px;padding:3px 8px;">0 routes</span>
      </div>
      <div class="zy-panel-body" id="cs-body" style="padding:14px;">
        <div class="zy-loading">Loading…</div>
      </div>
    </div>
  `;
  pgAccessSearchLoad();
}

async function pgAccessSearchLoad() {
  const body = document.getElementById('cs-body');
  if (!body) return;
  body.innerHTML = `<div class="zy-loading" style="padding:30px;text-align:center;color:#64748b;"><i class="fas fa-spinner fa-spin"></i> Loading routes…</div>`;

  const fromVal = (document.getElementById('cs-from')?.value || '').trim();
  const toVal = (document.getElementById('cs-to')?.value || '').trim();
  const cliFilter = (document.getElementById('cs-cli')?.value || '').trim();
  const textFilter = (document.getElementById('cs-text')?.value || '').trim();

  const params = new URLSearchParams();
  if (fromVal) params.append('date_from', fromVal);
  if (toVal) params.append('date_to', toVal);
  if (cliFilter) params.append('cli', cliFilter);
  if (textFilter) params.append('search', textFilter);
  params.append('hours', _clCliHours);

  try {
    const res = await apiFetch(`/api/cli-search?${params.toString()}`);
    const routes = (res && res.routes) || [];
    _clCliRoutes = routes;

    const countBadge = document.getElementById('cs-result-count');
    if (countBadge) countBadge.textContent = `${res?.summary?.total_sms ?? 0} SMS (${routes.length} routes)`;

    if (!routes.length) {
      body.innerHTML = `
        <div style="padding:40px 20px;text-align:center;color:#64748b;">
          <i class="fas fa-magnifying-glass" style="font-size:32px;color:#94a3b8;margin-bottom:12px;"></i>
          <div style="font-weight:700;font-size:14px;color:#1e293b;margin-bottom:4px;">No matching routes found</div>
          <div style="font-size:12.5px;">Try adjusting your time presets or search query.</div>
        </div>`;
      return;
    }

    const rows = routes.map((g, idx) => {
      const lastStr = (g.last_seen || '').replace('T', ' ').slice(0, 19);
      const conv = g.conversion_rate ?? 100;
      const convBadge = conv >= 80 ? 'badge-green' : (conv >= 50 ? 'badge-blue' : 'badge-red');

      return [
        `<strong style="color:#0f172a;">${zyEsc(g.range)}</strong>`,
        `<span class="monospace" style="font-weight:600;color:#2563eb;">${zyEsc(g.cli)}</span>`,
        `<span class="badge badge-green font-bold" style="font-size:12px;padding:3px 9px;">${g.count} SMS</span>`,
        `<span class="badge ${convBadge}" style="font-size:11px;padding:2px 7px;">${conv}% Success</span>`,
        `<span style="font-size:11.5px;color:#64748b;">${lastStr || '—'}</span>`,
        `<button type="button" class="btn btn-outline btn-sm" onclick="zyClientViewCliSms(${idx})" style="padding:3px 10px;font-size:11.5px;font-weight:600;">
           <i class="fas fa-eye"></i> View SMS (${g.count})
         </button>`
      ];
    });

    body.innerHTML = zyDT2('dt-cl-cli', {
      cols: ['Range / Country', 'CLI', 'SMS Count', 'Conversion', 'Last Seen', 'Actions'],
      rows,
      sort: 2,
      dir: -1
    });
    zy2Render('dt-cl-cli');
  } catch (err) {
    console.error('Client CLI search error:', err);
    body.innerHTML = `<div style="padding:20px;text-align:center;color:#ef4444;">Failed to execute CLI search: ${escapeHtml(err.message)}</div>`;
  }
}

window.zyClientViewCliSms = function(idx) {
  const r = _clCliRoutes[idx];
  if (!r) return;
  const samples = r.sample_messages || [];

  zyModal(`Route Messages: ${r.range} (${r.cli})`, `
    <div style="margin-bottom:12px;display:flex;gap:10px;align-items:center;">
      <span class="badge badge-green">${r.count} Total SMS</span>
      <span class="badge badge-blue">Conversion: ${r.conversion_rate ?? 100}%</span>
    </div>
    ${samples.length ? buildTable(
      ['Time', 'Number', 'Message Preview', 'Status'],
      samples.map(s => [
        typeof zyFormatDateTimeStacked === 'function' ? zyFormatDateTimeStacked(s.timestamp).h : (s.timestamp || '').replace('T', ' ').slice(0, 19),
        `<span class="monospace">${escapeHtml(s.number || '—')}</span>`,
        escapeHtml(s.text || '—'),
        `<span class="badge badge-green">${s.status || 'Delivered'}</span>`
      ])
    ) : '<p class="text-muted">No live samples captured for this route yet.</p>'}
  `);
};

/* ═══ CREDIT NOTES ═══════════════════════════════════════════ */
async function pgClientCreditNotes() {
  const c = document.getElementById('page-content');
  zyCrumb(['Credit Notes']);
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title"><i class="fas fa-file-invoice" style="color:#2563eb;"></i> My Credit Notes</div>
        <div class="page-subtitle">Review your earned credit notes and download official settlement vouchers.</div>
      </div>
    </div>
    <div class="card zy-panel">
      <div class="card-header zy-panel-head" style="display:flex;align-items:center;justify-content:space-between;">
        <span class="card-title">My Credit Notes</span>
      </div>
      <div class="card-body zy-panel-body" id="ccn-body"><div class="zy-loading">Loading…</div></div>
    </div>`;
  pgClientCreditNotesLoad();
}

async function pgClientCreditNotesLoad() {
  const body = document.getElementById('ccn-body');
  if (!body) return;
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;
  const list = zyList(await apiFetch('/api/credit-notes?limit=500'));
  const rows = list.map(n => {
    const due = new Date(String(n.date || n.created || '').slice(0, 10));
    due.setDate(due.getDate() + 1);
    return [
      (n.date || n.created || '').slice(0, 10),
      n.reason || 'SMS Wholesale Revenue',
      n.term || 'Weekly',
      n.currency || 'USD',
      Number(n.amount || 0).toFixed(3),
      isNaN(due) ? '' : due.toISOString().slice(0, 10),
      { v: '', h: `<button class="zy-rowbtn" onclick="window.open('/api/credit-notes/${n.id}/pdf', '_blank')" title="Download Voucher"><i class="fas fa-file-invoice" style="color:var(--sp-primary);"></i></button>` }
    ];
  });
  body.innerHTML = zyDT2('dt-ccn', {
    cols: ['Date', 'Description', 'Term', 'Currency', 'Amount', 'Due Date', 'Voucher'], rows, sort: 0, dir: -1 });
  zy2Render('dt-ccn');
}

/* ═══ PAYMENT REQUESTS ══════════════════════════════════════ */
async function pgClientPaymentRequests() {
  const c = document.getElementById('page-content');
  zyCrumb(['Payment Requests']);

  let currentBal = 0;
  let thisWeekUsd = 0;
  let weekRangeStr = 'UTC Mon – Sun';
  let minPayout = 30;

  try {
    const [earn, settings] = await Promise.all([
      apiFetch(`/api/client/${CLIENT_ID}/earnings`),
      apiFetch('/api/settings').catch(() => ({}))
    ]);
    currentBal = Number(earn?.main_balance ?? earn?.balance ?? 0);
    thisWeekUsd = Number(earn?.this_week ?? 0);
    if (earn?.week_range) weekRangeStr = earn.week_range;
    if (settings?.min_payout != null) minPayout = Number(settings.min_payout);
  } catch (e) {
    currentBal = Number(CLIENT_USER?.balance || 0);
  }

  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title"><i class="fas fa-wallet" style="color:#2563eb;"></i> Payment Requests</div>
        <div class="page-subtitle">View your account balance and submit payout requests to your account manager.</div>
      </div>
    </div>
    
    <!-- Astra SMS 2-Card Metric Row -->
    <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:12px;margin-bottom:16px;">
      <!-- Main balance ($) -->
      <div class="sp-card" style="padding:14px 16px;border-radius:10px;border:1px solid #cbd5e1;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.04);display:flex;flex-direction:column;justify-content:space-between;min-height:115px;">
        <div>
          <div style="font-size:11.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.3px;">Main balance ($)</div>
          <div style="font-size:24px;font-weight:800;color:#0f172a;margin:4px 0 6px;">$<span id="cpr-bal-val">${currentBal.toFixed(2)}</span></div>
          <div style="font-size:11.5px;color:#64748b;display:flex;align-items:center;gap:4px;">
            <i class="fas fa-info-circle" style="color:#0ea5e9;"></i> Min for payout: <strong>$${minPayout.toFixed(2)}</strong>
          </div>
        </div>
        <div style="margin-top:12px;">
          <button type="button" class="sp-btn-primary" style="height:32px;padding:0 14px;font-size:12px;font-weight:700;border-radius:6px;display:inline-flex;align-items:center;gap:6px;background:#10b981;border:none;color:#fff;cursor:pointer;" onclick="zyClientRequestPayoutModal(${currentBal}, ${minPayout})">
            <i class="fas fa-paper-plane"></i> Request payment
          </button>
        </div>
      </div>

      <!-- This Week Mon-Sun -->
      <div class="sp-card" style="padding:14px 16px;border-radius:10px;border:1px solid #cbd5e1;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.04);display:flex;flex-direction:column;justify-content:space-between;min-height:115px;">
        <div>
          <div style="font-size:11.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.3px;">This Week Mon-Sun</div>
          <div style="font-size:24px;font-weight:800;color:#2563eb;margin:4px 0 6px;">$<span id="cpr-week-val">${thisWeekUsd.toFixed(4)}</span></div>
          <div style="font-size:11.5px;color:#64748b;display:flex;align-items:center;gap:4px;">
            <i class="fas fa-calendar-alt" style="color:#8b5cf6;"></i> <span>${zyEsc(weekRangeStr)}</span>
          </div>
        </div>
        <div style="margin-top:12px;font-size:11.5px;color:#059669;font-weight:600;display:flex;align-items:center;gap:5px;">
          <i class="fas fa-check-circle"></i> Auto-settles to Main Balance at Sun 23:59:59 UTC
        </div>
      </div>
    </div>

    <div class="zy-panel">
      <div class="zy-panel-head" style="display:flex;align-items:center;justify-content:space-between;">
        <span>My Payout Requests</span>
      </div>
      <div class="zy-panel-body" id="cpr-body"><div class="zy-loading">Loading…</div></div>
    </div>`;

  pgClientPaymentRequestsLoad();
}

window.zyClientRequestPayoutModal = async function(currentBal = 0) {
  let minPayout = 10;
  try {
    const settings = await apiFetch('/api/settings');
    minPayout = Number(settings?.min_payout ?? 10);
  } catch (e) {}

  zyModal('Request Payout', `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:13px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="color:#64748b;">Current Balance:</span>
        <strong style="color:#10b981;font-size:15px;">$${Number(currentBal).toFixed(2)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#64748b;">Minimum Payout:</span>
        <strong>$${Number(minPayout).toFixed(2)}</strong>
      </div>
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label class="zy-lbl" style="font-weight:600;">Payout Amount ($) *</label>
      <input type="number" id="cpr-amount" class="zy-input" style="width:100%;height:38px;" step="0.01" min="${minPayout}" max="${currentBal}" value="${currentBal >= minPayout ? currentBal : minPayout}">
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label class="zy-lbl" style="font-weight:600;">Payment Method *</label>
      <select id="cpr-method" class="zy-input" style="width:100%;height:38px;">
        <option value="USDT TRC20" selected>USDT (TRC-20)</option>
        <option value="Bank Transfer">Bank Wire Transfer</option>
        <option value="Payoneer">Payoneer</option>
        <option value="PayPal">PayPal</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label class="zy-lbl" style="font-weight:600;">Wallet Address / IBAN / Account Details *</label>
      <input type="text" id="cpr-wallet" class="zy-input" style="width:100%;height:38px;" placeholder="Enter TRC20 address or bank details">
    </div>
    <div class="form-group" style="margin-bottom:8px;">
      <label class="zy-lbl" style="font-weight:600;">Notes (Optional)</label>
      <input type="text" id="cpr-notes" class="zy-input" style="width:100%;height:38px;" placeholder="Weekly client traffic payout">
    </div>
  `, `
    <button class="zy-btn-grey" onclick="closeModal()">Cancel</button>
    <button class="sp-btn-primary" id="btn-submit-cpr" onclick="zySubmitClientPayout(${minPayout}, ${currentBal})"><i class="fas fa-paper-plane"></i> Submit Request</button>
  `);
};

window.zySubmitClientPayout = async function(minPayout, currentBal) {
  const amt = parseFloat(document.getElementById('cpr-amount')?.value);
  const method = document.getElementById('cpr-method')?.value;
  const wallet = document.getElementById('cpr-wallet')?.value.trim();
  const notes = document.getElementById('cpr-notes')?.value.trim();

  if (isNaN(amt) || amt <= 0) { toast('Please enter a valid payout amount', 'error'); return; }
  if (amt < minPayout) { toast(`Payment low. Minimum payout is $${minPayout.toFixed(2)}`, 'error'); return; }
  if (amt > currentBal) { toast(`Amount cannot exceed available balance of $${currentBal.toFixed(2)}`, 'error'); return; }
  if (!wallet) { toast('Please provide your payout wallet or account details', 'error'); return; }

  const btn = document.getElementById('btn-submit-cpr');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

  try {
    const res = await apiFetch('/api/payout-requests', {
      method: 'POST',
      body: JSON.stringify({
        amount: amt,
        currency: 'USD',
        method,
        wallet,
        notes,
        role: 'Client',
        client_id: CLIENT_ID
      })
    });
    if (res && (res.id || res.success)) {
      closeModal();
      toast('Payout request submitted successfully', 'success');
      pgClientPaymentRequests();
    } else {
      toast(res?.error || 'Failed to submit payout request', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Submit Request'; }
    }
  } catch (err) {
    toast(err.message || 'Error submitting payout request', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Submit Request'; }
  }
};

async function pgClientPaymentRequestsLoad() {
  const body = document.getElementById('cpr-body');
  if (!body) return;
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;
  const list = zyList(await apiFetch(`/api/payout-requests?client_id=${CLIENT_ID}&limit=200`));
  const rows = list.map(r => {
    const ts = r.timestamp || r.created || r.created_at || r.date;
    const isPaid = (r.status || '').toLowerCase() === 'paid';
    const isRejected = (r.status || '').toLowerCase() === 'rejected';
    const statusClass = isPaid ? 'status-active' : (isRejected ? 'status-inactive' : 'status-pending');
    const statusLabel = (r.status || 'Pending').toUpperCase();

    return [
      (ts || '').replace('T', ' ').slice(0, 19),
      r.method || r.mode || 'USDT TRC20',
      `$${Number(r.amount || 0).toFixed(2)}`,
      { v: r.status || 'Pending', h: `<span class="badge ${statusClass}">${statusLabel}</span>` },
      r.wallet || r.address || '—',
      isPaid ? `$${Number(r.paid_amount || r.amount || 0).toFixed(2)}` : '—',
      r.txid || r.transaction_id || '—',
      r.notes || r.remarks || '—',
      r.updated_at ? zyDateOnly(r.updated_at) : (r.paid_at ? zyDateOnly(r.paid_at) : (isPaid ? 'Paid' : '—'))
    ];
  });
  body.innerHTML = zyDT2('dt-cpr', {
    cols: ['Date', 'Mode', 'Amount', 'Status', 'Address', 'Paid', 'Transaction', 'Remarks', 'Updated On'],
    rows,
    sort: 0,
    dir: -1
  });
  zy2Render('dt-cpr');
}

/* ═══ CLIENT NOTIFICATIONS (Logic Removed — awaiting new user specification) ═══ */
async function pgClientNotifications() {
  const c = document.getElementById('page-content');
  zyCrumb(['Notifications']);
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title"><i class="fas fa-bell" style="color:#2563eb;"></i> Notifications</div>
        <div class="page-subtitle">System notifications and important updates.</div>
      </div>
    </div>
    <div class="card zy-panel" style="margin-top:10px;">
      <div class="card-body zy-panel-body" style="text-align:center;padding:70px 20px;color:var(--sp-text-muted,#64748b);">
        <div style="width:56px;height:56px;border-radius:50%;background:#f1f5f9;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
          <i class="fas fa-bell-slash" style="font-size:24px;color:#94a3b8;"></i>
        </div>
        <div style="font-size:16px;font-weight:700;color:var(--sp-text,#1e293b);margin-bottom:6px;">Notification Logic Removed</div>
        <p style="font-size:13px;max-width:440px;margin:0 auto;line-height:1.5;color:#64748b;">
          Purani notification logic remove kar di gayi hai. Nayi notification logic define hone par yahan activate ho jayegi.
        </p>
      </div>
    </div>`;
}

async function pgClientNotificationsLoad() {}
window.zyClientMarkSingleRead = async function() {};
window.zyClientMarkAllRead = async function() {};
window.zyClientWipeNotifications = async function() {};

/* ── router ─────────────────────────────────────────────────── */
(function zyHookClientPages() {
  const map = {
    'dashboard': () => pgDashboard(),
    'access-search': pgAccessSearch,
    'my-numbers': pgMyNumbers,
    'sms-overview': pgSmsRanges,
    'sms-ranges': pgSmsRanges,
    'sms-ratecard': pgSmsRanges,
    'payout-rates-view': pgSmsRanges,
    'my-sms': pgMySms,
    'sms-test-panel': pgSmsTestPanel,
    'my-earnings': pgClientCreditNotes,
    'payout-requests': pgClientPaymentRequests,
    'my-balance': pgClientPaymentRequests,
    'news': pgClientNotifications,
    'notifications': pgClientNotifications
  };
  const prev = loadPage;
  loadPage = function (page) {
    if (map[page]) {
      document.getElementById('zy-user-menu')?.classList.remove('open');
      if (window.innerWidth < 992) document.getElementById('zy-mega')?.classList.remove('open');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.getElementById('nav-' + page)?.classList.add('active');
      const bc = document.getElementById('breadcrumb');
      if (bc && typeof ZY_LABELS !== 'undefined') bc.textContent = ZY_LABELS[page] || bc.textContent || page;
      if (window.zyCloseSidebar) window.zyCloseSidebar();
      window.scrollTo({ top: 0 });
      try { sessionStorage.setItem('client_current_page', page); } catch (e) {}
      map[page]();
      return;
    }
    prev(page);
    if (window.zyCloseSidebar) window.zyCloseSidebar();
  };
})();
