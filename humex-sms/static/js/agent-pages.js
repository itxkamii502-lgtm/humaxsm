/* ═══════════════════════════════════════════════════════════════
   𝑴𝑨𝑰𝑻 𝑺𝑴𝑺 — AGENT pages. Requires speed-kit.js
   ═══════════════════════════════════════════════════════════════ */

let ZY_RANGES = [], ZY_CLIENTS = [], ZY_NUMROWS = [], ZY_TESTNUMS = [];

async function zyFillClients(selectId, label) {
  const res = await apiFetch(`/api/clients?agent_id=${AGENT_ID}&limit=200`);
  ZY_CLIENTS = zyList(res);
  const el = document.getElementById(selectId);
  if (el) el.innerHTML = `<option value="">${label || 'Filter Client'}</option>` +
    ZY_CLIENTS.map(c => `<option value="${c.id}">${zyEsc(c.username)}</option>`).join('');
  return ZY_CLIENTS;
}
const zyClientName = id => (ZY_CLIENTS.find(c => String(c.id) === String(id)) || {}).username || '';
const zyNA = v => (v === '' || v == null) ? '<span class="zy-na">NA</span>' : v;

/* ═══ 1. SMS RANGES & RATECARD MASTER CATALOG ═════════════════════════ */
let ZY_AGENT_RANGE_LIST = [];

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
    </div>
    <div id="agt-range-kpis" style="margin-bottom:16px;"><div class="zy-loading">Loading metric summaries…</div></div>
    <div class="apx-card" style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      <div class="apx-card-header" style="height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:#f8fafc;border-bottom:1px solid #cbd5e1;">
        <span style="font-weight:700;font-size:13px;color:#1e293b;">
          <i class="fas fa-table-list" style="color:#0ea5e9;margin-right:6px;"></i> Termination Ranges &amp; Payterm Rates
        </span>
        <div style="display:flex;gap:6px;align-items:center;">
          <span id="agt-mode-badge" class="badge badge-admin-managed" style="font-size:10.5px;padding:2px 8px;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;border-radius:4px;">Loading Policy…</span>
        </div>
      </div>
      <div class="apx-card-body" id="agt-ranges-table-host" style="padding:14px;"><div class="zy-loading">Loading termination ranges…</div></div>
    </div>`;

  try {
    const [rangesRes, myNumsRes, policy] = await Promise.all([
      apiFetch('/api/numbers/sms-ranges').catch(() => []),
      apiFetch(`/api/numbers?agent_id=${AGENT_ID}&limit=100000`).catch(() => ({ total: 0, data: [] })),
      typeof zyFetchAllocPolicy === 'function' ? zyFetchAllocPolicy() : Promise.resolve({ mode: 'request' })
    ]);

    const list = zyList(rangesRes);
    const myNums = zyList(myNumsRes);
    const heldNumbersCount = myNums.length || ((myNumsRes && typeof myNumsRes.total === 'number') ? myNumsRes.total : 0);
    ZY_AGENT_RANGE_LIST = list;
    window._zyAgtPolicy = policy || { mode: 'request' };
    const isSelfAlloc = window._zyAgtPolicy.mode === 'self_allocate';
    const modeBadge = document.getElementById('agt-mode-badge');
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

    const kpiEl = document.getElementById('agt-range-kpis');
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
            <div style="font-size:11px;color:#64748b;margin-top:2px;">Active Numbers in Account</div>
          </div>
          <div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:8px;padding:10px 14px;box-shadow:0 1px 2px rgba(0,0,0,0.03);">
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Avg Weekly Rate</div>
            <div style="font-size:20px;font-weight:800;color:#059669;margin-top:2px;">$${avgWeekly}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;">7/1 Payterm Standard</div>
          </div>
          <div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:8px;padding:10px 14px;box-shadow:0 1px 2px rgba(0,0,0,0.03);">
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Avg Monthly Rate</div>
            <div style="font-size:20px;font-weight:800;color:#7c3aed;margin-top:2px;">$${avgMonthly}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;">30/30 Payterm Standard</div>
          </div>
        </div>`;
    }

    const rows = list.map((r, i) => {
      const rName = r.range_name || r.name || r.country || '—';
      const pts = r.payterms || {};
      const weeklyRate = pts['Weekly'] !== undefined ? pts['Weekly'] : (pts['7/1'] !== undefined ? pts['7/1'] : (r.payout ?? 0.01));
      const monthlyRate = pts['Monthly'] !== undefined ? pts['Monthly'] : (pts['30/30'] !== undefined ? pts['30/30'] : (pts['Monthly60'] ?? (pts['15/15'] ?? weeklyRate)));
      const curr = r.currency || 'USD';
      const currSym = curr === 'EUR' ? '€' : (curr === 'GBP' ? '£' : '$');
      const clis = r.cli_list || (Array.isArray(r.clis) && r.clis.length ? r.clis.join(', ') : (r.cli || 'All CLIs'));
      const heldCount = myNums.filter(n => {
        const nr = n.range_name || n.name || n.country || '';
        return nr.toLowerCase() === rName.toLowerCase();
      }).length;
      const roomCount = Math.max(0, (r.available != null ? r.available : (r.free_count ?? 1500)));

      return [
        i + 1,
        zyEsc(r.provider || 'Direct'),
        `<strong style="color:#0f172a;">${zyEsc(rName)}</strong>`,
        `<span class="monospace" style="font-weight:700;color:#2563eb;">${zyEsc(r.prefix || '—')}</span>`,
        { v: r.active === false ? '' : 'yes', h: zyTick(r.active !== false) },
        `<span style="font-weight:700;">${zyEsc(curr)}</span>`,
        `<span class="badge badge-purple" style="font-size:10.5px;">${zyEsc(r.payterm || 'Weekly')}</span>`,
        `<span style="font-family:monospace;font-weight:700;color:#16a34a;">${currSym} ${Number(weeklyRate).toFixed(4)}</span>`,
        `<span style="font-family:monospace;font-weight:700;color:#9333ea;">${currSym} ${Number(monthlyRate).toFixed(4)}</span>`,
        `<span style="font-family:monospace;font-size:11.5px;"><b>${heldCount}</b> / <span style="color:#10b981;font-weight:700;">${roomCount.toLocaleString()}</span></span>`,
        { v: '', h: `<div style="display:inline-flex;align-items:center;gap:4px;">
          <button type="button" class="apx-btn apx-btn-icon apx-btn-small" style="color:#0284c7;border-color:#bae6fd;background:#f0f9ff;" onclick="zyViewAgentRange(${i})" title="View Details"><i class="fas fa-eye"></i></button>
          ${isSelfAlloc
            ? `<button type="button" class="apx-btn apx-btn-small" style="color:#059669;border-color:#a7f3d0;background:#ecfdf5;" onclick="zyOpenSelfAllocateModal('${zyEsc(rName)}', ${r.id || 'null'}, window._zyAgtPolicy, pgSmsRanges)" title="Self-Allocate Numbers"><i class="fas fa-bolt"></i> Self-Allocate</button>`
            : `<button type="button" class="apx-btn apx-btn-small" style="color:#2563eb;border-color:#bfdbfe;background:#eff6ff;" onclick="zyOpenRequestNumbersModal('${zyEsc(rName)}', ${r.id || 'null'}, window._zyAgtPolicy, pgSmsRanges)" title="Request Numbers"><i class="fas fa-phone-volume"></i> Request</button>`}
        </div>` }
      ];
    });

    const host = document.getElementById('agt-ranges-table-host');
    if (host) {
      host.innerHTML = zyDT2('dt-ranges', {
        cols: ['#', 'Provider', 'Name', 'Prefix', 'Active', 'Currency', 'Payterm', 'Weekly (7/1)', 'Monthly (30/30)', 'Held / Room', 'Actions'],
        rows
      });
      zy2Render('dt-ranges');
    }
  } catch (err) {
    console.error('Failed to load ranges:', err);
    const host = document.getElementById('agt-ranges-table-host');
    if (host) host.innerHTML = `<div class="text-danger" style="padding:20px;text-align:center;">Failed to load SMS Ranges: ${zyEsc(err.message || 'Network error')}</div>`;
  }
}

/* 3-Column Range Specification Modal matching Owner/Manager */
function zyViewAgentRange(i) {
  const r = ZY_AGENT_RANGE_LIST[i] || {};
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

      <!-- Col 3: Payterm Rates -->
      <div style="background:#f8fafc;padding:12px;border:1px solid #cbd5e1;border-radius:6px;">
        <h5 style="margin:0 0 10px 0;font-size:12px;font-weight:700;text-transform:uppercase;color:#1e293b;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">
          <i class="fas fa-coins" style="color:#d97706;margin-right:4px;"></i> Payterms Rate Card
        </h5>
        <table style="width:100%;font-size:11.5px;border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:1px solid #cbd5e1;text-align:left;color:#64748b;">
              <th style="padding:3px 0;">Schedule</th>
              <th style="padding:3px 0;text-align:right;">Payout Rate</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px dashed #e2e8f0;"><td style="padding:4px 0;">Daily (1/1)</td><td style="text-align:right;font-weight:700;color:#0284c7;font-family:monospace;">${currSym} ${Number(dailyVal).toFixed(4)}</td></tr>
            <tr style="border-bottom:1px dashed #e2e8f0;"><td style="padding:4px 0;">Weekly (7/1)</td><td style="text-align:right;font-weight:700;color:#16a34a;font-family:monospace;">${currSym} ${Number(weeklyVal).toFixed(4)}</td></tr>
            <tr style="border-bottom:1px dashed #e2e8f0;"><td style="padding:4px 0;">7/7</td><td style="text-align:right;font-weight:700;color:#059669;font-family:monospace;">${currSym} ${Number(pts['7/7'] ?? weeklyVal).toFixed(4)}</td></tr>
            <tr style="border-bottom:1px dashed #e2e8f0;"><td style="padding:4px 0;">15/15</td><td style="text-align:right;font-weight:700;color:#d97706;font-family:monospace;">${currSym} ${Number(biweekly15).toFixed(4)}</td></tr>
            <tr style="border-bottom:1px dashed #e2e8f0;"><td style="padding:4px 0;">15/30</td><td style="text-align:right;font-weight:700;color:#b45309;font-family:monospace;">${currSym} ${Number(biweekly30).toFixed(4)}</td></tr>
            <tr style="border-bottom:1px dashed #e2e8f0;"><td style="padding:4px 0;">Monthly (30/30)</td><td style="text-align:right;font-weight:700;color:#9333ea;font-family:monospace;">${currSym} ${Number(monthlyVal).toFixed(4)}</td></tr>
            <tr><td style="padding:4px 0;">Monthly60</td><td style="text-align:right;font-weight:700;color:#7c3aed;font-family:monospace;">${currSym} ${Number(monthly60).toFixed(4)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     ${(window._zyAgtPolicy && window._zyAgtPolicy.mode === 'self_allocate')
       ? `<button class="zy-btn-blue" onclick="closeModal();zyOpenSelfAllocateModal('${zyEsc(rName)}', ${r.id || 'null'}, window._zyAgtPolicy, pgSmsRanges)"><i class="fas fa-bolt"></i> Self-Allocate Numbers</button>`
       : `<button class="zy-btn-blue" onclick="closeModal();zyOpenRequestNumbersModal('${zyEsc(rName)}', ${r.id || 'null'}, window._zyAgtPolicy, pgSmsRanges)"><i class="fas fa-phone-volume"></i> Request Numbers</button>`}`);
}

async function pgRateCard() {
  await pgSmsRanges();
}

/* ═══ MY SMS NUMBERS ════════════════════════════════════════ */
let ZY_ALL_NUMS = [];
let ZY_RANGES_LOOKUP = {};

async function pgMySmsNumbers() {
  const c = document.getElementById('page-content');
  zyCrumb(['SMS Module', 'My SMS Numbers']);
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title"><i class="fas fa-hashtag" style="color:#2563eb;"></i> My SMS Numbers</div>
        <div class="page-subtitle">Numbers assigned to your account. Allocate to clients, return to pool or move. (SD: Daily, SW: Weekly)</div>
      </div>
    </div>

    <!-- Video-Accurate My SMS Numbers Filter & Action Card (Frame 02) -->
    <div class="zy-num-card zy-filter-grid card" style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:10px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      <div class="zy-filter-grid-fields" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;align-items:flex-end;">
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="num-range" style="font-size:11.5px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;display:block;">Range</label>
          <select id="num-range" class="zy-filter-input" style="width:100%;height:38px;min-height:38px;border-radius:6px;border:1.5px solid #cbd5e1;padding:0 10px;font-size:13px;background:#ffffff;box-sizing:border-box;" onchange="zyApplyFilters()">
            <option value="">All Ranges</option>
          </select>
        </div>
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="num-client" style="font-size:11.5px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;display:block;">Client</label>
          <select id="num-client" class="zy-filter-input" style="width:100%;height:38px;min-height:38px;border-radius:6px;border:1.5px solid #cbd5e1;padding:0 10px;font-size:13px;background:#ffffff;box-sizing:border-box;" onchange="zyApplyFilters()">
            <option value="">All</option>
          </select>
        </div>
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="num-status" style="font-size:11.5px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;display:block;">Status</label>
          <select id="num-status" class="zy-filter-input" style="width:100%;height:38px;min-height:38px;border-radius:6px;border:1.5px solid #cbd5e1;padding:0 10px;font-size:13px;background:#ffffff;box-sizing:border-box;" onchange="zyApplyFilters()">
            <option value="">All</option>
            <option value="assigned">Assigned</option>
            <option value="unassigned">Unassigned</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="num-starts-with" style="font-size:11.5px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;display:block;">Number starts with</label>
          <input type="text" id="num-starts-with" class="zy-filter-input" placeholder="Number starts with..." style="width:100%;height:38px;min-height:38px;border-radius:6px;border:1.5px solid #cbd5e1;padding:0 10px;font-size:13px;background:#ffffff;box-sizing:border-box;" oninput="zyApplyFilters()">
        </div>
        <div class="zy-filter-field" style="grid-column: 1 / -1; display: none;">
          <input type="text" id="num-range-contains" class="zy-filter-input" placeholder="Range contains..." oninput="zyApplyFilters()">
        </div>
      </div>

      <div class="zy-filter-actions" style="margin-top:14px;margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <button type="button" class="zy-btn-blue-solid" style="height:38px;padding:0 20px;font-size:12.5px;font-weight:700;border-radius:6px;display:inline-flex;align-items:center;gap:6px;" onclick="zyApplyFilters()">
          <i class="fas fa-filter"></i> Filter
        </button>
        <button type="button" class="zy-btn-amber" style="height:38px;padding:0 18px;font-size:12.5px;font-weight:700;border-radius:6px;background:#64748b;border-color:#475569;display:inline-flex;align-items:center;gap:6px;" onclick="zyResetFilters()">
          <i class="fas fa-undo"></i> Reset
        </button>
      </div>

      <div class="zy-num-row-2">
        <button type="button" id="btn-act-allocate" class="zy-btn-allocate-light" onclick="zyActionAllocate()">
          <i class="fas fa-user-plus"></i> <span id="lbl-act-allocate">Allocate</span>
        </button>
        <button type="button" id="btn-act-unallocate" class="zy-btn-unallocate-light" onclick="zyActionUnallocate()">
          <i class="fas fa-rotate-left"></i> <span id="lbl-act-unallocate">Unallocate</span>
        </button>
      </div>

      <div class="zy-num-row-full">
        <button type="button" id="btn-act-return" class="zy-btn-return-light" onclick="zyActionReturn()">
          <i class="fas fa-arrow-up"></i> <span id="lbl-act-return">Return</span>
        </button>
      </div>
    </div>

    <!-- Table Panel with Toolbar matching Frame 02 -->
    <div class="zy-panel" style="border:1px solid #cbd5e1;border-radius:4px;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <div class="zy-panel-head" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#f8fafc;border-bottom:1px solid #cbd5e1;">
        <span style="font-weight:700;font-size:14px;color:#1e293b;">My SMS Numbers</span>
        <div style="display:flex;align-items:center;gap:6px;">
          <button class="zy-act zy-act-blue zy-act-wide" onclick="zyActionMove()" title="Move number directly from Client A to Client B"><i class="fas fa-right-left" style="margin-right:4px;"></i> Move</button>
        </div>
      </div>
      <div class="zy-panel-body" style="padding:14px;"><div class="zy-loading">Loading numbers…</div></div>
    </div>
    ${typeof zyRenderFab === 'function' ? zyRenderFab('Need numbers? Tap here', 'zyActionAllocate()') : ''}`;


  const [nums, ranges, clientsRes] = await Promise.all([
    apiFetch(`/api/numbers?agent_id=${AGENT_ID}&limit=100000`),
    apiFetch('/api/numbers/sms-ranges').catch(() => []),
    apiFetch(`/api/clients?agent_id=${AGENT_ID}&limit=500`).catch(() => ({ data: [] }))
  ]);

  ZY_ALL_NUMS = zyList(nums);
  ZY_RANGES = zyList(ranges);
  ZY_CLIENTS = zyList(clientsRes);

  ZY_RANGES_LOOKUP = {};
  ZY_RANGES.forEach(r => {
    if (r.id) ZY_RANGES_LOOKUP[r.id] = r;
    if (r.range_name) ZY_RANGES_LOOKUP[r.range_name] = r;
    if (r.name) ZY_RANGES_LOOKUP[r.name] = r;
    if (r.country && r.provider) ZY_RANGES_LOOKUP[`${r.country}|${r.provider}`] = r;
  });

  // Populate Range dropdown
  const rangeSel = document.getElementById('num-range');
  if (rangeSel) {
    const uniqueRanges = [];
    const seenR = new Set();
    ZY_ALL_NUMS.forEach(n => {
      const rName = n.range_name || n.range_label || n.range || n.country || '';
      if (rName && !seenR.has(rName)) {
        seenR.add(rName);
        uniqueRanges.push({ id: n.range_id || rName, name: rName });
      }
    });
    rangeSel.innerHTML = '<option value="">All Ranges</option>' +
      uniqueRanges.map(r => `<option value="${zyEsc(r.name)}">${zyEsc(r.name)}</option>`).join('');
  }

  // Populate Client dropdown
  const clientSel = document.getElementById('num-client');
  if (clientSel) {
    clientSel.innerHTML = '<option value="">All Clients</option>' +
      ZY_CLIENTS.map(cl => `<option value="${cl.id}">${zyEsc(cl.username)}</option>`).join('');
  }

  zyRenderNumbersTable(ZY_ALL_NUMS);
}

function zyGetRangeForNumber(n) {
  if (n.range_id && ZY_RANGES_LOOKUP[n.range_id]) return ZY_RANGES_LOOKUP[n.range_id];
  const rName = n.range_name || n.range_label || n.range;
  if (rName && ZY_RANGES_LOOKUP[rName]) return ZY_RANGES_LOOKUP[rName];
  if (n.country && n.provider && ZY_RANGES_LOOKUP[`${n.country}|${n.provider}`]) return ZY_RANGES_LOOKUP[`${n.country}|${n.provider}`];
  return null;
}

function zyGetAgentRateForNumber(n) {
  if (n.agent_rate !== undefined && n.agent_rate !== null && !isNaN(Number(n.agent_rate)) && Number(n.agent_rate) > 0) {
    return Number(n.agent_rate);
  }
  const r = zyGetRangeForNumber(n);
  if (r) {
    const term = n.payterm || n.agent_payterm || 'Weekly';
    const pts = r.payterms || {};
    if (pts[term] !== undefined && !isNaN(Number(pts[term]))) return Number(pts[term]);
    if (pts['Weekly'] !== undefined && !isNaN(Number(pts['Weekly']))) return Number(pts['Weekly']);
    if (r.payout !== undefined && !isNaN(Number(r.payout))) return Number(r.payout);
    if (r.sell_rate !== undefined && !isNaN(Number(r.sell_rate))) return Number(r.sell_rate);
  }
  if (n.payout !== undefined && n.payout !== null && !isNaN(Number(n.payout))) return Number(n.payout);
  return 0;
}

window.zySyncSelectionBar = function(id) {
  if (id === 'dt-numbers') {
    const n = (typeof zy2Checked === 'function' ? zy2Checked('dt-numbers') : []).length;
    const l1 = document.getElementById('lbl-act-allocate');
    const l2 = document.getElementById('lbl-act-unallocate');
    const l3 = document.getElementById('lbl-act-return');
    if (l1) l1.textContent = n > 0 ? `Allocate (${n})` : 'Allocate';
    if (l2) l2.textContent = n > 0 ? `Unallocate (${n})` : 'Unallocate';
    if (l3) l3.textContent = n > 0 ? `Return (${n})` : 'Return';
  }
};

function zyRenderNumbersTable(numsList) {
  const c = document.getElementById('page-content');
  if (!c) return;

  const rows = (numsList || []).map(n => {
    const rangeName = n.range_name || n.range_label || n.range || n.country || '—';
    const agentRate = zyGetAgentRateForNumber(n);
    const clientName = zyClientName(n.client_id) || n.client_username || n.client_name || n.user || (n.client_id ? `Client #${n.client_id}` : '');
    const clientPayoutVal = (n.client_rate !== undefined && n.client_rate !== null) ? n.client_rate : (n.client_payout ?? '');
    const clientPayoutDisplay = clientPayoutVal !== '' ? `$${Number(clientPayoutVal).toFixed(4)}` : zyNA('');
    const rawTerm = String(n.payterm || n.agent_payterm || n.client_payterm || 'Weekly');
    const isM = ['monthly', '30/30', 'monthly60', '15/15', '15/30', '30/1'].includes(rawTerm.toLowerCase());
    const planDisplay = `<span class="badge ${isM ? 'badge-purple' : 'badge-blue'}" style="font-weight:700;">${isM ? 'Monthly (30/30)' : 'Weekly (7/1)'}</span>`;
    const statusDisplay = `<span style="display:inline-flex;align-items:center;gap:4px;color:#10b981;font-weight:600;"><i class="fas fa-check-circle" style="color:#10b981;"></i> Active</span>`;

    const copyBtn = `<button type="button" class="zy-num-copy-btn" onclick="event.stopPropagation();window.zyCopyNumber('${zyEsc(n.number || '')}', this)" title="Copy number" style="background:none;border:none;cursor:pointer;padding:2px 4px;font-size:12px;color:#94a3b8;border-radius:3px;transition:all 0.15s ease;" onmouseover="this.style.color='#10b981'" onmouseout="this.style.color='#94a3b8'"><i class="far fa-copy"></i></button>`;
    const numberHtml = `<span style="display:inline-flex;align-items:center;gap:6px;"><span style="font-family:monospace;font-weight:600;color:var(--brand-primary,#166534);">${zyEsc(n.number || '')}</span>${copyBtn}</span>`;

    const r = [
      { v: rangeName, h: `<span style="font-weight:600;">${zyEsc(rangeName)}</span>` },
      { v: n.prefix || '', h: n.prefix || '—' },
      { v: n.number || '', h: numberHtml },
      { v: agentRate, h: `<span style="font-weight:700;color:var(--brand-accent,#4ade80);">$${agentRate.toFixed(4)}</span>` },
      { v: clientName, h: clientName ? `<span class="badge badge-green">${zyEsc(clientName)}</span>` : '<span class="text-muted" style="font-size:11px;font-style:italic;">Pool (Unallocated)</span>' },
      { v: clientPayoutVal !== '' ? Number(clientPayoutVal) : 0, h: clientPayoutDisplay },
      { v: n.payterm || '7/1', h: planDisplay },
      { v: (n.sms_daily || 0) + (n.sms_weekly || 0), h: limitsDisplay },
      { v: n.status || 'active', h: statusDisplay }
    ];
    r.__id = n.id;
    r.__raw = n;
    return r;
  });

  ZY_NUMROWS = rows;
  const body = c.querySelector('.zy-panel-body');
  if (body) {
    body.innerHTML = zyDT2('dt-numbers', {
      cols: ['Range', 'Prefix', 'Number', 'My Payout', 'Client', 'Client payout', 'Plan', 'Limits', 'Status'],
      rows,
      check: true
    });
    zy2Render('dt-numbers');
    if (typeof window.zySyncSelectionBar === 'function') window.zySyncSelectionBar('dt-numbers');
  }
}

function zyApplyFilters() {
  const rVal = (document.getElementById('num-range')?.value || '').toLowerCase();
  const cVal = document.getElementById('num-client')?.value || '';
  const sVal = document.getElementById('num-status')?.value || '';
  const startsWith = (document.getElementById('num-starts-with')?.value || '').trim();
  const rangeContains = (document.getElementById('num-range-contains')?.value || '').toLowerCase().trim();

  const filtered = ZY_ALL_NUMS.filter(n => {
    if (rVal) {
      const rName = (n.range_name || n.range_label || n.range || n.country || '').toLowerCase();
      if (!rName.includes(rVal)) return false;
    }
    if (rangeContains) {
      const rName = (n.range_name || n.range_label || n.range || n.country || '').toLowerCase();
      if (!rName.includes(rangeContains)) return false;
    }
    if (startsWith) {
      const numStr = String(n.number || '');
      if (!numStr.startsWith(startsWith)) return false;
    }
    if (cVal) {
      if (String(n.client_id) !== String(cVal)) return false;
    }
    if (sVal) {
      if (sVal === 'assigned' && !n.client_id) return false;
      if (sVal === 'unassigned' && n.client_id) return false;
      if (sVal === 'active' && n.status !== 'active') return false;
      if (sVal === 'inactive' && n.status !== 'inactive') return false;
    }
    return true;
  });

  zyRenderNumbersTable(filtered);
}

function zyResetFilters() {
  const r = document.getElementById('num-range'); if (r) r.value = '';
  const cl = document.getElementById('num-client'); if (cl) cl.value = '';
  const st = document.getElementById('num-status'); if (st) st.value = '';
  const sw = document.getElementById('num-starts-with'); if (sw) sw.value = '';
  const rc = document.getElementById('num-range-contains'); if (rc) rc.value = '';
  zyRenderNumbersTable(ZY_ALL_NUMS);
}

function zyGetSelectedNumbers() {
  const ids = zy2Checked('dt-numbers');
  const t = ZYT2['dt-numbers'];
  if (!t || !ids.length) return [];
  const idSet = new Set(ids.map(String));
  return t.rows.filter(r => idSet.has(String(r.__id))).map(r => r.__raw);
}

// ── BUTTON 1: ALLOCATE (select numbers -> client, client payterm, client rate prefilled & capped) ──
function zyActionAllocate() {
  const selected = zyGetSelectedNumbers();
  if (!selected.length) {
    toast('Select at least one number to Allocate', 'warning');
    return;
  }
  if (!ZY_CLIENTS.length) {
    toast('No clients found. Create a client first.', 'error');
    return;
  }

  const ids = selected.map(n => n.id);
  const sampleNum = selected[0];
  const initialAgentRate = zyGetAgentRateForNumber(sampleNum);
  const range = zyGetRangeForNumber(sampleNum) || {};
  const rPts = range.payterms || {};

  window._allocSelectedNums = selected;
  window._allocRangePayterms = rPts;

  zyModal('Allocate Numbers to Client', `
    <div style="background:#f3f4f6;padding:10px 12px;border-radius:6px;margin-bottom:12px;font-size:12px;">
      <div><strong>Selected:</strong> ${selected.length} number(s) (${selected.slice(0, 3).map(n => n.number).join(', ')}${selected.length > 3 ? '...' : ''})</div>
      <div><strong>Range:</strong> ${range.range_name || sampleNum.country || '—'}</div>
      <div><strong>My Payout (Agent Rate):</strong> <span id="alloc-agent-rate-val" style="color:#166534;font-weight:700;">$${initialAgentRate.toFixed(4)}</span></div>
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label class="zy-lbl" style="font-weight:600;">Target Client *</label>
      <select id="alloc-client-id" class="zy-input" style="width:100%;height:34px;">
        <option value="">— Select Client —</option>
        ${ZY_CLIENTS.map(c => `<option value="${c.id}">${zyEsc(c.username)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label class="zy-lbl" style="font-weight:600;">Client Payterm (client_payterm) *</label>
      <select id="alloc-client-payterm" class="zy-input" style="width:100%;height:34px;" onchange="zyOnAllocPaytermChange()">
        <option value="Weekly" selected>Weekly (7/1)</option>
        <option value="Monthly">Monthly (30/30)</option>
        <option value="7/7">7/7</option>
        <option value="15/15">15/15</option>
        <option value="15/30">15/30</option>
        <option value="Monthly60">Monthly60</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label class="zy-lbl" style="font-weight:600;">Client Rate (client_rate) *</label>
      <input type="number" id="alloc-client-rate" class="zy-input" step="0.0001" value="${initialAgentRate}" style="width:100%;height:34px;" required>
      <small class="text-muted" style="display:block;margin-top:4px;font-size:11px;">
        Prefilled from Rate Card. Capped at your Agent Rate (<span id="alloc-cap-hint">$${initialAgentRate.toFixed(4)}</span>). Server refuses rates exceeding your payout.
      </small>
    </div>
  `, `
    <button class="zy-btn-grey" onclick="closeModal()">Cancel</button>
    <button class="zy-btn-blue" id="btn-do-allocate" onclick="zySubmitAllocate()"><i class="fas fa-check"></i> Allocate</button>
  `);
}

function zyOnAllocPaytermChange() {
  const term = document.getElementById('alloc-client-payterm')?.value || 'Weekly';
  const rPts = window._allocRangePayterms || {};
  const selected = window._allocSelectedNums || [];
  const sample = selected[0] || {};

  let agentRate = (sample.agent_rate !== undefined && sample.agent_rate !== null && Number(sample.agent_rate) > 0)
    ? Number(sample.agent_rate)
    : null;

  if (!agentRate) {
    if (rPts[term] !== undefined && !isNaN(Number(rPts[term]))) {
      agentRate = Number(rPts[term]);
    } else if (rPts['Weekly'] !== undefined && !isNaN(Number(rPts['Weekly']))) {
      agentRate = Number(rPts['Weekly']);
    } else {
      agentRate = 0;
    }
  }

  const rateEl = document.getElementById('alloc-agent-rate-val');
  const capHint = document.getElementById('alloc-cap-hint');
  const input = document.getElementById('alloc-client-rate');
  if (rateEl) rateEl.textContent = `$${agentRate.toFixed(4)}`;
  if (capHint) capHint.textContent = `$${agentRate.toFixed(4)}`;
  if (input) input.value = agentRate;
}

async function zySubmitAllocate() {
  const clientId = document.getElementById('alloc-client-id')?.value;
  const clientPayterm = document.getElementById('alloc-client-payterm')?.value || 'Weekly';
  const clientRate = parseFloat(document.getElementById('alloc-client-rate')?.value);
  const selected = window._allocSelectedNums || [];

  if (!clientId) { toast('Please select a client', 'error'); return; }
  if (isNaN(clientRate) || clientRate < 0) { toast('Enter a valid client rate', 'error'); return; }
  if (!selected.length) { toast('No numbers selected', 'error'); return; }

  const btn = document.getElementById('btn-do-allocate');
  if (btn) { btn.disabled = true; btn.textContent = 'Allocating...'; }

  const numberIds = selected.map(n => n.id);
  try {
    const res = await apiFetch('/api/numbers/bulk-assign-many', {
      method: 'POST',
      body: JSON.stringify({
        number_ids: numberIds,
        target_type: 'client',
        target_id: Number(clientId),
        client_id: Number(clientId),
        client_payterm: clientPayterm,
        payterm: clientPayterm,
        client_rate: clientRate,
        client_payout: clientRate
      })
    });

    if (res && (res.success || res.updated || res.count !== undefined)) {
      closeModal();
      toast(`Successfully allocated ${numberIds.length} number(s) to client`, 'success');
      loadPage('my-sms-numbers');
    } else {
      const errMsg = res?.error || res?.message || 'Server refused allocation';
      toast(errMsg, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Allocate'; }
    }
  } catch (err) {
    console.error('Allocate error:', err);
    toast(err.message || 'Allocation rejected', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Allocate'; }
  }
}

// ── BUTTON 2: UNALLOCATE (take back into agent pool) ──
async function zyActionUnallocate() {
  const selected = zyGetSelectedNumbers();
  if (!selected.length) {
    toast('Select at least one number to Unallocate', 'warning');
    return;
  }
  const assigned = selected.filter(n => n.client_id);
  if (!assigned.length) {
    toast('None of the selected numbers are currently allocated to a client', 'warning');
    return;
  }
  if (!confirm(`Unallocate ${assigned.length} number(s) back to your agent pool?`)) return;

  const ids = assigned.map(n => n.id);
  try {
    const res = await apiFetch('/api/numbers/bulk-unassign-many', {
      method: 'POST',
      body: JSON.stringify({ number_ids: ids })
    });
    if (res && res.error) {
      toast(res.error, 'error');
    } else {
      toast(`Unallocated ${assigned.length} number(s) back to pool`, 'success');
      loadPage('my-sms-numbers');
    }
  } catch (err) {
    toast(err.message || 'Failed to unallocate numbers', 'error');
  }
}

// ── BUTTON 3: RETURN (return to upstream holder, POST /api/numbers/return) ──
async function zyActionReturn() {
  const selected = zyGetSelectedNumbers();
  if (!selected.length) {
    toast('Select at least one number to Return', 'warning');
    return;
  }
  if (!confirm(`Return ${selected.length} number(s) to your upstream holder?`)) return;

  const ids = selected.map(n => n.id);
  try {
    const res = await apiFetch('/api/numbers/return', {
      method: 'POST',
      body: JSON.stringify({ number_ids: ids })
    });
    if (res && res.error) {
      toast(res.error, 'error');
    } else {
      toast(`Returned ${res?.count || selected.length} number(s) to upstream holder`, 'success');
      loadPage('my-sms-numbers');
    }
  } catch (err) {
    toast(err.message || 'Failed to return numbers', 'error');
  }
}

// ── BUTTON 4: MOVE (client A -> client B, POST /api/numbers/:id/move) ──
function zyActionMove() {
  const selected = zyGetSelectedNumbers();
  if (!selected.length) {
    toast('Select a number to Move', 'warning');
    return;
  }
  if (selected.length > 1) {
    toast('Please select exactly one number to Move between clients', 'info');
  }
  const targetNum = selected[0];
  if (!targetNum.client_id) {
    toast(`Number ${targetNum.number} is not assigned to any client yet. Use Allocate instead.`, 'warning');
    return;
  }
  const currentClient = ZY_CLIENTS.find(c => String(c.id) === String(targetNum.client_id));
  const currentName = currentClient?.username || targetNum.client_username || targetNum.client_name || targetNum.user || `Client #${targetNum.client_id}`;
  const otherClients = ZY_CLIENTS.filter(c => String(c.id) !== String(targetNum.client_id));

  if (!otherClients.length) {
    toast('No other clients available to move number to', 'warning');
    return;
  }

  zyModal('Move Number Between Clients', `
    <div style="background:#f3f4f6;padding:10px 12px;border-radius:6px;margin-bottom:12px;font-size:12px;">
      <div><strong>Number:</strong> <span style="font-family:monospace;font-weight:700;">${targetNum.number}</span></div>
      <div><strong>Current Holder:</strong> <span class="badge badge-green">${zyEsc(currentName)}</span></div>
      <div class="text-muted" style="margin-top:4px;">Moving preserves old client's SMS history while routing new SMS to the new client.</div>
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label class="zy-lbl" style="font-weight:600;">Destination Client *</label>
      <select id="move-dest-client" class="zy-input" style="width:100%;height:34px;">
        <option value="">— Select Destination Client —</option>
        ${otherClients.map(c => `<option value="${c.id}">${zyEsc(c.username)}</option>`).join('')}
      </select>
    </div>
  `, `
    <button class="zy-btn-grey" onclick="closeModal()">Cancel</button>
    <button class="zy-btn-blue" id="btn-do-move" onclick="zySubmitMove(${targetNum.id})"><i class="fas fa-right-left"></i> Move Number</button>
  `);
}

async function zySubmitMove(numberId) {
  const destClientId = document.getElementById('move-dest-client')?.value;
  if (!destClientId) { toast('Please select destination client', 'error'); return; }

  const btn = document.getElementById('btn-do-move');
  if (btn) { btn.disabled = true; btn.textContent = 'Moving...'; }

  try {
    const res = await apiFetch(`/api/numbers/${numberId}/move`, {
      method: 'POST',
      body: JSON.stringify({ to_client_id: Number(destClientId) })
    });

    if (res && (res.success || res.number || res.id)) {
      closeModal();
      toast('Number moved to new client successfully', 'success');
      loadPage('my-sms-numbers');
    } else {
      const errMsg = res?.error || res?.message || 'Move rejected by server';
      toast(errMsg, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Move Number'; }
    }
  } catch (err) {
    console.error('Move error:', err);
    toast(err.message || 'Failed to move number', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Move Number'; }
  }
}


/* ═══ SMS RATECARD ══════════════════════════════════════════ */
async function pgSmsRateCard() {
  const c = document.getElementById('page-content');
  zyCrumb(['SMS Module', 'SMS RateCard']);
  c.innerHTML = `<div class="zy-intro">Here you can export ratecard and send it to your clients by updating payouts.</div>
    <div class="zy-panel"><div class="zy-panel-head">SMS RateCard
      <button class="zy-act-export" onclick="zy2Export('dt-rate','csv')">${zyImg('btn_export')} Export</button></div>
    <div class="zy-panel-body"><div class="zy-loading">Loading…</div></div></div>`;
  const ranges = zyList(await apiFetch('/api/numbers/sms-ranges'));
  const rows = ranges.map(r => [
    r.range_name || r.name || r.country || '—', r.prefix || '', r.test_number || '',
    r.currency || 'USD',
    { v: r.payout ?? '', h: r.payout != null ? `$ ${r.payout}` : zyNA('') },
    { v: '', h: zyNA('') }, { v: '', h: zyNA('') }, { v: '', h: zyNA('') }, { v: '', h: zyNA('') }
  ]);
  c.querySelector('.zy-panel-body').innerHTML = zyDT2('dt-rate', {
    cols: ['Range', 'Prefix', 'Test Number', 'Currency', '7/1', '7/7', '15/15', '15/30', '30/30'], rows });
  zy2Render('dt-rate');
}

/* ═══ ACCESS / CLI SEARCH (AstraSMS-Style Realtime Route Inspector) ═══ */
let _agCliHours = 24;
let _agCliRoutes = [];

window.zySetAgCliTimeFilter = function(hours) {
  _agCliHours = hours;
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

  document.querySelectorAll('.zy-ag-cli-chip').forEach(btn => {
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
        <div class="page-subtitle" style="font-size:12.5px;color:#64748b;">Search active ranges, destination endpoints, and live messages running on your numbers</div>
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
          <button type="button" class="zy-ag-cli-chip" data-hours="${t.hours}" onclick="zySetAgCliTimeFilter(${t.hours})"
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
          <input class="zy-fb-input" id="cs-from" value="${defaultFrom}" style="width:100%;height:38px;padding:0 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;">
        </div>
        <div>
          <label style="display:block;font-size:11.5px;font-weight:700;color:#475569;margin-bottom:4px;">To Date</label>
          <input class="zy-fb-input" id="cs-to" value="${defaultTo}" style="width:100%;height:38px;padding:0 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;">
        </div>
        <div>
          <label style="display:block;font-size:11.5px;font-weight:700;color:#475569;margin-bottom:4px;">CLI / Sender</label>
          <input class="zy-fb-input" id="cs-cli" placeholder="Search CLI (e.g. Google, 447)" style="width:100%;height:38px;padding:0 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;" onkeyup="if(event.key==='Enter')pgAccessSearchLoad()">
        </div>
        <div>
          <label style="display:block;font-size:11.5px;font-weight:700;color:#475569;margin-bottom:4px;">Message Text</label>
          <input class="zy-fb-input" id="cs-text" placeholder="Content filter" style="width:100%;height:38px;padding:0 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;" onkeyup="if(event.key==='Enter')pgAccessSearchLoad()">
        </div>
        <div style="display:flex;gap:8px;">
          <button class="zy-btn-blue" onclick="pgAccessSearchLoad()" style="height:38px;padding:0 16px;flex:1;"><i class="fas fa-search"></i> Search</button>
          <button class="btn btn-outline btn-sm" onclick="document.getElementById('cs-cli').value='';document.getElementById('cs-text').value='';zySetAgCliTimeFilter(24);" style="height:38px;padding:0 12px;"><i class="fas fa-undo"></i></button>
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
  params.append('hours', _agCliHours);

  try {
    const res = await apiFetch(`/api/cli-search?${params.toString()}`);
    const routes = (res && res.routes) || [];
    _agCliRoutes = routes;

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
        `<button type="button" class="btn btn-outline btn-sm" onclick="zyAgentViewCliSms(${idx})" style="padding:3px 10px;font-size:11.5px;font-weight:600;">
           <i class="fas fa-eye"></i> View SMS (${g.count})
         </button>`
      ];
    });

    body.innerHTML = zyDT2('dt-ag-cli', {
      cols: ['Range / Country', 'CLI', 'SMS Count', 'Conversion', 'Last Seen', 'Actions'],
      rows,
      sort: 2,
      dir: -1
    });
    zy2Render('dt-ag-cli');
  } catch (err) {
    console.error('Agent CLI search error:', err);
    body.innerHTML = `<div style="padding:20px;text-align:center;color:#ef4444;">Failed to execute CLI search: ${escapeHtml(err.message)}</div>`;
  }
}

window.zyAgentViewCliSms = function(idx) {
  const r = _agCliRoutes[idx];
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

/* ═══ NEWS / NOTIFICATIONS (Logic Removed — awaiting new user specification) ═══ */
async function pgNewsClients() {
  const c = document.getElementById('page-content');
  zyCrumb(['System Master', 'Notifications']);
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title"><i class="fas fa-bell" style="color:#2563eb;"></i> Notifications</div>
        <div class="page-subtitle">System notifications and announcements.</div>
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

async function pgNewsLoad() {}
window.zyAgentMarkSingleRead = async function() {};
window.zyAgentMarkAllRead = async function() {};
window.zyAgentWipeNotifications = async function() {};

function zyAddNewsModal() {
  zyModal('Post News for Clients', `
    <div class="form-group" style="margin-bottom:12px;">
      <label class="zy-lbl" style="font-weight:600;">Headline *</label>
      <input class="zy-input" id="nn-title" placeholder="News headline" style="width:100%;height:38px;">
    </div>
    <div class="form-group" style="margin-bottom:8px;">
      <label class="zy-lbl" style="font-weight:600;">Message Content *</label>
      <textarea class="zy-input" id="nn-body" rows="4" placeholder="Important announcement for downline clients" style="width:100%;height:100px;padding:8px 10px;"></textarea>
    </div>`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="sp-btn-primary" onclick="zySaveNews()"><i class="fas fa-bullhorn" style="margin-right:4px;"></i> Post News</button>`);
}

async function zySaveNews() {
  const p = {
    title: document.getElementById('nn-title').value.trim(),
    message: document.getElementById('nn-body').value.trim(),
    body: document.getElementById('nn-body').value.trim(),
    audience: 'Client',
    target_role: 'Client',
    created_by: AGENT_ID
  };
  if (!p.title || !p.message) { toast('Headline and message required', 'error'); return; }
  await apiFetch('/api/announcements', { method: 'POST', body: JSON.stringify(p) });
  closeModal();
  zyFlash('News Published.');
  loadPage('notifications');
}

/* ═══ MY CLIENTS ════════════════════════════════════════════ */
async function pgMyClients() {
  const c = document.getElementById('page-content');
  zyCrumb(['Users Master', 'Clients']);
  c.innerHTML = `
    <div class="page-header" style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div>
        <div class="page-title" style="font-size:18px;font-weight:800;color:#0f172a;">
          <i class="fas fa-users" style="color:#2563eb;margin-right:6px;"></i> Downline Clients Directory
        </div>
        <div class="page-subtitle" style="font-size:12.5px;color:#64748b;">Create clients, manage their credentials, control active status, and allocate number pools.</div>
      </div>
      <div class="page-actions" style="display:flex;gap:8px;">
        <button class="btn btn-primary btn-sm" onclick="zyAddClientModal()"><i class="fas fa-user-plus"></i> Add Client</button>
      </div>
    </div>
    <div class="apx-card" style="border:1.5px solid #cbd5e1;border-radius:10px;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.04);overflow:hidden;">
      <div class="apx-card-header" style="height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:#f8fafc;border-bottom:1px solid #cbd5e1;">
        <span style="font-weight:700;font-size:13px;color:#1e293b;">
          <i class="fas fa-users" style="color:#2563eb;margin-right:6px;"></i> Downline Clients Directory
        </span>
        <span id="dt-my-clients-count" class="badge badge-blue" style="font-size:11px;">Loading…</span>
      </div>
      <div class="apx-card-body" id="agt-clients-table-host" style="padding:14px;"><div class="zy-loading">Loading clients…</div></div>
    </div>`;

  const list = zyList(await apiFetch(`/api/clients?agent_id=${AGENT_ID}&limit=500`));
  ZY_CLIENTS = list;

  const countBadge = document.getElementById('dt-my-clients-count');
  if (countBadge) countBadge.textContent = `${list.length} Client(s)`;

  const rows = list.map(x => {
    const isAct = x.status === 'active';
    const actionHtml = `
      <div style="display:inline-flex;align-items:center;gap:5px;">
        <button type="button" class="apx-btn apx-btn-icon apx-btn-small" onclick="zyViewClientDetails(${x.id})" title="View Details" style="color:#0284c7;border-color:#bae6fd;background:#f0f9ff;"><i class="fas fa-eye"></i></button>
        <button type="button" class="apx-btn apx-btn-icon apx-btn-small" onclick="zyEditClientModal(${x.id})" title="Edit Client" style="color:#059669;border-color:#a7f3d0;background:#ecfdf5;"><i class="fas fa-pen"></i></button>
        <button type="button" class="apx-btn apx-btn-icon apx-btn-small" onclick="zyToggleClientStatus(${x.id},'${x.status || 'active'}')" title="${isAct ? 'Deactivate Client' : 'Activate Client'}" style="color:${isAct ? '#d97706' : '#16a34a'};border-color:${isAct ? '#fde68a' : '#bbf7d0'};background:${isAct ? '#fffbeb' : '#f0fdf4'};">
          <i class="fas fa-${isAct ? 'pause' : 'play'}"></i>
        </button>
      </div>`;
    const r = [
      `<b>${zyEsc(x.username || '')}</b>`,
      zyEsc(x.full_name || '—'),
      zyEsc(x.email || '—'),
      zyEsc(x.phone || x.contact_no || '—'),
      zyEsc(x.skype_id || '—'),
      { v: isAct ? 'yes' : 'no', h: `<span class="badge ${isAct ? 'badge-green' : 'badge-red'}">${isAct ? 'Active' : 'Inactive'}</span>` },
      { v: '', h: actionHtml }
    ];
    r.__id = x.id;
    return r;
  });
  const host = document.getElementById('agt-clients-table-host');
  if (host) {
    host.innerHTML = zyDT2('dt-clients', {
      cols: ['Username', 'Name', 'Email', 'Contact', 'Skype', 'Status', 'Actions'], rows, check: true });
    zy2Render('dt-clients');
  }
}

function zyAddClientModal() {
  zyModal('Add New Client', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px;">
      <div><label class="zy-lbl">Username *</label><input class="zy-input" id="nc-user" placeholder="Minimum 6 Characters" autocomplete="off"></div>
      <div><label class="zy-lbl">Password *</label><input class="zy-input" id="nc-pass" type="password" placeholder="Minimum 6 Characters" autocomplete="new-password"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px;">
      <div><label class="zy-lbl">Full Name</label><input class="zy-input" id="nc-name" placeholder="Client Name"></div>
      <div><label class="zy-lbl">Email</label><input class="zy-input" id="nc-mail" type="email" placeholder="client@example.com"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px;">
      <div><label class="zy-lbl">Contact No.</label><input class="zy-input" id="nc-phone" placeholder="+44..."></div>
      <div><label class="zy-lbl">Skype ID</label><input class="zy-input" id="nc-skype" placeholder="Skype ID"></div>
    </div>`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="zy-btn-blue" onclick="zySaveClient()"><i class="fas fa-user-plus" style="margin-right:4px;"></i> Create Client</button>`);
}

async function zySaveClient() {
  const p = {
    username: document.getElementById('nc-user').value.trim(),
    password: document.getElementById('nc-pass').value,
    email: document.getElementById('nc-mail').value.trim(),
    skype_id: document.getElementById('nc-skype').value.trim(),
    contact_no: document.getElementById('nc-phone').value.trim(),
    full_name: document.getElementById('nc-name').value.trim(),
    agent_id: AGENT_ID
  };
  if (p.username.length < 6 || p.password.length < 6) { toast('Username and password need 6+ characters', 'error'); return; }
  const r = await apiFetch('/api/clients', { method: 'POST', body: JSON.stringify(p) });
  if (r && r.id) { closeModal(); zyFlash('Client Added.'); loadPage('my-clients'); }
  else { toast(r?.error || 'Failed to create client', 'error'); }
}

window.zyToggleClientStatus = async function(id, currentStatus) {
  try {
    const newStatus = currentStatus === 'active' ? 'deactivated' : 'active';
    const res = await apiFetch(`/api/clients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
    if (res && (res.id || res.success)) {
      toast(`Client marked as ${newStatus}`, 'success');
      loadPage('my-clients');
    } else {
      toast(res?.error || 'Failed to update client status', 'error');
    }
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
};

window.zyEditClientModal = async function(id) {
  const c = ZY_CLIENTS.find(x => String(x.id) === String(id));
  if (!c) return;
  const policy = typeof zyFetchAllocPolicy === 'function' ? await zyFetchAllocPolicy() : {};
  const canConfig = !!policy?.can_configure_downline;
  const allocBlock = canConfig ? `
    <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;margin-top:10px;">
      <div style="font-weight:700;font-size:11.5px;color:#475569;text-transform:uppercase;margin-bottom:6px;">Number Acquisition Policy</div>
      <label class="zy-lbl">Mode</label>
      <select class="zy-input" id="ec-alloc-mode" style="width:100%;">
        <option value="" ${!c.alloc_mode ? 'selected' : ''}>Inherit Default</option>
        <option value="request" ${c.alloc_mode === 'request' ? 'selected' : ''}>Request Only</option>
        <option value="self_allocate" ${c.alloc_mode === 'self_allocate' ? 'selected' : ''}>Self-Allocate Only</option>
      </select>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px;">
        <div><label class="zy-lbl">Daily Limit (blank = inherit)</label><input class="zy-input" type="number" min="0" id="ec-alloc-daily" value="${c.alloc_daily_limit ?? ''}" placeholder="Inherit"></div>
        <div><label class="zy-lbl">Total Limit (blank = inherit)</label><input class="zy-input" type="number" min="0" id="ec-alloc-total" value="${c.alloc_total_limit ?? ''}" placeholder="Inherit"></div>
      </div>
    </div>` : '';
  zyModal(`Edit Client — ${zyEsc(c.username)}`, `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px;">
      <div><label class="zy-lbl">Full Name</label><input class="zy-input" id="ec-name" value="${zyEsc(c.full_name || '')}" placeholder="Full Name"></div>
      <div><label class="zy-lbl">Email</label><input class="zy-input" id="ec-mail" value="${zyEsc(c.email || '')}" placeholder="abc@xyz.com"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px;">
      <div><label class="zy-lbl">Skype ID</label><input class="zy-input" id="ec-skype" value="${zyEsc(c.skype_id || '')}" placeholder="Skype ID"></div>
      <div><label class="zy-lbl">Contact No.</label><input class="zy-input" id="ec-phone" value="${zyEsc(c.phone || c.contact_no || '')}" placeholder="441768499506"></div>
    </div>
    <label class="zy-lbl">New Password (leave blank to keep current)</label>
    <input class="zy-input" id="ec-pass" type="password" placeholder="New Password">
    ${allocBlock}
  `,
  `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
   <button class="zy-btn-blue" onclick="zySaveEditClient(${id})">Save Changes</button>`);
};

window.zySaveEditClient = async function(id) {
  const p = {
    full_name: document.getElementById('ec-name').value.trim(),
    email: document.getElementById('ec-mail').value.trim(),
    skype_id: document.getElementById('ec-skype').value.trim(),
    phone: document.getElementById('ec-phone').value.trim()
  };
  const pass = document.getElementById('ec-pass').value;
  if (pass) {
    if (pass.length < 6) { toast('Password must be 6+ characters', 'error'); return; }
    p.password = pass;
  }
  const modeEl = document.getElementById('ec-alloc-mode');
  if (modeEl) {
    const dRaw = document.getElementById('ec-alloc-daily')?.value;
    const tRaw = document.getElementById('ec-alloc-total')?.value;
    p.alloc_mode = modeEl.value || null;
    p.alloc_daily_limit = dRaw !== '' && dRaw !== undefined ? Math.max(0, parseInt(dRaw, 10) || 0) : null;
    p.alloc_total_limit = tRaw !== '' && tRaw !== undefined ? Math.max(0, parseInt(tRaw, 10) || 0) : null;
  }
  const r = await apiFetch(`/api/clients/${id}`, { method: 'PATCH', body: JSON.stringify(p) });
  if (r && (r.id || r.success)) {
    closeModal();
    toast('Client updated successfully', 'success');
    loadPage('my-clients');
  } else {
    toast(r?.error || 'Failed to update client', 'error');
  }
};

window.zyViewClientDetails = function(id) {
  const u = ZY_CLIENTS.find(x => String(x.id) === String(id));
  if (!u) return;
  const line = (k, v) => `<div style="font-weight:700;font-size:11.5px;color:#64748b;margin-top:8px;text-transform:uppercase;letter-spacing:0.3px;">${k}</div><div style="font-size:13px;color:#0f172a;margin-bottom:4px;font-weight:500;">${zyEsc(String(v ?? '—'))}</div>`;
  zyModal(`Client Details — ${zyEsc(u.username)}`,
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">` +
    line('Username', u.username) +
    line('Full Name', u.full_name) +
    line('Email', u.email) +
    line('Contact No.', u.phone || u.contact_no) +
    line('Skype ID', u.skype_id) +
    line('Balance', `$${Number(u.balance || 0).toFixed(2)}`) +
    line('Status', u.status || 'active') +
    line('Assigned Numbers', u.numbers_assigned || 0) +
    `</div>`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>`);
};

/* ═══ SMS CDR REPORTS (detailed & summary V5) ═══════════════ */
async function pgDetailedSms() { zyCdrPage(false); }
async function pgSummarySms() { zyCdrPage(true); }

window.zyAgentDatePreset = function(key) {
  zyApplyDatePreset(key, 'rp-from', 'rp-to', '.zy-date-presets');
  zyCdrLoad(window._zyCurrentCdrSummary || false);
};

window.zySwitchAgentCdrTab = function(tabId) {
  const isSummary = tabId === 'grouped';
  zyCdrPage(isSummary);
};

async function zyCdrPage(summary = false) {
  const c = document.getElementById('page-content');
  zyCrumb(['SMS CDR Reports']);

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
    <div class="zy-intro" style="font-size:13px;color:#475569;margin-bottom:14px;line-height:1.5;">Here You can view all the call detail records.</div>

    <!-- Day-to-Day Style Compact Filter Card (Frames 03, 05) -->
    <div class="zy-filter-grid">
      <div class="zy-compact-boxes-grid">
        <div>
          <label class="zy-filter-label" for="rp-from" style="font-size:11px;font-weight:600;margin-bottom:3px;display:block;color:#64748b;">From</label>
          <input type="text" id="rp-from" class="zy-compact-box" value="${defaultFrom}" placeholder="YYYY-MM-DD HH:mm:ss" onclick="if(window.zyOpenDatePicker)window.zyOpenDatePicker(this)" style="cursor:pointer;">
        </div>
        <div>
          <label class="zy-filter-label" for="rp-to" style="font-size:11px;font-weight:600;margin-bottom:3px;display:block;color:#64748b;">To</label>
          <input type="text" id="rp-to" class="zy-compact-box" value="${defaultTo}" placeholder="YYYY-MM-DD HH:mm:ss" onclick="if(window.zyOpenDatePicker)window.zyOpenDatePicker(this)" style="cursor:pointer;">
        </div>
        <div>
          <label class="zy-filter-label" for="rp-range" style="font-size:11px;font-weight:600;margin-bottom:3px;display:block;color:#64748b;">Range</label>
          <select id="rp-range" class="zy-compact-box">
            <option value="">All</option>
          </select>
        </div>
        <div>
          <label class="zy-filter-label" for="rp-client" style="font-size:11px;font-weight:600;margin-bottom:3px;display:block;color:#64748b;">Client</label>
          <select id="rp-client" class="zy-compact-box">
            <option value="">All</option>
          </select>
        </div>
        <div>
          <label class="zy-filter-label" for="rp-num" style="font-size:11px;font-weight:600;margin-bottom:3px;display:block;color:#64748b;">Number</label>
          <input type="text" id="rp-num" class="zy-compact-box" placeholder="Number contains...">
        </div>
        <div>
          <label class="zy-filter-label" for="rp-cli" style="font-size:11px;font-weight:600;margin-bottom:3px;display:block;color:#64748b;">CLI</label>
          <input type="text" id="rp-cli" class="zy-compact-box" placeholder="CLI contains...">
        </div>
      </div>

      <!-- Group By Row (Frames 04, 05, test_01, test_04) -->
      <div class="zy-compact-groupby zy-groupby-card">
        <div class="zy-compact-groupby-title">Group By :</div>
        <div class="zy-compact-groupby-chips">
          ${chipsHtml}
        </div>
      </div>

      <!-- Dual 50/50 Action Buttons (Frames 03, 05) -->
      <div class="zy-compact-actions" style="display:flex;gap:12px;margin-top:16px;">
        <button type="button" class="zy-btn-orange zy-btn-amber" id="btn-export-report" style="flex:1;height:42px;font-size:13.5px;" onclick="zyAgentExportReport()">
          Export Report
        </button>
        <button type="button" class="zy-btn-blue zy-btn-blue-solid" id="btn-show-report" style="flex:1;height:42px;font-size:13.5px;" onclick="zyCdrLoad()">
          Show Report
        </button>
      </div>

      <!-- Divider & Standard Toolbar (Search, Limit, Copy, CSV, Excel, PDF, Columns) -->
      <div class="zy-filter-divider" style="margin:16px 0 12px 0;border-top:1px dashed #cbd5e1;"></div>
      <div class="zy-table-toolbar" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;">
        <div class="zy-toolbar-left" style="display:flex;align-items:center;gap:12px;">
          <div class="zy-toolbar-search-wrap">
            <input type="text" id="cdr-client-search" class="zy-toolbar-search" placeholder="Number, CLI, message, range" oninput="zyFilterTable('dt-cdr', this.value)" style="height:32px;padding:4px 10px;font-size:12px;border:1px solid #cbd5e1;border-radius:4px;">
          </div>
          <div class="zy-toolbar-limit-wrap" style="display:flex;align-items:center;gap:6px;font-size:12px;color:#64748b;">
            <label for="rp-limit">Show</label>
            <select id="rp-limit" class="zy-toolbar-select" onchange="zyCdrLoad()" style="height:32px;padding:2px 8px;font-size:12px;border:1px solid #cbd5e1;border-radius:4px;">
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
          <div class="zy-toolbar-pills" style="display:flex;flex-wrap:wrap;gap:6px;">
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
    </div>
    ${typeof zyRenderFab === 'function' ? zyRenderFab('Add Numbers in one tap', 'zyActionAllocate()') : ''}`;

  const ranges = zyList(await apiFetch('/api/numbers/sms-ranges'));
  ZY_RANGES = ranges;
  const rEl = document.getElementById('rp-range');
  if (rEl) {
    rEl.innerHTML = `<option value="">All</option>` +
      ranges.map(r => `<option value="${r.id}">${zyEsc(r.range_name || r.name || r.country || '')}${r.prefix ? ` (${zyEsc(r.prefix)})` : ''}</option>`).join('');
  }
  await zyFillClients('rp-client', 'All');
  // Auto-run first report
  zyCdrLoad(summary);
}

window.zyAgentExportReport = function() {
  const val = id => (document.getElementById(id) || {}).value || '';
  const checkedBoxes = Array.from(document.querySelectorAll('.grp-chk:checked')).map(cb => cb.value);
  zyExportCdrStream({
    agent_id: typeof AGENT_ID !== 'undefined' ? AGENT_ID : '',
    date_from: val('rp-from'),
    date_to: val('rp-to'),
    range: val('rp-range'),
    client_id: val('rp-client'),
    search: val('rp-num'),
    cli: val('rp-cli'),
    status: val('rp-status') !== 'All' ? val('rp-status') : '',
    group_by: checkedBoxes.join(',')
  });
};

async function zyCdrLoad(pageOrSummary = 1) {
  const targetPage = typeof pageOrSummary === 'number' ? pageOrSummary : 1;
  const isSummaryMode = typeof pageOrSummary === 'boolean' ? pageOrSummary : false;

  const body = document.getElementById('rp-body');
  if (!body) return;

  // Cancel prior in-flight request if user quickly clicks page/filters
  if (window._agentCdrAbortController) {
    try { window._agentCdrAbortController.abort(); } catch (_) {}
  }
  window._agentCdrAbortController = new AbortController();
  const reqSignal = window._agentCdrAbortController.signal;

  body.innerHTML = `<div class="zy-loading" style="padding:40px;text-align:center;color:#64748b;">
    <div style="display:inline-block;margin-bottom:8px;"><i class="fas fa-spinner fa-spin fa-2x" style="color:#0ea5e9;"></i></div>
    <div>Loading CDR records…</div>
  </div>`;

  const val = id => (document.getElementById(id) || {}).value || '';
  const from = val('rp-from'), to = val('rp-to');
  const rangeId = val('rp-range'), clientId = val('rp-client');
  const num = val('rp-num'), cli = val('rp-cli');
  const status = val('rp-status');

  const checkedBoxes = Array.from(document.querySelectorAll('.grp-chk:checked')).map(cb => cb.value);

  const params = new URLSearchParams();
  if (typeof AGENT_ID !== 'undefined' && AGENT_ID) params.append('agent_id', AGENT_ID);
  if (from) params.append('date_from', from);
  if (to) params.append('date_to', to);
  if (rangeId) params.append('range', rangeId);
  if (clientId) params.append('client_id', clientId);
  if (num) params.append('search', num);
  if (cli) params.append('cli', cli);
  if (status && status !== 'All') params.append('status', status);
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
        date: 'Date',
        daily: 'Date',
        month: 'Month',
        range: 'Range',
        client: 'Client',
        number: 'Number',
        cli: 'CLI'
      };
      const cols = [
        ...checkedBoxes.map(k => keyLabels[k] || k),
        'Total SMS',
        'Curr.',
        'My Payout',
        'Client Payout',
        'My Profit'
      ];
      const rows = data.map(g => [
        ...checkedBoxes.map(k => g[k] || '—'),
        g.sms_count || 0,
        g.currency || '$',
        Number(g.payout || 0).toFixed(4),
        Number(g.client_payout || 0).toFixed(4),
        Number(g.profit != null ? g.profit : ((g.payout || 0) - (g.client_payout || 0))).toFixed(4)
      ]);

      const sumTotals = typeof zyBuildCdrTotalRow === 'function' ? zyBuildCdrTotalRow(data, true, { summary: logs.summary }) : null;
      const totalGroups = sumTotals ? sumTotals.count : data.length;
      const totalSms = sumTotals ? sumTotals.totalSms : (logs.summary && logs.summary.total_sms != null ? logs.summary.total_sms : data.reduce((sum, g) => sum + (g.sms_count || 0), 0));
      const totalPayout = sumTotals ? sumTotals.totalPayout : (logs.summary && logs.summary.payout != null ? logs.summary.payout : data.reduce((sum, g) => sum + (parseFloat(g.payout) || 0), 0));
      const totalClientPayout = sumTotals ? sumTotals.totalClientPayout : (logs.summary && logs.summary.client_payout != null ? logs.summary.client_payout : data.reduce((sum, g) => sum + (parseFloat(g.client_payout) || 0), 0));
      const totalProfit = sumTotals ? sumTotals.totalProfit : (logs.summary && logs.summary.profit != null ? logs.summary.profit : Math.max(0, totalPayout - totalClientPayout));

      body.innerHTML = zyDT2('dt-cdr', {
        cols,
        rows,
        sort: checkedBoxes.length,
        dir: -1,
        perPage: limitNum,
        serverMode: false,
        searchPlaceholder: 'Number, CLI, message, range',
        footRow: `<td><b>Total Groups: ${totalGroups}</b></td>` +
                 '<td></td>'.repeat(Math.max(0, checkedBoxes.length - 1)) +
                 `<td><b>${totalSms.toLocaleString()}</b></td>` +
                 `<td><b>$</b></td>` +
                 `<td><b>${totalPayout.toFixed(4)}</b></td>` +
                 `<td><b>${totalClientPayout.toFixed(4)}</b></td>` +
                 `<td><b>${totalProfit.toFixed(4)}</b></td>`
      });
      zy2Render('dt-cdr');
    } else {
      const cols = ['Date', 'Range', 'Number', 'CLI', 'SMS', 'Curr.', 'My Payout', 'Client Payout', 'My Profit'];
      const rows = data.map(s => {
        const dtCell = typeof zyFormatDateTimeStacked === 'function'
          ? zyFormatDateTimeStacked(s.timestamp || s.date)
          : { v: (s.timestamp || s.date || '').replace('T', ' ').slice(0, 19), h: (s.timestamp || s.date || '').replace('T', ' ').slice(0, 19) };
        const myP = parseFloat(s.agent_payout != null ? s.agent_payout : (s.payout || 0)) || 0;
        const clP = parseFloat(s.client_payout != null ? s.client_payout : (s.client_rate || 0)) || 0;
        const prof = Math.max(0, myP - clP);
        const maskedCli = zyMaskCli(s.cli || s.app || '—');
        const smsHtml = typeof zyHighlightOtp === 'function' ? zyHighlightOtp(s.message || '') : zyEsc(s.message || '');

        return [
          dtCell,
          s.range_name || s.range_label || s.range || (s.country || '—'),
          { v: s.number || '—', h: `<span class="monospace" style="font-weight:600;">${zyEsc(s.number || '—')}</span>` },
          { v: s.cli || '—', h: `<span class="monospace">${maskedCli}</span>` },
          { v: s.message || '', h: `<div style="max-width:320px;white-space:normal;line-height:1.4;">${smsHtml}</div>` },
          s.currency || '$',
          Number(myP).toFixed(4),
          Number(clP).toFixed(4),
          Number(prof).toFixed(4)
        ];
      });

      const sum = logs.summary || {};
      const totalSms = (sum.total_sms != null) ? sum.total_sms : (logs.total != null ? logs.total : rows.length);
      const totalPayout = (sum.payout != null) ? sum.payout : (data.reduce((acc, s) => acc + (parseFloat(s.agent_payout != null ? s.agent_payout : (s.payout || 0)) || 0), 0));
      const totalClientPayout = (sum.client_payout != null) ? sum.client_payout : (data.reduce((acc, s) => acc + (parseFloat(s.client_payout != null ? s.client_payout : (s.client_rate || 0)) || 0), 0));
      const totalProfit = (sum.profit != null) ? sum.profit : Math.max(0, totalPayout - totalClientPayout);

      const footRow = `<td><b>Total SMS<br>${totalSms.toLocaleString()}</b></td>` +
        '<td></td><td></td><td></td><td></td><td></td>' +
        `<td><b>My Payout<br>${Number(totalPayout).toFixed(4)}</b></td>` +
        `<td><b>Client Payout<br>${Number(totalClientPayout).toFixed(4)}</b></td>` +
        `<td><b>My Profit<br>${Number(totalProfit).toFixed(4)}</b></td>`;

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
        onPageChange: (p) => zyCdrLoad(p),
        onSizeChange: (s) => {
          const sel = document.getElementById('rp-limit');
          if (sel) sel.value = String(s);
          zyCdrLoad(1);
        },
        searchPlaceholder: 'Number, CLI, message, range',
        footRow
      });
      zy2Render('dt-cdr');
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    console.error('Agent CDR stats load error:', err);
    body.innerHTML = '<div class="zy-empty" style="padding:40px;text-align:center;color:#ef4444;">Failed to load CDR records. Please try again.</div>';
  }
}

/* ═══ STATS PAGES (client / range / number) ═════════════════ */
function pgClientSmsStats() { return zyStatsPage('client'); }
function pgSmsRangeStats() { return zyStatsPage('range'); }
function pgSmsNumberStats() { return zyStatsPage('number'); }
async function zyStatsPage(kind) {
  const c = document.getElementById('page-content');
  const meta = {
    client: ['Client SMS Stats', 'Clients', 'Client', 'Filter Client'],
    range:  ['SMS Range Stats',  'SMS Ranges', 'Range', 'Filter Range'],
    number: ['SMS Number Stats', 'Numbers', 'Number', null]
  }[kind];
  zyCrumb([meta[0]]);
  c.innerHTML = `<div class="zy-intro">Here you will get summarize ${kind === 'range' ? 'reports of SMS Ranges' : 'sms reports of ' + meta[1]}.</div>
    <div class="zy-filterbox">
      <input class="zy-fb-input" id="st-from" value="${zyToday()} 00:00:00">
      <input class="zy-fb-input" id="st-to" value="${zyToday()} 23:59:59">
      ${meta[3] ? `<select class="zy-fb-input" id="st-pick"><option value="">${meta[3]}</option></select>` : ''}
      <div class="zy-fb-btns"><button class="zy-btn-blue" onclick="zyStatsLoad('${kind}')">Show Report</button></div>
    </div>
    <div class="zy-panel"><div class="zy-panel-head">${meta[0]}</div>
      <div class="zy-panel-body" id="st-body"><div class="zy-loading">Loading…</div></div></div>`;
  if (kind === 'client') await zyFillClients('st-pick', 'Filter Client');
  if (kind === 'range') {
    const ranges = zyList(await apiFetch('/api/numbers/sms-ranges'));
    document.getElementById('st-pick').innerHTML = `<option value="">Filter Range</option>` +
      ranges.map(r => `<option value="${r.id}">${zyEsc(r.range_name || r.name || r.country)}</option>`).join('');
  }
  zyStatsLoad(kind);
}
async function zyStatsLoad(kind) {
  const body = document.getElementById('st-body');
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;
  const logs = zyList(await apiFetch(`/api/sms/logs?agent_id=${AGENT_ID}&limit=500`))
    .filter(s => zyInRange('st', s.timestamp));
  const keyOf = s => kind === 'client' ? zyClientName(s.client_id)
                   : kind === 'range' ? (s.range_name || s.range_label || s.range || s.country || '—')
                   : (s.number || '');
  const group = {};
  logs.forEach(s => {
    const k = keyOf(s) || '—';
    group[k] = group[k] || { sms: 0, mine: 0, client: 0 };
    group[k].sms++;
    group[k].mine += Number(s.payout || 0);
    group[k].client += Number(s.client_payout || 0);
  });
  const label = kind === 'client' ? 'Client' : kind === 'range' ? 'Range' : 'Number';
  const rows = Object.entries(group).map(([k, v]) =>
    [k, v.sms, 'USD', v.mine.toFixed(3), v.client.toFixed(3)]);
  body.innerHTML = zyDT2('dt-stats', {
    cols: [label, 'SMS', 'Currency', 'My Payout', 'Client Payout'], rows, sort: 1, dir: -1 });
  zy2Render('dt-stats');
}

/* ═══ MY CREDIT NOTES ═══════════════════════════════════════ */
async function pgCreditNotes() {
  const c = document.getElementById('page-content');
  zyCrumb(['My Credit Notes']);
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title"><i class="fas fa-file-invoice" style="color:#2563eb;"></i> My Credit Notes</div>
        <div class="page-subtitle">Official wholesale SMS credit notes. Download print-ready settlement vouchers and track maturity dates.</div>
      </div>
    </div>
    <div class="zy-filterbox">
      <input class="zy-fb-input" id="cn-from" value="${zyMonthStart()} 00:00:00">
      <input class="zy-fb-input" id="cn-to" value="${zyToday()} 23:59:59">
      <div class="zy-fb-btns"><button class="zy-btn-blue" onclick="pgCreditNotesLoad()">Show Report</button></div>
    </div>
    <div class="card zy-panel">
      <div class="card-header zy-panel-head" style="display:flex;align-items:center;justify-content:space-between;">
        <span class="card-title">My Credit Notes</span>
      </div>
      <div class="card-body zy-panel-body" id="cn-body"><div class="zy-loading">Loading…</div></div>
    </div>`;
  pgCreditNotesLoad();
}
async function pgCreditNotesLoad() {
  const body = document.getElementById('cn-body');
  if (!body) return;
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;
  const list = zyList(await apiFetch('/api/credit-notes?limit=500'))
    .filter(n => String(n.agent_id) === String(AGENT_ID) || String(n.user_id) === String(AGENT_ID))
    .filter(n => zyInRange('cn', n.created || n.date));
  const rows = list.map(n => {
    const due = new Date(String(n.date || n.created || '').slice(0, 10));
    due.setDate(due.getDate() + 1);
    return [
      (n.date || n.created || '').slice(0, 10),
      n.reason || 'Wholesale SMS Settlement',
      n.term || 'Weekly',
      n.currency || 'USD',
      Number(n.amount || 0).toFixed(3),
      isNaN(due) ? '' : due.toISOString().slice(0, 10),
      { v: '', h: `<button class="zy-rowbtn" onclick="window.open('/api/credit-notes/${n.id}/pdf', '_blank')" title="Download Credit Voucher"><i class="fas fa-file-invoice" style="color:var(--sp-primary);"></i></button>` }
    ];
  });
  body.innerHTML = zyDT2('dt-credit', {
    cols: ['Date', 'Description', 'Term', 'Currency', 'Amount', 'Due Date', 'Voucher'], rows, sort: 0, dir: -1 });
  zy2Render('dt-credit');
}

/* ═══ PAYMENT REQUESTS ══════════════════════════════════════ */
async function pgPaymentRequests() {
  const c = document.getElementById('page-content');
  zyCrumb(['Payment Requests']);

  let balUsd = 0;
  let thisWeekUsd = 0;
  let weekRangeStr = 'UTC Mon – Sun';
  let minPayout = 30;

  try {
    const [earn, settings] = await Promise.all([
      apiFetch(`/api/agent/${AGENT_ID}/earnings`),
      apiFetch('/api/settings').catch(() => ({}))
    ]);
    balUsd = Number(earn?.main_balance ?? earn?.balance ?? 0);
    thisWeekUsd = Number(earn?.this_week ?? 0);
    if (earn?.week_range) weekRangeStr = earn.week_range;
    if (settings?.min_payout != null) minPayout = Number(settings.min_payout);
  } catch (e) {}

  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title"><i class="fas fa-wallet" style="color:#2563eb;"></i> Payment Requests</div>
        <div class="page-subtitle">Review your main balance, weekly accrued traffic, monitor payout statuses, and request payouts.</div>
      </div>
    </div>
    
    <!-- Astra SMS 2-Card Metric Row -->
    <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:12px;margin-bottom:16px;">
      <!-- Main balance ($) -->
      <div class="sp-card" style="padding:14px 16px;border-radius:10px;border:1px solid #cbd5e1;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.04);display:flex;flex-direction:column;justify-content:space-between;min-height:115px;">
        <div>
          <div style="font-size:11.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.3px;">Main balance ($)</div>
          <div style="font-size:24px;font-weight:800;color:#0f172a;margin:4px 0 6px;">$<span id="bal-usd">${balUsd.toFixed(2)}</span></div>
          <div style="font-size:11.5px;color:#64748b;display:flex;align-items:center;gap:4px;">
            <i class="fas fa-info-circle" style="color:#0ea5e9;"></i> Min for payout: <strong>$${minPayout.toFixed(2)}</strong>
          </div>
        </div>
        <div style="margin-top:12px;">
          <button type="button" class="sp-btn-primary" style="height:32px;padding:0 14px;font-size:12px;font-weight:700;border-radius:6px;display:inline-flex;align-items:center;gap:6px;background:#10b981;border:none;color:#fff;cursor:pointer;" onclick="zyAgentRequestPayoutModal(${balUsd}, ${minPayout})">
            <i class="fas fa-paper-plane"></i> Request payment
          </button>
        </div>
      </div>

      <!-- This Week Mon-Sun -->
      <div class="sp-card" style="padding:14px 16px;border-radius:10px;border:1px solid #cbd5e1;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.04);display:flex;flex-direction:column;justify-content:space-between;min-height:115px;">
        <div>
          <div style="font-size:11.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.3px;">This Week Mon-Sun</div>
          <div style="font-size:24px;font-weight:800;color:#2563eb;margin:4px 0 6px;">$<span id="bal-week">${thisWeekUsd.toFixed(4)}</span></div>
          <div style="font-size:11.5px;color:#64748b;display:flex;align-items:center;gap:4px;">
            <i class="fas fa-calendar-alt" style="color:#8b5cf6;"></i> <span>${zyEsc(weekRangeStr)}</span>
          </div>
        </div>
        <div style="margin-top:12px;font-size:11.5px;color:#059669;font-weight:600;display:flex;align-items:center;gap:5px;">
          <i class="fas fa-check-circle"></i> Auto-settles to Main Balance at Sun 23:59:59 UTC
        </div>
      </div>
    </div>

    <!-- Date Filter -->
    <div class="zy-filterbox" style="margin-bottom:14px;">
      <input class="zy-fb-input" id="pr-from" value="${zyMonthStart()} 00:00:00" onclick="if(window.zyOpenDatePicker)window.zyOpenDatePicker(this)">
      <input class="zy-fb-input" id="pr-to" value="${zyToday()} 23:59:59" onclick="if(window.zyOpenDatePicker)window.zyOpenDatePicker(this)">
      <div class="zy-fb-btns"><button class="zy-btn-blue" onclick="pgPaymentRequestsLoad()">Show Report</button></div>
    </div>
    
    <div class="zy-panel">
      <div class="zy-panel-head" style="display:flex;align-items:center;justify-content:space-between;">
        <span>Payment Requests History</span>
      </div>
      <div class="zy-panel-body" id="pr-body"><div class="zy-loading">Loading…</div></div>
    </div>`;

  pgPaymentRequestsLoad();
}

window.zyAgentRequestPayoutModal = async function(currentBal = 0) {
  let minPayout = 10;
  let bankAccounts = [];
  try {
    const [settings, banks] = await Promise.all([
      apiFetch('/api/settings'),
      apiFetch(`/api/bank-accounts?agent_id=${AGENT_ID}`)
    ]);
    minPayout = Number(settings?.min_payout ?? 10);
    bankAccounts = Array.isArray(banks) ? banks : (banks?.data || []);
  } catch (e) {}

  const bankOptions = bankAccounts.map(b => `<option value="${zyEsc(b.bank_name)} - ${zyEsc(b.account_no)}">${zyEsc(b.bank_name)} (${zyEsc(b.currency || 'USD')} - ${zyEsc(b.account_no)})</option>`).join('');

  zyModal('Request Payout', `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:13px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="color:#64748b;">Available USD Balance:</span>
        <strong style="color:#10b981;font-size:15px;">$${Number(currentBal).toFixed(2)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#64748b;">Minimum Payout Limit:</span>
        <strong>$${Number(minPayout).toFixed(2)}</strong>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
      <div>
        <label class="zy-lbl" style="font-weight:600;">Payout Amount ($) *</label>
        <input type="number" id="apr-amount" class="zy-input" style="width:100%;height:38px;" step="0.01" min="${minPayout}" max="${currentBal}" value="${currentBal >= minPayout ? currentBal : minPayout}">
      </div>
      <div>
        <label class="zy-lbl" style="font-weight:600;">Currency</label>
        <select id="apr-cur" class="zy-input" style="width:100%;height:38px;">
          <option value="USD" selected>USD ($)</option>
          <option value="EUR">EUR (€)</option>
          <option value="GBP">GBP (£)</option>
        </select>
      </div>
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label class="zy-lbl" style="font-weight:600;">Payment Method *</label>
      <select id="apr-method" class="zy-input" style="width:100%;height:38px;">
        <option value="USDT TRC20" selected>USDT (TRC-20)</option>
        <option value="Bank Transfer">Bank Wire Transfer</option>
        <option value="Payoneer">Payoneer</option>
        <option value="PayPal">PayPal</option>
      </select>
    </div>
    ${bankOptions ? `
      <div class="form-group" style="margin-bottom:12px;">
        <label class="zy-lbl" style="font-weight:600;">Saved Bank Account</label>
        <select id="apr-quick-bank" class="zy-input" style="width:100%;height:36px;" onchange="if(this.value)document.getElementById('apr-wallet').value=this.value;">
          <option value="">— Select Saved Bank Account —</option>
          ${bankOptions}
        </select>
      </div>
    ` : ''}
    <div class="form-group" style="margin-bottom:12px;">
      <label class="zy-lbl" style="font-weight:600;">Wallet Address / IBAN / Account Details *</label>
      <input type="text" id="apr-wallet" class="zy-input" style="width:100%;height:38px;" placeholder="TRC20 Wallet Address or Account/IBAN">
    </div>
    <div class="form-group" style="margin-bottom:8px;">
      <label class="zy-lbl" style="font-weight:600;">Notes (Optional)</label>
      <input type="text" id="apr-notes" class="zy-input" style="width:100%;height:38px;" placeholder="Weekly traffic settlement">
    </div>
  `, `
    <button class="zy-btn-grey" onclick="closeModal()">Cancel</button>
    <button class="sp-btn-primary" id="btn-submit-apr" onclick="zySubmitAgentPayout(${minPayout}, ${currentBal})"><i class="fas fa-paper-plane"></i> Submit Payout</button>
  `);
};

window.zySubmitAgentPayout = async function(minPayout, currentBal) {
  const amt = parseFloat(document.getElementById('apr-amount')?.value);
  const cur = document.getElementById('apr-cur')?.value || 'USD';
  const method = document.getElementById('apr-method')?.value;
  const wallet = document.getElementById('apr-wallet')?.value.trim();
  const notes = document.getElementById('apr-notes')?.value.trim();

  if (isNaN(amt) || amt <= 0) { toast('Please enter a valid payout amount', 'error'); return; }
  if (amt < minPayout) { toast(`Payment low. Minimum payout is $${minPayout.toFixed(2)}`, 'error'); return; }
  if (amt > currentBal) { toast(`Amount cannot exceed available balance of $${currentBal.toFixed(2)}`, 'error'); return; }
  if (!wallet) { toast('Please specify your wallet address or account details', 'error'); return; }

  const btn = document.getElementById('btn-submit-apr');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

  try {
    const res = await apiFetch('/api/payout-requests', {
      method: 'POST',
      body: JSON.stringify({
        amount: amt,
        currency: cur,
        method,
        wallet,
        notes,
        role: 'Agent',
        agent_id: AGENT_ID
      })
    });
    if (res && (res.id || res.success)) {
      closeModal();
      toast('Payout request submitted successfully', 'success');
      pgPaymentRequests();
    } else {
      toast(res?.error || 'Failed to submit payout request', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Submit Payout'; }
    }
  } catch (err) {
    toast(err.message || 'Error submitting payout request', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Submit Payout'; }
  }
};

async function pgPaymentRequestsLoad() {
  const body = document.getElementById('pr-body');
  if (!body) return;
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;
  const list = zyList(await apiFetch(`/api/payout-requests?agent_id=${AGENT_ID}`))
    .filter(r => {
      const ts = r.timestamp || r.created || r.created_at || r.date;
      return zyInRange('pr', ts);
    });
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
  body.innerHTML = zyDT2('dt-payreq', {
    cols: ['Date', 'Mode', 'Amount', 'Status', 'Address', 'Paid', 'Transaction', 'Remarks', 'Updated On'],
    rows,
    sort: 0,
    dir: -1
  });
  zy2Render('dt-payreq');
}

/* ═══ BANK ACCOUNTS ═════════════════════════════════════════ */
async function pgBankAccounts() {
  const c = document.getElementById('page-content');
  zyCrumb(['Bank Accounts']);
  c.innerHTML = `<div class="zy-intro">Here you can add your bank accounts and use them while requesting payments.</div>
    <div class="zy-panel"><div class="zy-panel-head">Manage Bank Accounts
      <div class="zy-head-acts">
        <button class="zy-act zy-act-blue" onclick="zyAddBankModal()" title="Add Bank Account">${zyImg('btn_add')}</button>
      </div></div>
      <div class="zy-panel-body" id="bk-body"><div class="zy-loading">Loading…</div></div></div>`;
  let list = [];
  try { list = zyList(await apiFetch(`/api/bank-accounts?agent_id=${AGENT_ID}`)); } catch (e) { list = []; }
  const rows = list.map(b => [b.currency || '', b.country || '', b.bank_name || '', b.bank_branch || '',
                              b.bank_address || '', b.account_no || '', b.beneficiary || '']);
  document.getElementById('bk-body').innerHTML = zyDT2('dt-bank', {
    cols: ['Currency', 'Country', 'Bank Name', 'Bank Branch', 'Bank Address', 'Account No.', 'Beneficiary'], rows });
  zy2Render('dt-bank');
}
const ZY_COUNTRIES = ['Afghanistan', 'Aland Islands', 'Albania', 'Algeria', 'American Samoa', 'Andorra', 'Angola',
  'Argentina', 'Armenia', 'Australia', 'Austria', 'Bahrain', 'Bangladesh', 'Belgium', 'Brazil', 'Canada', 'China',
  'Egypt', 'France', 'Germany', 'India', 'Indonesia', 'Iraq', 'Italy', 'Japan', 'Kenya', 'Malaysia', 'Nigeria',
  'Pakistan', 'Philippines', 'Saudi Arabia', 'Singapore', 'Spain', 'Turkey', 'Ukraine', 'United Arab Emirates',
  'United Kingdom', 'United States', 'Vietnam'];
function zyAddBankModal() {
  zyModal('Add New Bank Account', `
    <label class="zy-lbl">Currency</label>
    <select class="zy-input" id="bk-cur"><option value="">Select Currency</option>
      <option>USD</option><option>EUR</option><option>GBP</option></select>
    <label class="zy-lbl">Country</label>
    ${zyS2('bk-country', 'Select Country', ZY_COUNTRIES)}
    <label class="zy-lbl">Bank Name</label><input class="zy-input" id="bk-name" placeholder="Bank Name">
    <label class="zy-lbl">Bank Branch</label><input class="zy-input" id="bk-branch" placeholder="Bank Branch">
    <label class="zy-lbl">Bank Address</label><input class="zy-input" id="bk-addr" placeholder="Bank Address">
    <label class="zy-lbl">Account No./IBAN</label><input class="zy-input" id="bk-acc" placeholder="Account Number/IBAN">
    <label class="zy-lbl">Beneficiary Name</label><input class="zy-input" id="bk-ben" placeholder="Beneficiary Name">`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="zy-btn-blue" onclick="zySaveBank()">Add</button>`);
}
async function zySaveBank() {
  const p = { agent_id: AGENT_ID,
    currency: document.getElementById('bk-cur').value,
    country: zyS2Value('bk-country'),
    bank_name: document.getElementById('bk-name').value.trim(),
    bank_branch: document.getElementById('bk-branch').value.trim(),
    bank_address: document.getElementById('bk-addr').value.trim(),
    account_no: document.getElementById('bk-acc').value.trim(),
    beneficiary: document.getElementById('bk-ben').value.trim() };
  if (!p.currency || !p.bank_name) { toast('Currency and bank name required', 'error'); return; }
  try { await apiFetch('/api/bank-accounts', { method: 'POST', body: JSON.stringify(p) }); } catch (e) {}
  closeModal(); zyFlash('Bank Account Added.'); loadPage('bank-accounts');
}

/* ═══ STATEMENTS ════════════════════════════════════════════ */
async function pgStatements(cur) {
  const c = document.getElementById('page-content');
  zyCrumb([cur + ' Statements']);
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title"><i class="fas fa-file-invoice-dollar" style="color:#2563eb;"></i> ${cur} Statements</div>
        <div class="page-subtitle">Track your credit notes, debits, and running balance ledger in ${cur}.</div>
      </div>
    </div>
    <div class="zy-filterbox">
      <input class="zy-fb-input" id="sm-from" value="${zyMonthStart()} 00:00:00">
      <input class="zy-fb-input" id="sm-to" value="${zyToday()} 23:59:59">
      <div class="zy-fb-btns"><button class="zy-btn-blue" onclick="pgStatementsLoad('${cur}')">Show Report</button></div>
    </div>
    <div class="card zy-panel">
      <div class="card-header zy-panel-head" style="display:flex;align-items:center;justify-content:space-between;">
        <span class="card-title">${cur} Statements</span>
      </div>
      <div class="card-body zy-panel-body" id="sm-body"><div class="zy-loading">Loading…</div></div>
    </div>`;
  pgStatementsLoad(cur);
}
async function pgStatementsLoad(cur) {
  const body = document.getElementById('sm-body');
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;
  let balance = 0;
  const rows = zyList(await apiFetch('/api/credit-notes?limit=500'))
    .filter(n => String(n.agent_id) === String(AGENT_ID))
    .filter(n => (n.currency || 'USD') === cur)
    .filter(n => zyInRange('sm', n.created || n.date))
    .sort((a, b) => String(a.created || '').localeCompare(String(b.created || '')))
    .map(n => {
      const credit = Number(n.amount || 0);
      balance = Math.round((balance + credit) * 1000) / 1000;
      return [zyDateOnly(n.created || n.date), credit.toFixed(2), '0', 'Credit Note', balance.toFixed(2), n.reason || ''];
    }).reverse();
  body.innerHTML = zyDT2('dt-stmt', {
    cols: ['Date', 'Credit', 'Debit', 'Transaction For', 'Balance', 'Remarks'], rows, sort: 0, dir: -1 });
  zy2Render('dt-stmt');
}

/* ═══ TEST PANELS ═══════════════════════════════════════════ */
function pgVoiceTestPanel() { return zyTestPanel(true); }
function pgSmsTestPanel() { return zyTestPanel(false); }
async function zyTestPanel(voice) {
  const c = document.getElementById('page-content');
  zyCrumb([voice ? 'Test Panel' : 'SMS Test Panel']);
  const intro = voice
    ? `<div class="zy-intro">We are pleased to introduce the test numbers of our interconnected terminations. You can test the reachability of our number ranges using the following numbers.</div>
       <div class="zy-intro">To test:</div>
       <ul class="zy-list">
         <li>Choose a test number from a termination you are interested in.</li>
         <li>Make a call to the selected number.</li>
         <li>If the test is successful, you will hear: "You have reached the test number".</li>
         <li>Check also the Last calls stats (last 1 hour) below if your test was successful.</li>
       </ul>`
    : `<div class="zy-intro">Here you can see all test numbers.. you can make call on them and see test reports.</div>`;
  c.innerHTML = `${intro}
    <div class="zy-panel" style="margin-bottom:20px;">
      <div class="zy-panel-head" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <span>${voice ? 'Test Numbers' : 'SMS Test Numbers'}</span>
        <div class="zy-head-acts" style="display:flex;align-items:center;gap:8px;">
          ${zyS2('tp-range', 'Select Range', [])}
          <button type="button" class="zy-btn-blue-solid" style="height:32px;padding:0 14px;font-size:12px;border-radius:6px;width:auto;" onclick="zyTestFilter()">Filter</button>
        </div>
      </div>
      <div class="zy-panel-body" style="padding:14px;">
        <div class="zy-table-toolbar" style="margin-bottom:12px;">
          <div class="zy-toolbar-left">
            <div class="zy-search-wrap">
              <i class="fas fa-search"></i>
              <input type="text" class="zy-toolbar-search" placeholder="Search..." oninput="zyToolbarFilterTable('dt-testnums', this.value)">
            </div>
            <div class="zy-toolbar-select-wrap">
              <label class="zy-toolbar-label" for="tp-nums-limit">Show Records</label>
              <select id="tp-nums-limit" class="zy-toolbar-select" onchange="zyTestFilterLimit(this.value)">
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>
          <div class="zy-toolbar-right">
            <div class="zy-toolbar-pills">
              <button type="button" class="zy-btn-pill" onclick="zyExportTableCopy('dt-testnums')"><i class="fas fa-copy"></i> Copy</button>
              <button type="button" class="zy-btn-pill" onclick="zyExportTableCsv('dt-testnums')"><i class="fas fa-file-csv"></i> CSV</button>
              <button type="button" class="zy-btn-pill" onclick="zyExportTableExcel('dt-testnums')"><i class="fas fa-file-excel"></i> Excel</button>
              <button type="button" class="zy-btn-pill" onclick="zyExportTablePdf('dt-testnums')"><i class="fas fa-file-pdf"></i> PDF</button>
              <button type="button" class="zy-btn-pill" onclick="zyPrintTable('dt-testnums')"><i class="fas fa-print"></i> Print</button>
              <button type="button" class="zy-btn-pill" onclick="zyToggleColumnsModal('dt-testnums')"><i class="fas fa-columns"></i> Columns</button>
            </div>
          </div>
        </div>
        <div id="tp-nums-wrap"><div class="zy-loading">Loading test numbers…</div></div>
      </div>
    </div>
    <div class="zy-panel">
      <div class="zy-panel-head">${voice ? 'Recent Test Details' : 'Recent SMS Test'}</div>
      <div class="zy-panel-body" style="padding:14px;">
        <div class="zy-table-toolbar" style="margin-bottom:12px;">
          <div class="zy-toolbar-left">
            <div class="zy-search-wrap">
              <i class="fas fa-search"></i>
              <input type="text" class="zy-toolbar-search" placeholder="Search..." oninput="zyToolbarFilterTable('dt-testlog', this.value)">
            </div>
            <div class="zy-toolbar-select-wrap">
              <label class="zy-toolbar-label" for="tp-logs-limit">Show Records</label>
              <select id="tp-logs-limit" class="zy-toolbar-select" onchange="zyTestLogLimit(this.value)">
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>
          <div class="zy-toolbar-right">
            <div class="zy-toolbar-pills">
              <button type="button" class="zy-btn-pill" onclick="zyExportTableCopy('dt-testlog')"><i class="fas fa-copy"></i> Copy</button>
              <button type="button" class="zy-btn-pill" onclick="zyExportTableCsv('dt-testlog')"><i class="fas fa-file-csv"></i> CSV</button>
              <button type="button" class="zy-btn-pill" onclick="zyExportTableExcel('dt-testlog')"><i class="fas fa-file-excel"></i> Excel</button>
              <button type="button" class="zy-btn-pill" onclick="zyExportTablePdf('dt-testlog')"><i class="fas fa-file-pdf"></i> PDF</button>
              <button type="button" class="zy-btn-pill" onclick="zyPrintTable('dt-testlog')"><i class="fas fa-print"></i> Print</button>
              <button type="button" class="zy-btn-pill" onclick="zyToggleColumnsModal('dt-testlog')"><i class="fas fa-columns"></i> Columns</button>
            </div>
          </div>
        </div>
        <div id="tp-recent"><div class="zy-loading">Loading recent SMS tests…</div></div>
      </div>
    </div>`;

  const [nums, ranges, logs] = voice
    ? await Promise.all([
        apiFetch(`/api/numbers?agent_id=${AGENT_ID}&limit=100000`),
        apiFetch('/api/numbers/sms-ranges'),
        apiFetch(`/api/sms/logs?agent_id=${AGENT_ID}&limit=500`)
      ])
    : await Promise.all([
        apiFetch('/api/sms/test-numbers?limit=1000'),
        apiFetch('/api/numbers/sms-ranges'),
        apiFetch('/api/sms/test-logs?limit=1000')
      ]);
  ZY_RANGES = zyList(ranges);
  ZY_S2['tp-range'].items = ZY_RANGES.map(r => r.range_name || r.name || r.country || '');

  if (voice) {
    ZY_TESTNUMS = zyList(nums).map(n => [
      n.range_name || n.range_label || n.range || (n.country && n.provider && n.provider !== 'Manual' ? `${n.country} ${n.provider}` : (n.country || '—')), n.prefix || '', n.number || '',
      n.payout != null && n.payout !== '' ? n.payout : 'Ask',
      { v: '', h: `SD : <b>${n.sms_daily || 0}</b> | SW : <b>${n.sms_weekly || 0}</b>` }
    ]);
    document.getElementById('tp-nums-wrap').innerHTML = zyDT2('dt-testnums', {
      cols: ['Range', 'Prefix', 'Test Number', 'Payout', 'Limits'], rows: ZY_TESTNUMS });
    zy2Render('dt-testnums');

    const rows = zyList(logs).map(s => [
      zyDateOnly(s.timestamp), s.range_name || s.range_label || s.range || (s.country && s.provider && s.provider !== 'Manual' ? `${s.country} ${s.provider}` : (s.country || '—')),
      s.number || '', zyMaskCli(s.cli || s.app), s.message ? 'XXXXX' : ''
    ]);
    document.getElementById('tp-recent').innerHTML = zyDT2('dt-testlog', {
      cols: ['Date', 'Range', 'Number', 'CLI', 'SMS'], rows, sort: 0, dir: -1 });
    zy2Render('dt-testlog');
    return;
  }

  ZY_TESTNUMS = zyList(nums).map(n => [
    n.range_name || n.range_label || n.range || (n.country ? `${n.country}` : '—'),
    n.prefix || (n.number ? n.number.slice(0, 4) : '—'),
    { v: n.number || '', h: `<span class="monospace fw-600">${n.number || '—'}</span>` },
    { v: '', h: `<span style="font-size:11px;color:#64748b;">SD: <b>${n.sms_daily || 0}</b> | SW: <b>${n.sms_weekly || 0}</b></span>` }
  ]);
  document.getElementById('tp-nums-wrap').innerHTML = zyDT2('dt-testnums', {
    cols: ['Range', 'Prefix', 'Test Number', 'Limits'], rows: ZY_TESTNUMS });
  zy2Render('dt-testnums');

  const mask = s => String(s || '').replace(/./g, '*').slice(0, 6);
  const rows = zyList(logs).map(s => [
    zyDateOnly(s.timestamp), s.range_name || s.range_label || s.range || (s.country ? `${s.country}` : '—'),
    { v: s.number || '', h: `<span class="monospace">${s.number || '—'}</span>` },
    { v: s.cli || '', h: `<span class="monospace">${zyMaskCli(s.cli)}</span>` },
    mask(s.message)
  ]);
  document.getElementById('tp-recent').innerHTML = zyDT2('dt-testlog', {
    cols: ['Date', 'Range', 'Number', 'CLI', 'SMS'], rows, sort: 0, dir: -1 });
  zy2Render('dt-testlog');
}
function zyTestFilter() {
  const q = zyS2Value('tp-range').toLowerCase();
  const t = ZYT2['dt-testnums']; if (!t) return;
  t.rows = q ? ZY_TESTNUMS.filter(r => String(zyCell2(r[0]).v).toLowerCase().includes(q)) : ZY_TESTNUMS;
  t.page = 1; zy2Render('dt-testnums');
}
function zyTestFilterLimit(lim) {
  const t = ZYT2['dt-testnums']; if (!t) return;
  t.perPage = lim === 'all' ? 100000 : parseInt(lim, 10);
  t.page = 1; zy2Render('dt-testnums');
}
function zyTestLogLimit(lim) {
  const t = ZYT2['dt-testlog']; if (!t) return;
  t.perPage = lim === 'all' ? 100000 : parseInt(lim, 10);
  t.page = 1; zy2Render('dt-testlog');
}

/* ═══ BULK ADD ══════════════════════════════════════════════ */
/* ═══ BULK ADD NUMBERS QUEUE (V6) ═══════════════════════════ */
window._zyBulkJobsQueue = window._zyBulkJobsQueue || [];

async function pgBulkAdd() {
  const c = document.getElementById('page-content');
  zyCrumb(['SMS Module', 'Bulk Add']);

  c.innerHTML = `
    <div class="page-header" style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div>
        <div class="page-title" style="font-size:18px;font-weight:800;color:#0f172a;">
          <i class="fas fa-layer-group" style="color:#00a86b;margin-right:6px;"></i> Bulk Allocation to Client
        </div>
        <div class="page-subtitle" style="font-size:12.5px;color:#64748b;">Queue bulk number allocations to clients with instant pool availability checks and live job progress.</div>
      </div>
    </div>
    <div class="apx-card" style="border:1.5px solid #cbd5e1;border-radius:10px;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.04);overflow:hidden;">
      <div class="apx-card-header" style="height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:#f8fafc;border-bottom:1px solid #cbd5e1;">
        <span style="font-weight:700;font-size:13px;color:#1e293b;">
          <i class="fas fa-layer-group" style="color:#00a86b;margin-right:6px;"></i> Bulk Add Numbers to Client
        </span>
        <div id="ba-pool-stat-wrap"></div>
      </div>
      <div class="apx-card-body" style="padding:16px;">
        <div class="zy-bulk-card" style="max-width:680px;margin:10px auto 20px;">
          <div style="display:flex;flex-direction:column;gap:16px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
              <div>
                <label style="display:block;font-size:12px;font-weight:700;margin-bottom:6px;color:var(--sp-text-secondary);">Target Client *</label>
                <select id="ba-client" class="zy-input" style="width:100%;height:38px;border-radius:6px;border:1px solid #cbd5e1;"></select>
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:700;margin-bottom:6px;color:var(--sp-text-secondary);">SMS Range</label>
                <select id="ba-range" class="zy-input" style="width:100%;height:38px;border-radius:6px;border:1px solid #cbd5e1;" onchange="zyUpdateBulkPoolStat()"></select>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
              <div>
                <label style="display:block;font-size:12px;font-weight:700;margin-bottom:6px;color:var(--sp-text-secondary);">Quantity *</label>
                <input type="number" id="ba-count" class="zy-input" value="10" min="1" max="5000" style="width:100%;height:38px;border-radius:6px;border:1px solid #cbd5e1;">
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:700;margin-bottom:6px;color:var(--sp-text-secondary);">Client Payterm *</label>
                <select id="ba-payterm" class="zy-input" style="width:100%;height:38px;border-radius:6px;border:1px solid #cbd5e1;">
                  <option value="Weekly" selected>Weekly (7/1)</option>
                  <option value="Monthly">Monthly (30/30)</option>
                  <option value="7/7">7/7</option>
                  <option value="15/15">15/15</option>
                  <option value="15/30">15/30</option>
                  <option value="Monthly60">Monthly60</option>
                </select>
              </div>
              <div>
                <label style="display:block;font-size:12px;font-weight:700;margin-bottom:6px;color:var(--sp-text-secondary);">Client Rate ($) *</label>
                <input type="number" id="ba-rate" step="0.0001" class="zy-input" value="0.0100" style="width:100%;height:38px;border-radius:6px;border:1px solid #cbd5e1;">
              </div>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding-top:4px;">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;font-weight:600;color:var(--sp-text-secondary);">
                <input type="checkbox" id="ba-random" checked style="accent-color:var(--sp-primary);"> Sort / allocate numbers randomly
              </label>
              <div id="ba-pool-notice" style="font-size:12px;color:var(--sp-text-muted);"></div>
            </div>

            <div style="margin-top:6px;">
              <button class="btn btn-primary" onclick="zySubmitBulkAdd()" style="width:100%;height:42px;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;border-radius:6px;">
                <i class="fas fa-play"></i> Execute Bulk Add Job
              </button>
            </div>
          </div>
        </div>

        <div id="ba-history"></div>
      </div>
    </div>
  `;

  const [clientsRes, rangesRes, numsRes] = await Promise.all([
    zyFillClients('ba-client', 'Select Client'),
    apiFetch('/api/numbers/sms-ranges').catch(() => []),
    apiFetch(`/api/numbers?agent_id=${AGENT_ID}&limit=100000`).catch(() => ({ data: [] }))
  ]);

  const ranges = zyList(rangesRes);
  const el = document.getElementById('ba-range');
  if (el) {
    el.innerHTML = `<option value="">All Available Ranges</option>` +
      ranges.map(r => `<option value="${r.id}">${zyEsc(r.name || r.range_name || r.country || '')}</option>`).join('');
  }

  window._zyAgentPoolNumbers = zyList(numsRes);
  zyUpdateBulkPoolStat();
  zyRenderBulkQueueUi();
}

window.zyUpdateBulkPoolStat = function() {
  const rangeId = document.getElementById('ba-range')?.value;
  const all = window._zyAgentPoolNumbers || [];
  const unassigned = all.filter(n => !n.client_id && (!rangeId || String(n.range_id) === String(rangeId)));

  const wrap = document.getElementById('ba-pool-stat-wrap');
  const notice = document.getElementById('ba-pool-notice');
  const cls = unassigned.length > 20 ? 'high' : unassigned.length > 0 ? 'low' : 'none';

  if (wrap) {
    wrap.innerHTML = `
      <span class="zy-pool-avail-badge ${cls}">
        <i class="fas fa-cubes"></i> Unassigned Pool: <b>${unassigned.length}</b>
      </span>
    `;
  }
  if (notice) {
    notice.innerHTML = `<i class="fas fa-info-circle"></i> <b>${unassigned.length}</b> unassigned numbers ready in selected pool`;
  }
};

window.zyRenderBulkQueueUi = function() {
  const host = document.getElementById('ba-history');
  if (!host) return;
  const all = window._zyAgentPoolNumbers || [];
  const unassigned = all.filter(n => !n.client_id);
  host.innerHTML = zyRenderBulkQueueCard(window._zyBulkJobsQueue, { available: unassigned.length });
};

window.zySubmitBulkAdd = async function() {
  const clientSel = document.getElementById('ba-client');
  const client = clientSel?.value;
  const clientName = clientSel?.options[clientSel.selectedIndex]?.text || `Client #${client}`;
  const rangeSel = document.getElementById('ba-range');
  const range = rangeSel?.value;
  const rangeName = rangeSel?.options[rangeSel.selectedIndex]?.text || 'All Ranges';
  const count = Number(document.getElementById('ba-count')?.value) || 0;
  const payterm = document.getElementById('ba-payterm')?.value || 'Weekly';
  const rate = parseFloat(document.getElementById('ba-rate')?.value) || 0.01;
  const isRandom = document.getElementById('ba-random')?.checked;

  if (!client) { toast('Please select a target client', 'error'); return; }
  if (count <= 0) { toast('Quantity must be greater than 0', 'error'); return; }

  const all = window._zyAgentPoolNumbers || [];
  let pool = all.filter(n => !n.client_id && (!range || String(n.range_id) === String(range)));
  if (isRandom) {
    pool = pool.slice().sort(() => Math.random() - 0.5);
  }

  if (pool.length === 0) {
    toast('No unassigned numbers available in your pool for the selected range', 'error');
    return;
  }

  const toAllocate = pool.slice(0, count);
  const numberIds = toAllocate.map(n => n.id);

  const jobId = 'JOB-' + Math.random().toString(36).slice(2, 7).toUpperCase();
  const newJob = {
    id: jobId,
    client: client,
    client_name: clientName,
    range: range,
    range_name: rangeName,
    requested: count,
    allocated: 0,
    status: 'PROCESSING',
    created_at: new Date().toLocaleTimeString()
  };
  window._zyBulkJobsQueue.unshift(newJob);
  zyRenderBulkQueueUi();

  try {
    const res = await apiFetch('/api/numbers/bulk-assign-many', {
      method: 'POST',
      body: JSON.stringify({
        number_ids: numberIds,
        target_type: 'client',
        target_id: Number(client),
        client_payterm: payterm,
        client_rate: rate,
        notes: `Bulk add job ${jobId}`
      })
    });

    const allocatedCount = (res && res.updated_count) || numberIds.length;
    newJob.allocated = allocatedCount;
    newJob.status = 'COMPLETED';

    // Update in-memory pool
    const assignedSet = new Set(numberIds);
    (window._zyAgentPoolNumbers || []).forEach(n => {
      if (assignedSet.has(n.id)) {
        n.client_id = Number(client);
        n.client_rate = rate;
        n.client_payterm = payterm;
      }
    });

    toast(`Successfully allocated ${allocatedCount} number(s) to ${clientName}!`, 'success');
  } catch (err) {
    newJob.status = 'FAILED';
    console.error('Bulk allocate error:', err);
    toast(err.message || 'Bulk allocate failed', 'error');
  }

  zyUpdateBulkPoolStat();
  zyRenderBulkQueueUi();
};

/* ═══ API TOKENS ═════════════════════════════════════════════ */
async function pgApiTokens() {
  const c = document.getElementById('page-content');
  zyCrumb(['Account', 'REST API']);
  c.innerHTML = `
    <div class="zy-intro">REST API credentials and webhooks for automated SMS and CDR streaming.</div>
    <div class="zy-panel">
      <div class="zy-panel-head">REST API Integration</div>
      <div class="zy-panel-body">
        <div class="sp-card" style="padding:20px;margin-bottom:16px;">
          <h4 style="margin:0 0 10px;font-size:15px;font-weight:700;">API Base Endpoint</h4>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="text" readonly value="${window.location.origin}/api/v1" class="zy-input" style="flex:1;">
            <button class="sp-btn-secondary" onclick="navigator.clipboard.writeText('${window.location.origin}/api/v1');toast('Copied!','success');">Copy</button>
          </div>
        </div>
        <div class="sp-card" style="padding:20px;">
          <h4 style="margin:0 0 10px;font-size:15px;font-weight:700;">Active API Keys</h4>
          <p style="color:var(--sp-text-secondary);font-size:13px;margin-bottom:12px;">Use Bearer auth header: <code>Authorization: Bearer &lt;token&gt;</code></p>
          <div style="display:flex;gap:8px;align-items:center;">
            <input type="text" readonly value="asms_live_${(AGENT_ID || 'agt').slice(0, 8)}_${Date.now().toString(36)}" class="zy-input" style="flex:1;font-family:monospace;">
            <button class="sp-btn-primary" onclick="toast('API key refreshed','success');">Regenerate</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ═══ AUDIT LOGS ═════════════════════════════════════════════ */
async function pgAuditLogs() {
  const c = document.getElementById('page-content');
  zyCrumb(['Account', 'Audit Log']);
  c.innerHTML = `
    <div class="zy-intro">Real-time system audit logs and security events recorded on your account.</div>
    <div class="zy-panel">
      <div class="zy-panel-head">Account Audit Log</div>
      <div class="zy-panel-body"><div class="zy-loading">Loading audit logs…</div></div>
    </div>
  `;
  const res = await apiFetch('/api/audit-logs?limit=50');
  const list = zyList(res);
  const rows = list.map(item => [
    item.created_at || item.timestamp || item.created || '—',
    item.action || item.event || '—',
    item.username || item.actor || 'Agent',
    item.ip || item.ip_address || '—',
    item.details || item.note || item.message || '—'
  ]);
  c.querySelector('.zy-panel-body').innerHTML = zyDT2('dt-auditlogs', {
    cols: ['Date/Time', 'Action', 'User', 'IP Address', 'Details'], rows, sort: 0, dir: -1
  });
  zy2Render('dt-auditlogs');
}

/* ═══ DOWNLINE CLIENT NUMBER REQUESTS ═══════════════════════ */
async function pgClientRequests() {
  const c = document.getElementById('page-content');
  if (typeof zyCrumb === 'function') zyCrumb(['SMS Module', 'Number Requests']);
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Number Requests</div>
        <div class="page-subtitle">Review and fulfill number inventory requests submitted by your downline Clients.</div>
      </div>
    </div>
    <div class="apx-card" style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:10px;overflow:hidden;">
      <div class="apx-card-header" style="height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:#f8fafc;border-bottom:1px solid #cbd5e1;">
        <span style="font-weight:700;font-size:13px;color:#1e293b;">
          <i class="fas fa-inbox" style="color:#2563eb;margin-right:6px;"></i> Downline Number Requests
        </span>
      </div>
      <div class="apx-card-body" id="agt-numreq-host" style="padding:14px;"><div class="zy-loading">Loading requests…</div></div>
    </div>`;
  try {
    const raw = await apiFetch('/api/agent-requests?scope=downline');
    const data = Array.isArray(raw) ? raw : (raw?.data || []);
    const host = document.getElementById('agt-numreq-host');
    if (!host) return;
    if (!data.length) {
      host.innerHTML = '<div style="padding:28px;text-align:center;color:#64748b;">No number requests from your clients yet.</div>';
      return;
    }
    const rows = data.map(r => [
      r.id || '—',
      `<strong>${zyEsc(r.requester_username || r.agent_username || 'Client')}</strong> <span class="badge badge-blue" style="font-size:10px;">${zyEsc(r.requester_role || r.agent_role || 'Client')}</span>`,
      zyEsc(r.range_name || ('Range #' + (r.range_id || '—'))),
      `<span class="badge badge-blue">${r.quantity || 1}</span>`,
      zyEsc(r.notes || '—'),
      `<span class="badge badge-${(r.status || 'pending') === 'fulfilled' ? 'green' : ((r.status || 'pending') === 'rejected' ? 'red' : 'yellow')}">${zyEsc(r.status || 'pending')}</span>`,
      String(r.created_at || r.created || '').replace('T', ' ').slice(0, 16) || '—',
      {
        v: '',
        h: String(r.status || 'pending').toLowerCase() === 'pending'
          ? `<div style="display:inline-flex;gap:4px;">
               <button type="button" class="btn btn-success btn-xs" onclick="zyAgtFulfillReq(${r.id}, ${r.quantity || 1})"><i class="fas fa-check"></i> Fulfill</button>
               <button type="button" class="btn btn-danger btn-xs" onclick="zyAgtRejectReq(${r.id})"><i class="fas fa-times"></i> Reject</button>
             </div>`
          : zyEsc(r.reason || '—')
      }
    ]);
    host.innerHTML = zyDT2('dt-agt-reqs', {
      cols: ['#', 'Requester', 'Range', 'Qty', 'Notes', 'Status', 'Date', 'Actions'],
      rows
    });
    zy2Render('dt-agt-reqs');
  } catch (err) {
    const host = document.getElementById('agt-numreq-host');
    if (host) host.innerHTML = `<div class="text-danger" style="padding:20px;">Failed to load requests: ${zyEsc(err.message)}</div>`;
  }
}

window.zyAgtFulfillReq = async function(id, qty) {
  try {
    const res = await apiFetch(`/api/agent-requests/${id}/fulfill`, {
      method: 'POST',
      body: JSON.stringify({ count: qty })
    });
    if (res && (res.success || !res.error)) {
      if (typeof toast === 'function') toast(res.message || 'Request fulfilled!', 'success');
      pgClientRequests();
    } else {
      if (typeof toast === 'function') toast(res?.error || 'Failed to fulfill request', 'error');
    }
  } catch (err) {
    if (typeof toast === 'function') toast(err.message || 'Failed to fulfill request', 'error');
  }
};

window.zyAgtRejectReq = async function(id) {
  const reason = prompt('Optional rejection reason:') || 'Rejected by Agent';
  try {
    const res = await apiFetch(`/api/agent-requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
    if (res && (res.success || !res.error)) {
      if (typeof toast === 'function') toast('Request rejected', 'info');
      pgClientRequests();
    } else {
      if (typeof toast === 'function') toast(res?.error || 'Failed to reject request', 'error');
    }
  } catch (err) {
    if (typeof toast === 'function') toast(err.message || 'Failed to reject request', 'error');
  }
};

/* ── router ─────────────────────────────────────────────────── */
(function zyHookAgentPages() {
  const map = {
    'dashboard': () => pgDashboard(),
    'sms-ranges': pgSmsRanges, 'sms-overview': pgSmsRanges, 'sms-ratecard': pgSmsRanges, 'payout-rates-view': pgSmsRanges,
    'my-sms-numbers': pgMySmsNumbers,
    'client-requests': pgClientRequests,
    'access-search': pgAccessSearch,
    'news-clients': pgNewsClients, 'notifications': pgNewsClients,
    'my-clients': pgMyClients,
    'bulk-add': pgBulkAdd,
    'api-tokens': () => { if (window.SpeedProfile) window.SpeedProfile.render('page-content', 'api'); else pgApiTokens(); },
    'audit-logs': () => { if (window.SpeedProfile) window.SpeedProfile.render('page-content', 'audit'); else pgAuditLogs(); },
    'profile': () => { if (window.SpeedProfile) window.SpeedProfile.render('page-content', 'details'); else pgProfile(); },
    'detailed-sms': pgDetailedSms, 'summary-sms': pgSummarySms,
    'client-sms-stats': pgClientSmsStats, 'sms-range-stats': pgSmsRangeStats,
    'sms-number-stats': pgSmsNumberStats, 'credit-notes': pgCreditNotes,
    'payment-requests': pgPaymentRequests, 'bank-accounts': pgBankAccounts,
    'usd-statements': () => pgStatements('USD'), 'eur-statements': () => pgStatements('EUR'),
    'gbp-statements': () => pgStatements('GBP'),
    'voice-test-panel': pgVoiceTestPanel, 'sms-test-panel': pgSmsTestPanel
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
      if (typeof zySyncAccordionActive === 'function') zySyncAccordionActive(page);
      if (window.zyCloseSidebar) window.zyCloseSidebar();
      window.scrollTo({ top: 0 });
      try { sessionStorage.setItem('agent_current_page', page); } catch (e) {}
      map[page]();
      return;
    }
    prev(page);
    if (typeof zySyncAccordionActive === 'function') zySyncAccordionActive(page);
    if (window.zyCloseSidebar) window.zyCloseSidebar();
  };
})();
