/* MAIT SMS panel — MANAGER pages. Requires speed-kit.js */

/* ═══ 1. SMS RANGES & RATECARD MASTER CATALOG ═════════════════════════ */
let ZY_RANGE_LIST = [];

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
          Master catalog of active termination ranges, payout schedules (Weekly, Monthly, Bi-Weekly), and live pool numbers.
        </div>
      </div>
    </div>
    <div id="mgr-range-kpis" style="margin-bottom:16px;"><div class="zy-loading">Loading metric summaries…</div></div>
    <div class="apx-card" style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      <div class="apx-card-header" style="height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:#f8fafc;border-bottom:1px solid #cbd5e1;">
        <span style="font-weight:700;font-size:13px;color:#1e293b;">
          <i class="fas fa-table-list" style="color:#0ea5e9;margin-right:6px;"></i> Termination Ranges &amp; Rates
        </span>
        <div style="display:flex;gap:6px;align-items:center;">
          <span id="mgr-mode-badge" class="badge badge-admin-managed" style="font-size:10.5px;padding:2px 8px;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;border-radius:4px;">Loading Policy…</span>
        </div>
      </div>
      <div class="apx-card-body" id="mgr-ranges-table-host" style="padding:14px;"><div class="zy-loading">Loading termination ranges…</div></div>
    </div>`;

  try {
    const [rawRanges, policy] = await Promise.all([
      apiFetch('/api/numbers/sms-ranges'),
      typeof zyFetchAllocPolicy === 'function' ? zyFetchAllocPolicy() : Promise.resolve({ mode: 'request' })
    ]);
    const list = zyList(rawRanges);
    ZY_RANGE_LIST = list;
    window._zyMgrPolicy = policy || { mode: 'request' };
    const isSelfAlloc = window._zyMgrPolicy.mode === 'self_allocate';
    const modeBadge = document.getElementById('mgr-mode-badge');
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
      const w = parseFloat(pts['Weekly'] !== undefined ? pts['Weekly'] : (pts['7/1'] !== undefined ? pts['7/1'] : (r.payout ?? 0))) || 0;
      const m = parseFloat(pts['Monthly'] !== undefined ? pts['Monthly'] : (pts['30/30'] !== undefined ? pts['30/30'] : (pts['Monthly60'] ?? (pts['15/15'] ?? w)))) || 0;
      sumWeekly += w;
      sumMonthly += m;
    });
    const avgWeekly = totalRanges ? (sumWeekly / totalRanges).toFixed(4) : '0.0000';
    const avgMonthly = totalRanges ? (sumMonthly / totalRanges).toFixed(4) : '0.0000';
    const mgrUser = (typeof MANAGER_USER !== 'undefined' && MANAGER_USER) || {};
    const mgrPercent = mgrUser.commission_percent ?? mgrUser.commission_rate ?? 10;

    const kpiEl = document.getElementById('mgr-range-kpis');
    if (kpiEl) {
      kpiEl.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));gap:10px;">
          <div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:8px;padding:10px 14px;box-shadow:0 1px 2px rgba(0,0,0,0.03);">
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Total Ranges</div>
            <div style="font-size:20px;font-weight:800;color:#0f172a;margin-top:2px;">${totalRanges}</div>
            <div style="font-size:11px;color:#10b981;margin-top:2px;">${providers} Unique Provider(s)</div>
          </div>
          <div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:8px;padding:10px 14px;box-shadow:0 1px 2px rgba(0,0,0,0.03);">
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Manager Commission</div>
            <div style="font-size:20px;font-weight:800;color:#2563eb;margin-top:2px;">${mgrPercent}%</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;">Earned on Assigned Traffic</div>
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
      const rName = r.name || r.range_name || `${r.country || ''} ${r.provider || ''}`.trim() || '—';
      const pts = r.payterms || {};
      const weeklyRate = pts['Weekly'] !== undefined ? pts['Weekly'] : (pts['7/1'] !== undefined ? pts['7/1'] : (r.payout ?? 0));
      const monthlyRate = pts['Monthly'] !== undefined ? pts['Monthly'] : (pts['30/30'] !== undefined ? pts['30/30'] : (pts['Monthly60'] ?? (pts['15/15'] ?? weeklyRate)));
      const curr = r.currency || 'USD';
      const currSym = curr === 'EUR' ? '€' : (curr === 'GBP' ? '£' : '$');
      const clis = r.cli_list || (Array.isArray(r.clis) && r.clis.length ? r.clis.join(', ') : (r.cli || 'All CLIs'));
      const qty = r.numbers_count || r.qty || 0;
      const free = r.free_count !== undefined ? r.free_count : qty;

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
        `<span style="font-family:monospace;font-size:11.5px;"><b>${qty}</b> / <span style="color:#10b981;font-weight:700;">${free}</span></span>`,
        { v: '', h: `<div style="display:inline-flex;align-items:center;gap:4px;">
          <button type="button" class="apx-btn apx-btn-icon apx-btn-small" style="color:#0284c7;border-color:#bae6fd;background:#f0f9ff;" onclick="zyViewManagerRange(${i})" title="View Details"><i class="fas fa-eye"></i></button>
          ${isSelfAlloc
            ? `<button type="button" class="apx-btn apx-btn-small" style="color:#059669;border-color:#a7f3d0;background:#ecfdf5;" onclick="zyOpenSelfAllocateModal('${zyEsc(rName)}', ${r.id}, window._zyMgrPolicy, pgSmsRanges)" title="Self-Allocate Numbers"><i class="fas fa-bolt"></i> Self-Allocate</button>`
            : `<button type="button" class="apx-btn apx-btn-small" style="color:#2563eb;border-color:#bfdbfe;background:#eff6ff;" onclick="zyOpenRequestNumbersModal('${zyEsc(rName)}', ${r.id}, window._zyMgrPolicy, pgSmsRanges)" title="Request Numbers"><i class="fas fa-phone-volume"></i> Request</button>`}
        </div>` }
      ];
    });

    const host = document.getElementById('mgr-ranges-table-host');
    if (host) {
      host.innerHTML = zyDT2('dt-ranges', {
        cols: ['#', 'Provider', 'Name', 'Prefix', 'Active', 'Currency', 'Payterm', 'Weekly (7/1)', 'Monthly (30/30)', 'Qty / Free', 'Actions'],
        rows
      });
      zy2Render('dt-ranges');
    }
  } catch (err) {
    console.error('Failed to load ranges:', err);
    const host = document.getElementById('mgr-ranges-table-host');
    if (host) host.innerHTML = `<div class="text-danger" style="padding:20px;text-align:center;">Failed to load SMS Ranges: ${zyEsc(err.message || 'Network error')}</div>`;
  }
}

/* 3-Column Range Specification Modal matching Owner Layout */
function zyViewManagerRange(i) {
  const r = ZY_RANGE_LIST[i] || {};
  const rName = r.name || r.range_name || `${r.country || ''} ${r.provider || ''}`.trim() || 'Details';
  const pts = r.payterms || {};
  const dailyVal = pts['Daily'] !== undefined ? pts['Daily'] : (pts['1/1'] !== undefined ? pts['1/1'] : (r.payout ?? 0));
  const weeklyVal = pts['Weekly'] !== undefined ? pts['Weekly'] : (pts['7/1'] !== undefined ? pts['7/1'] : (r.payout ?? 0));
  const biweekly15 = pts['15/15'] !== undefined ? pts['15/15'] : weeklyVal;
  const biweekly30 = pts['15/30'] !== undefined ? pts['15/30'] : weeklyVal;
  const monthlyVal = pts['Monthly'] !== undefined ? pts['Monthly'] : (pts['30/30'] !== undefined ? pts['30/30'] : weeklyVal);
  const monthly60 = pts['Monthly60'] !== undefined ? pts['Monthly60'] : monthlyVal;
  const curr = r.currency || 'USD';
  const currSym = curr === 'EUR' ? '€' : (curr === 'GBP' ? '£' : '$');
  const clis = r.cli_list || (Array.isArray(r.clis) && r.clis.length ? r.clis.join(', ') : (r.cli || 'All CLIs'));
  const qty = r.numbers_count || r.qty || 0;
  const free = r.free_count !== undefined ? r.free_count : qty;

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
          <div><span style="color:#64748b;">Total Numbers:</span> <b>${qty}</b></div>
          <div><span style="color:#64748b;">Free in Pool:</span> <b style="color:#10b981;">${free}</b></div>
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
     ${(window._zyMgrPolicy && window._zyMgrPolicy.mode === 'self_allocate')
       ? `<button class="zy-btn-blue" onclick="closeModal();zyOpenSelfAllocateModal('${zyEsc(rName)}', ${r.id}, window._zyMgrPolicy, pgSmsRanges)"><i class="fas fa-bolt"></i> Self-Allocate Numbers</button>`
       : `<button class="zy-btn-blue" onclick="closeModal();zyOpenRequestNumbersModal('${zyEsc(rName)}', ${r.id}, window._zyMgrPolicy, pgSmsRanges)"><i class="fas fa-phone-volume"></i> Request Numbers</button>`}`);
}

/* Backward compatibility for blue eye button */
function zyRangeMemo(i) {
  zyViewManagerRange(i);
}

/* Unified Rate Card handler matching Owner Catalog */
async function pgRateCard() {
  await pgSmsRanges();
}
window.pgManagerRateCard = pgSmsRanges;

/* ═══ 2. SMS NUMBERS ════════════════════════════════════════ */
let ZY_RANGES = [], ZY_AGENTS = [], ZY_ALL_NUMS = [];
async function pgSmsNumbers() {
  const c = document.getElementById('page-content');
  zyCrumb(['IPRN SMS Module', 'SMS Numbers']);
  c.innerHTML = `
    <div class="page-header" style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div>
        <div class="page-title" style="font-size:18px;font-weight:800;color:#0f172a;">
          <i class="fas fa-hashtag" style="color:#10b981;margin-right:6px;"></i> My SMS Numbers Pool
        </div>
        <div class="page-subtitle" style="font-size:12.5px;color:#64748b;">
          Manage numbers in your Manager pool, allocate to Agents with fixed payout rates, unallocate back to pool, or return to Owner.
        </div>
      </div>
    </div>

    <!-- Filters & Pool Controls with 40px Widget Header -->
    <div class="apx-card" style="margin-bottom:14px;background:#ffffff;border:1.5px solid #cbd5e1;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      <div class="apx-card-header" style="height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:#f8fafc;border-bottom:1px solid #cbd5e1;">
        <span style="font-weight:700;font-size:13px;color:#1e293b;">
          <i class="fas fa-filter" style="color:#0284c7;margin-right:6px;"></i> Filters &amp; Pool Controls
        </span>
        <div style="display:flex;gap:6px;align-items:center;">
          <button type="button" class="btn btn-primary btn-sm" onclick="zyAllocateAll()">
            <i class="fas fa-user-plus"></i> Allocate
          </button>
          <button type="button" class="btn btn-warning btn-sm" onclick="zyUnassignSelected()">
            <i class="fas fa-rotate-left"></i> Unallocate
          </button>
          <button type="button" class="btn btn-danger btn-sm" onclick="zyReturnSelected()">
            <i class="fas fa-arrow-up"></i> Return
          </button>
        </div>
      </div>
      <div class="apx-card-body" style="padding:14px;">
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;align-items:flex-end;">
          <div>
            <label class="zy-filter-label" for="num-range-sel" style="font-size:11.5px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;display:block;">Range</label>
            <select id="num-range-sel" class="zy-compact-box" style="width:100%;height:38px;border-radius:6px;border:1.5px solid #cbd5e1;padding:0 10px;font-size:13px;background:#ffffff;box-sizing:border-box;" onchange="zyNumFilter()">
              <option value="">All Ranges</option>
            </select>
          </div>
          <div>
            <label class="zy-filter-label" for="num-agent" style="font-size:11.5px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;display:block;">Agent</label>
            <select id="num-agent" class="zy-compact-box" style="width:100%;height:38px;border-radius:6px;border:1.5px solid #cbd5e1;padding:0 10px;font-size:13px;background:#ffffff;box-sizing:border-box;" onchange="zyNumFilter()">
              <option value="">All Agents</option>
            </select>
          </div>
          <div>
            <label class="zy-filter-label" for="num-status" style="font-size:11.5px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;display:block;">Status</label>
            <select id="num-status" class="zy-compact-box" style="width:100%;height:38px;border-radius:6px;border:1.5px solid #cbd5e1;padding:0 10px;font-size:13px;background:#ffffff;box-sizing:border-box;" onchange="zyNumFilter()">
              <option value="">All Statuses</option>
              <option value="unassigned">In Manager Pool</option>
              <option value="assigned">Assigned to Agent</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label class="zy-filter-label" for="num-filter" style="font-size:11.5px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;display:block;">Search Number</label>
            <input type="text" id="num-filter" class="zy-compact-box" placeholder="e.g. 447123…" style="width:100%;height:38px;border-radius:6px;border:1.5px solid #cbd5e1;padding:0 10px;font-size:13px;background:#ffffff;box-sizing:border-box;" onkeyup="if(event.key==='Enter')zyNumFilter()">
          </div>
        </div>
        <div class="zy-filter-actions" style="display:flex;gap:8px;align-items:center;margin-top:14px;flex-wrap:wrap;">
          <button type="button" class="zy-btn-blue-solid" style="height:38px;padding:0 20px;font-size:12.5px;font-weight:700;border-radius:6px;display:inline-flex;align-items:center;gap:6px;background:#2563eb;color:#ffffff;border:none;cursor:pointer;" onclick="zyNumFilter()">
            <i class="fas fa-filter"></i> Apply Filter
          </button>
          <button type="button" class="zy-btn-amber" style="height:38px;padding:0 18px;font-size:12.5px;font-weight:700;border-radius:6px;background:#64748b;color:#ffffff;border:1px solid #475569;cursor:pointer;display:inline-flex;align-items:center;gap:6px;" onclick="zyResetNumFilter()" title="Reset Filters">
            <i class="fas fa-undo"></i> Reset Filters
          </button>
        </div>
      </div>
    </div>

    <!-- Numbers Table Panel with 40px Widget Header -->
    <div class="apx-card" style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      <div class="apx-card-header" style="height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:#f8fafc;border-bottom:1px solid #cbd5e1;">
        <span style="font-weight:700;font-size:13px;color:#1e293b;">
          <i class="fas fa-list-ol" style="color:#0ea5e9;margin-right:6px;"></i> Allocated &amp; Pool Numbers
        </span>
        <span id="dt-num-count-badge" class="badge badge-blue" style="font-size:11px;">Loading…</span>
      </div>
      <div class="apx-card-body" id="mgr-numbers-table-host" style="padding:14px;"><div class="zy-loading">Loading numbers pool…</div></div>
    </div>
    ${typeof zyRenderFab === 'function' ? zyRenderFab('Need numbers? Tap here', 'zyAllocateAll()') : ''}`;

  const [nums, ranges, agents] = await Promise.all([
    apiFetch(`/api/numbers?manager_id=${MANAGER_ID}&limit=100000`),
    apiFetch('/api/numbers/sms-ranges'),
    apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=200`)
  ]);
  ZY_RANGES = zyList(ranges); ZY_AGENTS = zyList(agents);
  const data = (nums && nums.data) || [];
  ZY_ALL_NUMS = data;

  const badge = document.getElementById('dt-num-count-badge');
  if (badge) badge.textContent = `${data.length} Total Numbers`;

  const rangeSel = document.getElementById('num-range-sel');
  if (rangeSel) {
    const seenR = new Set();
    const heldRanges = [];
    data.forEach(n => {
      const rName = n.range_name || n.range_label || n.range || (n.country && n.provider ? `${n.country} ${n.provider}` : n.country) || '';
      if (rName && !seenR.has(rName)) {
        seenR.add(rName);
        heldRanges.push(rName);
      }
    });
    rangeSel.innerHTML = `<option value="">All Ranges</option>` + heldRanges.map(rName => `<option value="${zyEsc(rName)}">${zyEsc(rName)}</option>`).join('');
  }
  const agentSel = document.getElementById('num-agent');
  if (agentSel) {
    agentSel.innerHTML = `<option value="">All Agents</option>` + ZY_AGENTS.map(a => `<option value="${a.id}">${zyEsc(a.username)}</option>`).join('');
  }

  const agentName = id => (ZY_AGENTS.find(a => String(a.id) === String(id)) || {}).username || '';
  const rows = data.map(n => {
    const rInfo = (n.range_id && ZY_RANGES.find(rg => rg.id === n.range_id)) || ZY_RANGES.find(rg => rg.range_name && rg.range_name === n.range_name) || ZY_RANGES.find(rg => rg.country === n.country && (rg.provider === n.provider || !n.provider));
    const rDisplayName = n.range_name || n.range_label || n.range || (rInfo && (rInfo.range_name || rInfo.name)) || (n.country && n.provider && n.provider !== 'Manual' ? `${n.country} ${n.provider}` : (n.country || '—'));
    const isAssigned = !!n.agent_id;
    const numHtml = typeof zyRenderNumberCopyBox === 'function'
      ? zyRenderNumberCopyBox(n.number)
      : (n.number ? `<span style="font-family:monospace;font-weight:600;color:var(--brand-primary,#166534);">${zyEsc(n.number)}</span>` : '—');

    const r = [
      rDisplayName,
      n.prefix || '',
      { v: n.number || '', h: numHtml },
      { v: agentName(n.agent_id), h: agentName(n.agent_id) ? `<span style="font-weight:600;color:#1e293b;">${zyEsc(agentName(n.agent_id))}</span>` : '<span style="color:#64748b;font-style:italic;">In Manager Pool</span>' },
      n.payout != null ? `$ ${n.payout}` : (n.agent_rate != null ? `$ ${n.agent_rate}` : '—'),
      { v: '', h: `SD : <b>${n.sd_limit != null ? n.sd_limit : 0}</b> | SW : <b>${n.sw_limit != null ? n.sw_limit : 0}</b>` },
      { v: '', h: `<div style="display:inline-flex;gap:4px;align-items:center;">` +
        (isAssigned
          ? `<button type="button" class="apx-btn apx-btn-icon apx-btn-small" style="color:#d97706;border-color:#fde68a;background:#fffbeb;" onclick="zyUnassignOne(${n.id})" title="Unallocate back to Manager pool"><i class="fas fa-rotate-left"></i></button>`
          : `<button type="button" class="apx-btn apx-btn-icon apx-btn-small" style="color:#2563eb;border-color:#bfdbfe;background:#eff6ff;" onclick="zyAllocateOne(${n.id})" title="Allocate to Agent"><i class="fas fa-user-plus"></i></button>`) +
        `<button type="button" class="apx-btn apx-btn-icon apx-btn-small" style="color:#dc2626;border-color:#fecaca;background:#fef2f2;" onclick="zyReturnOne(${n.id})" title="Return to Owner pool"><i class="fas fa-arrow-up"></i></button>` +
        `</div>` }
    ];
    r.__id = n.id; return r;
  });
  ZY_NUMROWS = rows;
  const host = document.getElementById('mgr-numbers-table-host');
  if (host) {
    host.innerHTML = zyDT2('dt-numbers', { cols: ['Range', 'Prefix', 'Number', 'Agent', 'Payout', 'Limits', 'Action'], rows, check: true });
    zy2Render('dt-numbers');
  }
}

function zyAllocateAll() {
  const ids = zy2Checked('dt-numbers');
  const t = ZYT2['dt-numbers'];
  const picked = t.rows.filter(r => ids.includes(String(r.__id))).map(r => zyCell2(r[2]).v);
  zyModal('Allocate Numbers to Agent', `
    <label class="zy-lbl">Numbers</label>
    <div class="zy-numlist" style="max-height:80px;overflow-y:auto;background:#f8fafc;padding:6px;border-radius:4px;font-size:12px;margin-bottom:10px;">${picked.length ? picked.join(', ') : 'No numbers selected'}</div>
    <label class="zy-lbl">Select Agent</label>
    ${zySelectSearch('al-agent', 'Search agents…')}
    <select id="al-agent" class="zy-input"><option value="">Please Select</option>
      ${ZY_AGENTS.map(a => `<option value="${a.id}">${zyEsc(a.username)}</option>`).join('')}</select>
    <label class="zy-lbl">Payterm</label>
    <select id="al-pay" class="zy-input">
      <option value="Weekly">Weekly</option>
      <option value="1/1">1/1</option>
      <option value="7/1">7/1</option>
      <option value="7/7">7/7</option>
      <option value="15/15">15/15</option>
      <option value="15/30">15/30</option>
      <option value="Monthly60">Monthly60</option>
    </select>
    <p style="font-size:12px;color:#64748b;margin-top:10px;">Payout rate is fixed by the Owner rate card (no edit controls).</p>`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="zy-btn-blue" onclick="zyDoAllocate(${JSON.stringify(ids).replace(/"/g, '&quot;')})">Allocate</button>`);
}

async function zyDoAllocate(ids) {
  const agent = document.getElementById('al-agent').value;
  const payterm = document.getElementById('al-pay')?.value || 'Weekly';
  if (!agent) { toast('Select an agent', 'error'); return; }
  if (!ids.length) { toast('No numbers selected', 'error'); return; }
  await apiFetch('/api/numbers/bulk-assign-many', {
    method: 'POST', body: JSON.stringify({ number_ids: ids.map(Number), agent_id: Number(agent), target_type: 'agent', target_id: Number(agent), payterm })
  });
  closeModal(); toast('Numbers allocated to agent', 'success'); loadPage('my-numbers');
}

function zyAllocateOne(numberId) {
  const n = (ZY_ALL_NUMS || []).find(x => x.id === numberId) || {};
  zyModal(`Allocate Number — ${n.number || numberId}`, `
    <label class="zy-lbl">Select Agent</label>
    ${zySelectSearch('al-single-agent', 'Search agents…')}
    <select id="al-single-agent" class="zy-input"><option value="">Please Select</option>
      ${ZY_AGENTS.map(a => `<option value="${a.id}">${zyEsc(a.username)}</option>`).join('')}</select>
    <label class="zy-lbl">Payterm</label>
    <select id="al-single-pay" class="zy-input">
      <option value="Weekly">Weekly</option>
      <option value="1/1">1/1</option>
      <option value="7/1">7/1</option>
      <option value="7/7">7/7</option>
      <option value="15/15">15/15</option>
      <option value="15/30">15/30</option>
      <option value="Monthly60">Monthly60</option>
    </select>
    <p style="font-size:12px;color:#64748b;margin-top:10px;">Payout rate is fixed by the Owner rate card.</p>`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="zy-btn-blue" onclick="zyDoAllocateOne(${numberId})">Allocate</button>`);
}

async function zyDoAllocateOne(numberId) {
  const agent = document.getElementById('al-single-agent').value;
  const payterm = document.getElementById('al-single-pay').value || 'Weekly';
  if (!agent) { toast('Select an agent', 'error'); return; }
  const res = await apiFetch(`/api/numbers/${numberId}/assign`, {
    method: 'POST', body: JSON.stringify({ target_type: 'agent', target_id: Number(agent), payterm })
  });
  if (res && res.error) {
    toast(res.error, 'error');
  } else {
    closeModal(); toast('Number allocated to agent', 'success'); pgSmsNumbers();
  }
}

async function zyUnassignSelected() {
  const ids = zy2Checked('dt-numbers');
  if (!ids.length) { toast('No numbers selected', 'error'); return; }
  await apiFetch('/api/numbers/bulk-unassign-many', { method: 'POST', body: JSON.stringify({ number_ids: ids.map(Number) }) });
  toast('Unallocated back to manager pool', 'success'); loadPage('my-numbers');
}

async function zyUnassignOne(numberId) {
  if (!confirm('Unallocate this number back to your unassigned manager pool?')) return;
  const res = await apiFetch(`/api/numbers/${numberId}/unassign`, { method: 'POST' });
  if (res && (res.success || res.id)) {
    toast('Number unallocated back to manager pool', 'success');
    pgSmsNumbers();
  } else {
    toast(res?.error || 'Failed to unallocate number', 'error');
  }
}

async function zyReturnSelected() {
  const ids = zy2Checked('dt-numbers');
  if (!ids.length) { toast('No numbers selected', 'error'); return; }
  if (!confirm(`Return ${ids.length} selected number(s) to Owner pool?`)) return;
  const res = await apiFetch('/api/numbers/return', {
    method: 'POST',
    body: JSON.stringify({ number_ids: ids.map(Number) })
  });
  if (res && (res.success || res.returned != null)) {
    toast(`Returned ${res.returned || ids.length} number(s) to Owner pool`, 'success');
    pgSmsNumbers();
  } else {
    toast(res?.error || 'Failed to return numbers', 'error');
  }
}

async function zyReturnOne(numberId) {
  if (!confirm('Return this number from your manager pool back to Owner pool?')) return;
  const res = await apiFetch(`/api/numbers/${numberId}/return`, { method: 'POST' });
  if (res && (res.success || res.returned != null)) {
    toast('Number returned to Owner pool', 'success');
    pgSmsNumbers();
  } else {
    toast(res?.error || 'Failed to return number', 'error');
  }
}

function zyResetNumFilter() {
  const ag = document.getElementById('num-agent'); if (ag) ag.value = '';
  const st = document.getElementById('num-status'); if (st) st.value = '';
  const nf = document.getElementById('num-filter'); if (nf) nf.value = '';
  const t = ZYT2['dt-numbers']; if (!t) return;
  t.rows = ZY_NUMROWS;
  t.page = 1; zy2Render('dt-numbers');
}

function zyNumFilter() {
  const rangeQ = ((document.getElementById('num-range-sel') || {}).value || (typeof zyS2Value === 'function' ? zyS2Value('num-range') : '')).toLowerCase();
  const agentVal = (document.getElementById('num-agent') || {}).value || '';
  const statusVal = (document.getElementById('num-status') || {}).value || '';
  const numFilter = ((document.getElementById('num-filter') || {}).value || '').trim().toLowerCase();
  const t = ZYT2['dt-numbers']; if (!t) return;

  t.rows = ZY_NUMROWS.filter(r => {
    const rName = String(zyCell2(r[0]).v).toLowerCase();
    const num = String(zyCell2(r[2]).v).toLowerCase();
    const n = (ZY_ALL_NUMS || []).find(x => x.id === r.__id) || {};

    if (rangeQ && !rName.includes(rangeQ)) return false;
    if (numFilter && !num.includes(numFilter)) return false;
    if (agentVal && String(n.agent_id) !== String(agentVal)) return false;
    if (statusVal === 'assigned' && !n.agent_id) return false;
    if ((statusVal === 'free' || statusVal === 'unassigned') && n.agent_id) return false;
    if (statusVal === 'active' && n.status === 'inactive') return false;
    if (statusVal === 'inactive' && n.status !== 'inactive') return false;
    return true;
  });
  t.page = 1; zy2Render('dt-numbers');
}
let ZY_NUMROWS = [];

/* ═══ 3. SMS RATECARD (Handled by pgRateCard at line 216) ══════ */

/* ═══ 4. SMS BULK ALLOCATIONS (2-Column Layout & 1-Click Undo) ═══ */
window._zyMgrBulkData = { ranges: [], agents: [], numbers: [], hist: [], selectedRange: null };

async function pgBulkAllocations() {
  const c = document.getElementById('page-content');
  zyCrumb(['SMS Module', 'SMS Bulk Allocations']);

  c.innerHTML = `
    <div class="page-header" style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div>
        <div class="page-title" style="font-size:18px;font-weight:800;color:#0f172a;">
          <i class="fas fa-layer-group" style="color:#00a86b;margin-right:6px;"></i> SMS Bulk Allocations
        </div>
        <div class="page-subtitle" style="font-size:12.5px;color:#64748b;">Allocate numbers in bulk from your manager pool to any downline Agent with live rollback</div>
      </div>
    </div>

    <!-- 2-COLUMN BULK ALLOCATOR -->
    <div class="two-col" style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:20px;">
      <!-- LEFT COLUMN: Range Selection & Live Rates Preview -->
      <div class="apx-card" style="border:1.5px solid #cbd5e1;border-radius:10px;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.04);overflow:hidden;">
        <div class="apx-card-header" style="height:40px;font-weight:700;font-size:13px;color:#1e293b;padding:0 14px;background:#f8fafc;border-bottom:1px solid #cbd5e1;display:flex;align-items:center;justify-content:space-between;">
          <span><i class="fas fa-layer-group" style="color:#00a86b;margin-right:6px;"></i> 1. Select Range &amp; Payouts</span>
          <span id="ba-range-badge" class="badge badge-blue" style="font-size:11px;">Select Range</span>
        </div>
        <div class="apx-card-body" style="padding:16px;">
          <div style="margin-bottom:14px;">
            <label style="display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:6px;">Choose Active Range *</label>
            <select id="ba-range-select" class="zy-input" style="width:100%;height:38px;border-radius:6px;border:1px solid #cbd5e1;padding:0 10px;font-size:13px;" onchange="zyOnMgrRangeChange()">
              <option value="">Loading ranges…</option>
            </select>
          </div>

          <!-- Live Rates Box -->
          <div id="ba-rates-box" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:14px;">
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">
              <i class="fas fa-tag" style="margin-right:4px;"></i> Schedule Rates Preview
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div style="background:#ffffff;border:1px solid #cbd5e1;border-radius:6px;padding:10px;">
                <div style="font-size:11px;color:#64748b;font-weight:600;">Weekly (7/1) Rate</div>
                <div id="ba-rate-weekly" style="font-size:16px;font-weight:800;color:#2563eb;">—</div>
                <div id="ba-share-weekly" style="font-size:10.5px;color:#059669;font-weight:600;margin-top:2px;">Share: —</div>
              </div>
              <div style="background:#ffffff;border:1px solid #cbd5e1;border-radius:6px;padding:10px;">
                <div style="font-size:11px;color:#64748b;font-weight:600;">Monthly (30/30) Rate</div>
                <div id="ba-rate-monthly" style="font-size:16px;font-weight:800;color:#7c3aed;">—</div>
                <div id="ba-share-monthly" style="font-size:10.5px;color:#059669;font-weight:600;margin-top:2px;">Share: —</div>
              </div>
            </div>
          </div>

          <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:12.5px;font-weight:600;color:#065f46;"><i class="fas fa-check-circle" style="color:#059669;margin-right:6px;"></i> Free Numbers in Range:</span>
            <strong id="ba-avail-count" style="font-size:15px;color:#047857;">0 free</strong>
          </div>
        </div>
      </div>

      <!-- RIGHT COLUMN: Agent Target, Payterm & Quantity -->
      <div class="apx-card" style="border:1.5px solid #cbd5e1;border-radius:10px;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.04);overflow:hidden;">
        <div class="apx-card-header" style="height:40px;font-weight:700;font-size:13px;color:#1e293b;padding:0 14px;background:#f8fafc;border-bottom:1px solid #cbd5e1;display:flex;align-items:center;">
          <i class="fas fa-user-plus" style="color:#2563eb;margin-right:6px;"></i> 2. Target Agent &amp; Allocation
        </div>
        <div class="apx-card-body" style="padding:16px;">
          <div style="margin-bottom:14px;">
            <label style="display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:6px;">Choose Agent *</label>
            <select id="ba-agent-select" class="zy-input" style="width:100%;height:38px;border-radius:6px;border:1px solid #cbd5e1;padding:0 10px;font-size:13px;">
              <option value="">Loading agents…</option>
            </select>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
            <div>
              <label style="display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:6px;">Choose Payterm *</label>
              <select id="ba-pay" class="zy-input" style="width:100%;height:38px;border-radius:6px;border:1px solid #cbd5e1;padding:0 10px;font-size:13px;font-weight:600;">
                <option value="Weekly" selected>Weekly (7/1)</option>
                <option value="Monthly">Monthly (30/30)</option>
                <option value="7/7">7/7</option>
                <option value="15/15">15/15</option>
                <option value="15/30">15/30</option>
                <option value="Monthly60">Monthly60</option>
              </select>
            </div>
            <div>
              <label style="display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:6px;">Quantity to Allocate *</label>
              <input type="number" class="zy-input" id="ba-qty" value="10" min="1" max="10000" style="width:100%;height:38px;border-radius:6px;border:1px solid #cbd5e1;padding:0 10px;font-size:14px;font-weight:700;">
            </div>
          </div>

          <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
            <button type="button" class="btn btn-outline btn-xs" onclick="zySetMaxQty()" style="padding:3px 10px;font-size:11px;font-weight:700;border-radius:6px;color:#2563eb;border-color:#2563eb;">
              Use All Free
            </button>
          </div>

          <div>
            <button type="button" class="btn btn-primary" onclick="zyBulkAllocate()" style="width:100%;height:40px;font-size:13.5px;font-weight:800;border-radius:6px;display:flex;align-items:center;justify-content:center;gap:8px;">
              <i class="fas fa-plus"></i> Allocate Numbers to Agent
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- RECENT ALLOCATIONS HISTORY & 1-CLICK UNDO -->
    <div class="apx-card" style="border:1.5px solid #cbd5e1;border-radius:10px;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.04);overflow:hidden;">
      <div class="apx-card-header" style="height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:#f8fafc;border-bottom:1px solid #cbd5e1;">
        <span style="font-weight:700;font-size:13px;color:#1e293b;">
          <i class="fas fa-history" style="color:#2563eb;margin-right:6px;"></i> Recent Allocation History &amp; Rollback
        </span>
      </div>
      <div class="zy-panel-body" id="ba-recent" style="padding:14px;">
        <div class="zy-loading">Loading history…</div>
      </div>
    </div>
  `;

  // Fetch all dependencies in parallel
  try {
    const [rangesRes, agentsRes, numsRes, rateCardRes] = await Promise.all([
      apiFetch('/api/numbers/sms-ranges').catch(() => []),
      apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=500`).catch(() => ({ data: [] })),
      apiFetch(`/api/numbers?manager_id=${MANAGER_ID}&limit=100000`).catch(() => ({ data: [] })),
      apiFetch('/api/rates/manager-card').catch(() => ({ ranges: [] }))
    ]);

    const ranges = zyList(rangesRes);
    const agents = zyList(agentsRes);
    const numbers = (numsRes?.data || (Array.isArray(numsRes) ? numsRes : [])).filter(n => !n.agent_id && !n.client_id);
    const cardRanges = rateCardRes?.ranges || [];

    window._zyMgrBulkData = { ranges, agents, numbers, cardRanges };

    // Fill Range Select
    const rSelect = document.getElementById('ba-range-select');
    if (rSelect) {
      if (!ranges.length) {
        rSelect.innerHTML = '<option value="">No active ranges configured</option>';
      } else {
        rSelect.innerHTML = ranges.map(r => {
          const avail = numbers.filter(n => (n.range_id && String(n.range_id) === String(r.id)) || (n.country === r.country && n.provider === r.provider)).length;
          return `<option value="${r.id}" data-avail="${avail}">${escapeHtml(r.range_name || r.country || 'Range')} (${avail} available)</option>`;
        }).join('');
      }
    }

    // Fill Agent Select
    const aSelect = document.getElementById('ba-agent-select');
    if (aSelect) {
      if (!agents.length) {
        aSelect.innerHTML = '<option value="">No agents found (Create agent first)</option>';
      } else {
        aSelect.innerHTML = agents.map(a => `<option value="${a.id}">${escapeHtml(a.username || '')}</option>`).join('');
      }
    }

    zyOnMgrRangeChange();
    zyLoadMgrAllocHistory();
  } catch (err) {
    console.error('Bulk allocation init error:', err);
    toast('Failed to initialize bulk allocation: ' + err.message, 'error');
  }
}

window.zyOnMgrRangeChange = function() {
  const rId = document.getElementById('ba-range-select')?.value;
  const d = window._zyMgrBulkData || {};
  const ranges = d.ranges || [];
  const numbers = d.numbers || [];
  const cardRanges = d.cardRanges || [];

  const foundRange = ranges.find(r => String(r.id) === String(rId)) || ranges[0];
  if (!foundRange) return;

  const card = cardRanges.find(c => String(c.id) === String(foundRange.id)) || {};
  const avail = numbers.filter(n => (n.range_id && String(n.range_id) === String(foundRange.id)) || (n.country === foundRange.country && n.provider === foundRange.provider)).length;

  const wRate = Number(card.weekly_rate ?? foundRange.payterms?.Weekly ?? foundRange.rate ?? foundRange.payout ?? 0.01).toFixed(4);
  const mRate = Number(card.monthly_rate ?? foundRange.payterms?.Monthly ?? (Number(wRate) * 1.05)).toFixed(4);
  const wShare = Number(card.manager_weekly_earning ?? card.manager_earning_per_sms ?? 0).toFixed(4);
  const mShare = Number(card.manager_monthly_earning ?? (Number(wShare) * 1.05)).toFixed(4);
  const cur = card.currency || '$';

  const wEl = document.getElementById('ba-rate-weekly');
  const mEl = document.getElementById('ba-rate-monthly');
  const wsEl = document.getElementById('ba-share-weekly');
  const msEl = document.getElementById('ba-share-monthly');
  const cntEl = document.getElementById('ba-avail-count');
  const bEl = document.getElementById('ba-range-badge');

  if (wEl) wEl.textContent = `${cur}${wRate}`;
  if (mEl) mEl.textContent = `${cur}${mRate}`;
  if (wsEl) wsEl.textContent = `My Share: ${cur}${wShare}`;
  if (msEl) msEl.textContent = `My Share: ${cur}${mShare}`;
  if (cntEl) cntEl.textContent = `${avail} numbers free`;
  if (bEl) bEl.textContent = `${foundRange.country || ''} (${avail} free)`;

  window._zyMgrCurrentAvail = avail;
};

window.zySetMaxQty = function() {
  const avail = window._zyMgrCurrentAvail || 0;
  const qEl = document.getElementById('ba-qty');
  if (qEl) qEl.value = Math.max(1, avail);
};

window.zyLoadMgrAllocHistory = async function() {
  const box = document.getElementById('ba-recent');
  if (!box) return;
  box.innerHTML = `<div class="zy-loading">Loading recent allocations…</div>`;

  try {
    const res = await apiFetch('/api/numbers/allocation-history?limit=100');
    const list = (res && res.data) || (Array.isArray(res) ? res : []);

    if (!list.length) {
      box.innerHTML = `
        <div style="padding:40px 20px;text-align:center;color:#64748b;">
          <i class="fas fa-history" style="font-size:32px;color:#94a3b8;margin-bottom:8px;"></i>
          <div style="font-weight:700;font-size:14px;color:#1e293b;">No allocation history yet</div>
          <div style="font-size:12.5px;">Allocate numbers above to see your batch log and 1-click rollback here.</div>
        </div>`;
      return;
    }

    const rows = list.map(h => {
      const isUndone = h.status === 'undone';
      const lastStr = (h.created || h.timestamp || h.date || '').replace('T', ' ').slice(0, 19);
      const toName = h.to_user || h.agent || h.target || 'Agent';
      const rName = h.range_name || 'General Pool';
      const pTerm = h.payterm || 'Weekly (7/1)';
      const countVal = h.count || h.qty_each || h.total || 0;

      const actHtml = `
        <div style="display:inline-flex;gap:4px;align-items:center;">
          <a href="/api/numbers/allocation-history/${h.id}/export?format=txt" class="btn btn-xs btn-outline" download title="Download TXT numbers list">
            <i class="fas fa-file-lines"></i> TXT
          </a>
          <a href="/api/numbers/allocation-history/${h.id}/export?format=csv" class="btn btn-xs btn-outline" download title="Download CSV report">
            <i class="fas fa-file-csv"></i> CSV
          </a>
          ${isUndone
            ? '<span class="badge badge-muted" style="font-size:10px;">Reverted</span>'
            : `<button type="button" class="btn btn-xs btn-danger" onclick="zyUndoAllocation(${h.id}, ${countVal})" title="Revert to Manager Pool">
                 <i class="fas fa-undo"></i> Undo
               </button>`}
        </div>
      `;

      return [
        lastStr,
        `<strong>${escapeHtml(toName)}</strong>`,
        escapeHtml(rName),
        `<span class="badge badge-purple font-bold">${escapeHtml(pTerm)}</span>`,
        `<span class="badge badge-green font-bold" style="font-size:12px;">${countVal}</span>`,
        isUndone ? '<span class="badge badge-red">Undone</span>' : '<span class="badge badge-green">Active</span>',
        { v: '', h: actHtml }
      ];
    });

    box.innerHTML = zyDT2('dt-alloc', {
      cols: ['Date / Time', 'Agent', 'Range', 'Payterm', 'Quantity', 'Status', 'Actions'],
      rows,
      sort: 0,
      dir: -1
    });
    zy2Render('dt-alloc');
  } catch (err) {
    console.error('loadMgrAllocHistory error:', err);
    box.innerHTML = `<div style="padding:20px;text-align:center;color:#ef4444;">Failed to load history: ${escapeHtml(err.message)}</div>`;
  }
};

window.zyBulkAllocate = async function() {
  const rId = document.getElementById('ba-range-select')?.value;
  const agentId = document.getElementById('ba-agent-select')?.value;
  const qty = parseInt(document.getElementById('ba-qty')?.value, 10) || 0;
  const payterm = document.getElementById('ba-pay')?.value || 'Weekly';

  if (!agentId) { toast('Please select an agent', 'warning'); return; }
  if (!qty || qty <= 0) { toast('Please enter a valid quantity', 'warning'); return; }

  try {
    toast('Allocating numbers…', 'info');
    const res = await apiFetch('/api/numbers/bulk-allocate', {
      method: 'POST',
      body: JSON.stringify({
        target_type: 'agent',
        target_id: Number(agentId),
        range_id: rId ? Number(rId) : null,
        count: qty,
        payterm,
        notes: `Bulk allocation of ${qty} numbers (${payterm})`
      })
    });

    if (res && (res.success || !res.error)) {
      toast(`Successfully allocated ${qty} numbers!`, 'success');
      pgBulkAllocations();
    } else {
      toast(res?.error || 'Failed to allocate numbers', 'error');
    }
  } catch (err) {
    console.error('zyBulkAllocate error:', err);
    toast('Error: ' + err.message, 'error');
  }
};

window.zyUndoAllocation = async function(id, count) {
  if (!confirm(`Are you sure you want to revert allocation #${id} (${count} numbers)? These numbers will be immediately returned to your available Manager pool.`)) {
    return;
  }
  try {
    toast('Reverting allocation…', 'info');
    const res = await apiFetch(`/api/numbers/allocation-history/${id}/undo`, { method: 'POST' });
    if (res && res.success) {
      toast(res.message || 'Allocation reverted successfully!', 'success');
      pgBulkAllocations();
    } else {
      toast(res?.error || 'Failed to revert allocation', 'error');
    }
  } catch (err) {
    console.error('zyUndoAllocation error:', err);
    toast('Error: ' + err.message, 'error');
  }
};

/* ═══ 5. AGENTS ═════════════════════════════════════════════ */
async function pgAgentsList() {
  const c = document.getElementById('page-content');
  zyCrumb(['Users Master', 'Agents']);
  c.innerHTML = `
    <div class="page-header" style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div>
        <div class="page-title" style="font-size:18px;font-weight:800;color:#0f172a;">
          <i class="fas fa-user-tie" style="color:#2563eb;margin-right:6px;"></i> Manage Downline Agents
        </div>
        <div class="page-subtitle" style="font-size:12.5px;color:#64748b;">Create and manage Agents, allocate number pools, configure server routing IPs, and track token security.</div>
      </div>
      <div class="page-actions" style="display:flex;gap:8px;">
        <button class="btn btn-primary btn-sm" onclick="zyAddAgentModal()"><i class="fas fa-user-plus"></i> Add Agent</button>
      </div>
    </div>
    <div class="apx-card" style="border:1.5px solid #cbd5e1;border-radius:10px;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.04);overflow:hidden;">
      <div class="apx-card-header" style="height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:#f8fafc;border-bottom:1px solid #cbd5e1;">
        <span style="font-weight:700;font-size:13px;color:#1e293b;">
          <i class="fas fa-users" style="color:#2563eb;margin-right:6px;"></i> Agents Master Directory
        </span>
        <span id="dt-agents-count-badge" class="badge badge-blue" style="font-size:11px;">Loading…</span>
      </div>
      <div class="apx-card-body" id="mgr-agents-table-host" style="padding:14px;"><div class="zy-loading">Loading agents…</div></div>
    </div>`;

  const res = await apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=500`);
  ZY_AGENT_LIST = (res && res.data) || [];
  const badge = document.getElementById('dt-agents-count-badge');
  if (badge) badge.textContent = `${ZY_AGENT_LIST.length} Registered Agent(s)`;

  const rows = ZY_AGENT_LIST.map((a, idx) => {
    const r = [
      `<strong class="monospace">#${idx + 1}</strong>`,
      a.username || '', a.full_name || '', a.email || '', a.phone || '', a.skype_id || '',
      { v: a.status === 'active' ? 'yes' : '', h: zyTick(a.status === 'active') },
      { v: a.verified ? 'yes' : '', h: zyTick(a.verified !== false) },
      a.agent_ip || a.ip || '',
      { v: '', h: `<button class="zy-gentoken" onclick="zyGenToken(${a.id})">Gen Token</button>` },
      { v: '', h: zyRowActions('agent', a.id, true) }];
    r.__id = a.id; return r;
  });
  const host = document.getElementById('mgr-agents-table-host');
  if (host) {
    host.innerHTML = zyDT2('dt-agents', { cols: ['#', 'Username', 'Name', 'Email', 'Contact', 'Skype', 'Active',
                                'Verified', 'IP', 'Token', 'Action'], rows, check: true });
    zy2Render('dt-agents');
  }
}
function zyAddAgentModal() {
  zyModal('Add New Agent', `
    <label class="zy-lbl">Username</label><input class="zy-input" id="na-user" placeholder="Minimum 6 Characters">
    <div id="na-user-feedback" style="margin-top:-6px;margin-bottom:8px;"></div>
    <label class="zy-lbl">Password</label><input class="zy-input" id="na-pass" type="password" placeholder="Minimum 6 Characters">
    <label class="zy-lbl">Email</label><input class="zy-input" id="na-mail" placeholder="abc@xyz.com">
    <label class="zy-lbl">Skype ID</label><input class="zy-input" id="na-skype" placeholder="Skype ID">
    <label class="zy-lbl">Contact No.</label><input class="zy-input" id="na-phone" placeholder="441768499506">
    <label class="zy-lbl">Name</label><input class="zy-input" id="na-name" placeholder="Agent Name">
    <label class="zy-lbl">Company Name</label><input class="zy-input" id="na-company" placeholder="Company Name">
    <label class="zy-lbl">Address</label><textarea class="zy-input zy-area" id="na-addr" placeholder="Address"></textarea>
    <label class="zy-lbl">Country</label>${zyS2('na-country', 'Afghanistan', ZY_COUNTRY_LIST)}
    <label class="zy-lbl">Agent IP (Allocated Numbers will transfer to this IP)</label>
    <input class="zy-input" id="na-ip" placeholder="Enter Server IP">
    <label class="zy-lbl">SMS Delivery URL</label>
    <input class="zy-input" id="na-url" placeholder="https://server1.xyz.com/smsreceiver">`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="zy-btn-blue" id="na-add-btn" onclick="zySaveAgent()">Add</button>`);
  if (typeof setupUsernameAvailabilityCheck === 'function') {
    setupUsernameAvailabilityCheck('na-user', 'na-user-feedback', 'na-add-btn', 'agents');
  }
}
async function zySaveAgent() {
  const p = {
    username: (document.getElementById('na-user')?.value || '').trim(),
    password: document.getElementById('na-pass')?.value || '',
    email: (document.getElementById('na-mail')?.value || '').trim(),
    skype_id: (document.getElementById('na-skype')?.value || '').trim(),
    phone: (document.getElementById('na-phone')?.value || '').trim(),
    full_name: (document.getElementById('na-name')?.value || '').trim(),
    company: (document.getElementById('na-company')?.value || '').trim(),
    address: (document.getElementById('na-addr')?.value || '').trim(),
    country: zyS2Value('na-country'),
    agent_ip: (document.getElementById('na-ip')?.value || '').trim(),
    delivery_url: (document.getElementById('na-url')?.value || '').trim(),
    manager_id: MANAGER_ID
  };
  if (p.username.length < 6 || p.password.length < 6) {
    if (typeof toast === 'function') toast('Username and password need 6+ characters', 'error');
    return;
  }

  // Pre-validate username existence
  try {
    const chk = await fetch(`/api/check-username?username=${encodeURIComponent(p.username)}&table=agents`).then(r => r.json()).catch(() => null);
    if (chk && chk.exists) {
      if (typeof toast === 'function') toast('This username already exists. Please choose a different username.', 'error');
      const uInput = document.getElementById('na-user');
      if (uInput) uInput.style.borderColor = '#ef4444';
      return;
    }
  } catch (_) {}

  try {
    const r = await apiFetch('/api/agents', { method: 'POST', body: JSON.stringify(p) });
    if (r && r.id) {
      closeModal();
      if (typeof zyFlash === 'function') zyFlash('Agent Added.');
      loadPage('agents');
    }
  } catch (err) {
    if (typeof toast === 'function') toast(err.message || 'Failed to add agent', 'error');
  }
}

/* ═══ 6. CLIENTS ════════════════════════════════════════════ */
async function pgClientsList() {
  const c = document.getElementById('page-content');
  zyCrumb(['Users Master', 'Clients']);
  c.innerHTML = `
    <div class="page-header" style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div>
        <div class="page-title" style="font-size:18px;font-weight:800;color:#0f172a;">
          <i class="fas fa-users" style="color:#0ea5e9;margin-right:6px;"></i> Downline Clients Directory
        </div>
        <div class="page-subtitle" style="font-size:12.5px;color:#64748b;">Read-only view of clients created and managed under your Agents, along with account health and status.</div>
      </div>
    </div>
    <div class="apx-card" style="border:1.5px solid #cbd5e1;border-radius:10px;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.04);overflow:hidden;">
      <div class="apx-card-header" style="height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:#f8fafc;border-bottom:1px solid #cbd5e1;">
        <span style="font-weight:700;font-size:13px;color:#1e293b;">
          <i class="fas fa-user-group" style="color:#0ea5e9;margin-right:6px;"></i> Sub-Clients Overview
        </span>
        <span class="badge badge-purple" style="font-size:11px;"><i class="fas fa-shield-halved"></i> Agent Managed</span>
      </div>
      <div class="apx-card-body" id="mgr-clients-table-host" style="padding:14px;"><div class="zy-loading">Loading clients…</div></div>
    </div>`;

  const [cl, ag] = await Promise.all([
    apiFetch(`/api/clients?manager_id=${MANAGER_ID}&limit=500`),
    apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=200`)
  ]);
  ZY_AGENTS = (ag && ag.data) || [];
  const agentName = id => (ZY_AGENTS.find(a => String(a.id) === String(id)) || {}).username || '';
  ZY_CLIENT_LIST = (cl && cl.data) || [];
  const rows = ZY_CLIENT_LIST.map((x, idx) => {
    const r = [
      `<strong class="monospace">#${idx + 1}</strong>`,
      agentName(x.agent_id), x.username || '', x.full_name || '', x.email || '', x.phone || '', x.skype_id || '',
      { v: x.status === 'active' ? 'yes' : '', h: zyTick(x.status === 'active') },
      { v: '', h: zyRowActions('client', x.id, false) }];
    r.__id = x.id; return r;
  });
  const host = document.getElementById('mgr-clients-table-host');
  if (host) {
    host.innerHTML = zyDT2('dt-clients', { cols: ['#', 'Agent', 'Username', 'Name', 'Email', 'Contact', 'Skype', 'Active', 'Action'],
                          rows, check: false, sort: 2 });
    zy2Render('dt-clients');
  }
}
let ZY_AGENT_LIST = [], ZY_CLIENT_LIST = [];

/* Per-row action buttons:
   agents = unassign(X) / view / edit / key / toggle, clients = view / edit / key / toggle */
function zyRowActions(kind, id, withX) {
  const u = zyRowRec(kind, id);
  const isAct = u.status === 'active';
  return (withX ? `<button class="zy-rowbtn" onclick="zyRowUnassign('${kind}',${id})" title="Unassign Numbers">${zyImg('btn_row_x')}</button>` : '') +
    `<button class="zy-rowbtn" onclick="zyRowView('${kind}',${id})" title="View Details"><i class="fas fa-eye" style="color:#2563eb;"></i></button>` +
    `<button class="zy-rowbtn" onclick="zyRowEdit('${kind}',${id})" title="Edit Details"><i class="fas fa-pen" style="color:#059669;"></i></button>` +
    `<button class="zy-rowbtn" onclick="zyRowResetPassword('${kind}',${id},'${zyEsc(u.username||'')}')" title="Reset Password"><i class="fas fa-key" style="color:#d97706;"></i></button>` +
    `<button class="zy-rowbtn" onclick="zyToggleUserStatus('${kind}',${id},'${u.status || 'active'}')" title="${isAct ? 'Deactivate' : 'Activate'}"><i class="fas fa-${isAct ? 'pause' : 'play'}" style="color:${isAct ? '#eab308' : '#16a34a'};"></i></button>`;
}

window.zyRowResetPassword = function(kind, id, username) {
  const table = kind === 'agent' ? 'agents' : 'clients';
  zyModal(`Reset Password — ${username}`, `
    <div style="font-size:13px;color:#64748b;margin-bottom:12px;">Set new password for <strong>${zyEsc(username)}</strong>:</div>
    <label class="zy-lbl">New Password (min 6 characters)</label>
    <input type="password" id="mgr-rp-pass" class="zy-input" placeholder="Minimum 6 characters">
    <label class="zy-lbl" style="margin-top:8px;">Confirm Password</label>
    <input type="password" id="mgr-rp-pass-confirm" class="zy-input" placeholder="Re-enter password">
  `, `
    <button class="zy-btn-grey" onclick="closeModal()">Close</button>
    <button class="zy-btn-blue" onclick="zyDoMgrResetPassword('${table}', ${id})">Update Password</button>
  `);
};

window.zyDoMgrResetPassword = async function(table, id) {
  const p1 = document.getElementById('mgr-rp-pass')?.value || '';
  const p2 = document.getElementById('mgr-rp-pass-confirm')?.value || '';
  if (!p1 || p1.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
  if (p1 !== p2) { toast('Passwords do not match', 'error'); return; }
  try {
    const res = await apiFetch(`/api/${table}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ password: p1 })
    });
    if (res && (res.id || res.success || !res.error)) {
      closeModal();
      toast('✅ Password updated successfully!', 'success');
    } else {
      toast(res?.error || 'Failed to update password', 'error');
    }
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
};

window.zyToggleUserStatus = async function(kind, id, currentStatus) {
  const table = kind === 'agent' ? 'agents' : 'clients';
  const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
  try {
    const res = await apiFetch(`/api/${table}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
    if (res && (res.id || res.success)) {
      toast(`${kind === 'agent' ? 'Agent' : 'Client'} marked as ${newStatus}`, 'success');
      loadPage(kind === 'agent' ? 'agents' : 'clients');
    } else {
      toast(res?.error || 'Failed to update status', 'error');
    }
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
};
const zyRowRec = (kind, id) =>
  (kind === 'agent' ? ZY_AGENT_LIST : ZY_CLIENT_LIST).find(x => String(x.id) === String(id)) || {};

function zyRowView(kind, id) {
  const u = zyRowRec(kind, id);
  const line = (k, v) => `<div class="zy-memo-k">${k}</div><div class="zy-memo-v">${zyEsc(String(v ?? ''))}</div>`;
  zyModal(kind === 'agent' ? 'Agent Details' : 'Client Details',
    line('Username', u.username) + line('Name', u.full_name) + line('Email', u.email) +
    line('Contact No.', u.phone) + line('Skype ID', u.skype_id) + line('Company Name', u.company) +
    line('Address', u.address) + line('Country', u.country) +
    (kind === 'agent' ? line('Agent IP', u.agent_ip || u.ip) + line('SMS Delivery URL', u.delivery_url) : '') +
    line('Status', u.status),
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>`);
}
async function zyRowEdit(kind, id) {
  const u = zyRowRec(kind, id);
  const policy = typeof zyFetchAllocPolicy === 'function' ? await zyFetchAllocPolicy() : {};
  const canConfig = !!policy?.can_configure_downline;
  const inp = (i, l, v, ph) => `<label class="zy-lbl">${l}</label><input class="zy-input" id="${i}" value="${zyEsc(String(v ?? ''))}" placeholder="${ph || ''}">`;
  const allocBlock = canConfig ? `
    <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;margin-top:8px;">
      <div style="font-weight:700;font-size:11.5px;color:#475569;text-transform:uppercase;margin-bottom:6px;">Number Acquisition Policy</div>
      <label class="zy-lbl">Mode</label>
      <select class="zy-input" id="ed-alloc-mode">
        <option value="" ${!u.alloc_mode ? 'selected' : ''}>Inherit Default</option>
        <option value="request" ${u.alloc_mode === 'request' ? 'selected' : ''}>Request Only</option>
        <option value="self_allocate" ${u.alloc_mode === 'self_allocate' ? 'selected' : ''}>Self-Allocate Only</option>
      </select>
      <label class="zy-lbl">Daily Limit (blank = inherit, 0 = unlimited)</label>
      <input class="zy-input" type="number" min="0" id="ed-alloc-daily" value="${u.alloc_daily_limit ?? ''}" placeholder="Inherit">
      <label class="zy-lbl">Total Holding Limit (blank = inherit, 0 = unlimited)</label>
      <input class="zy-input" type="number" min="0" id="ed-alloc-total" value="${u.alloc_total_limit ?? ''}" placeholder="Inherit">
    </div>` : '';
  zyModal(kind === 'agent' ? 'Edit Agent' : 'Edit Client',
    inp('ed-mail', 'Email', u.email, 'abc@xyz.com') +
    inp('ed-skype', 'Skype ID', u.skype_id, 'Skype ID') +
    inp('ed-phone', 'Contact No.', u.phone, '441768499506') +
    inp('ed-name', 'Name', u.full_name, 'Name') +
    inp('ed-company', 'Company Name', u.company, 'Company Name') +
    `<label class="zy-lbl">Address</label><textarea class="zy-input zy-area" id="ed-addr" placeholder="Address">${zyEsc(String(u.address || ''))}</textarea>` +
    `<label class="zy-lbl">Country</label>${zyS2('ed-country', u.country || 'Afghanistan', ZY_COUNTRY_LIST)}` +
    (kind === 'agent' ? inp('ed-ip', 'Agent IP (Allocated Numbers will transfer to this IP)', u.agent_ip || u.ip, 'Enter Server IP') +
                        inp('ed-url', 'SMS Delivery URL', u.delivery_url, 'https://server1.xyz.com/smsreceiver') : '') +
    `<label class="zy-lbl">New Password (optional)</label><input class="zy-input" id="ed-pass" type="password" placeholder="Minimum 6 characters">` +
    allocBlock,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="zy-btn-blue" onclick="zyRowSave('${kind}',${id})">Update</button>`);
}
async function zyRowSave(kind, id) {
  const val = i => (document.getElementById(i) || {}).value || '';
  const newPass = val('ed-pass').trim();
  if (newPass && newPass.length < 6) {
    toast('New password must be at least 6 characters', 'error');
    return;
  }
  const p = { email: val('ed-mail'), skype_id: val('ed-skype'), phone: val('ed-phone'),
              full_name: val('ed-name'), company: val('ed-company'), address: val('ed-addr'),
              country: zyS2Value('ed-country') };
  if (newPass) { p.password = newPass; }
  if (kind === 'agent') { p.agent_ip = val('ed-ip'); p.delivery_url = val('ed-url'); }
  const modeEl = document.getElementById('ed-alloc-mode');
  if (modeEl) {
    const dRaw = document.getElementById('ed-alloc-daily')?.value;
    const tRaw = document.getElementById('ed-alloc-total')?.value;
    p.alloc_mode = modeEl.value || null;
    p.alloc_daily_limit = dRaw !== '' && dRaw !== undefined ? Math.max(0, parseInt(dRaw, 10) || 0) : null;
    p.alloc_total_limit = tRaw !== '' && tRaw !== undefined ? Math.max(0, parseInt(tRaw, 10) || 0) : null;
  }
  await apiFetch(`/api/${kind === 'agent' ? 'agents' : 'clients'}/${id}`, { method: 'PATCH', body: JSON.stringify(p) });
  closeModal(); zyFlash(kind === 'agent' ? 'Agent Updated.' : 'Client Updated.');
  loadPage(kind === 'agent' ? 'agents' : 'clients');
}
function zyRowDelete(kind, id) {
  zyModal('Delete', `<p class="zy-confirm">Delete this ${kind}?</p>`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="zy-btn-red" onclick="zyRowDoDelete('${kind}',${id})">Delete</button>`);
}
async function zyRowDoDelete(kind, id) {
  await apiFetch(`/api/${kind === 'agent' ? 'agents' : 'clients'}/${id}`, { method: 'DELETE' });
  closeModal(); zyFlash(kind === 'agent' ? 'Agent Deleted.' : 'Client Deleted.');
  loadPage(kind === 'agent' ? 'agents' : 'clients');
}
async function zyRowUnassign(kind, id) {
  zyModal('Unassign Numbers', `<p class="zy-confirm">Unassign all numbers of this agent?</p>`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="zy-btn-red" onclick="zyRowDoUnassign(${id})">Unassign</button>`);
}
async function zyRowDoUnassign(id) {
  await apiFetch('/api/numbers/bulk-unassign-many', { method: 'POST', body: JSON.stringify({ agent_id: Number(id) }) });
  closeModal(); zyFlash('Numbers Unassigned.'); loadPage('agents');
}
async function zyGenToken(id) {
  const r = await apiFetch('/api/tokens', { method: 'POST', body: JSON.stringify({ agent_id: Number(id), name: 'Agent Token' }) });
  const tok = (r && (r.token || r.key)) || '';
  zyModal('API Token', `<div class="zy-memo-k">Token (Copy and save now — will not be shown again)</div>
    <div class="zy-memo-v zy-token" style="word-break:break-all;">${zyEsc(tok || 'Could not generate token')}</div>`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     ${tok ? `<button class="zy-btn-green" onclick="navigator.clipboard.writeText('${tok}').then(()=>toast('Copied','success')).catch(()=>toast('Copy failed','error'))">Copy Token</button>` : ''}`);
}

async function zyDeleteChecked(tableId, kind) {
  const ids = zy2Checked(tableId);
  if (!ids.length) { toast('Nothing selected', 'error'); return; }
  zyModal('Delete', `<p class="zy-confirm">Delete ${ids.length} selected ${kind}?</p>`,
    `<button class="zy-btn-grey" onclick="closeModal()">Close</button>
     <button class="zy-btn-red" onclick="zyDoDelete('${kind}',${JSON.stringify(ids).replace(/"/g, '&quot;')})">Delete</button>`);
}
async function zyDoDelete(kind, ids) {
  for (const id of ids) await apiFetch(`/api/${kind}/${id}`, { method: 'DELETE' });
  closeModal(); toast('Deleted', 'success'); loadPage(kind === 'agents' ? 'agents' : 'clients');
}

/* ═══ 7. SMS STATS & REPORTS ════════════════════════════════ */
async function pgSmsReports() {
  const c = document.getElementById('page-content');
  zyCrumb(['SMS Stats & Reports']);
  const today = (typeof zyToday === 'function' ? zyToday() : new Date().toISOString().slice(0, 10));
  const defaultFrom = `${today} 00:00:00`;
  const defaultTo = `${today} 23:59:59`;

  const groupOptions = [
    { id: 'hour', label: 'Hour', val: 'hour' },
    { id: 'date', label: 'Date', val: 'date' },
    { id: 'month', label: 'Month', val: 'month' },
    { id: 'range', label: 'Range', val: 'range' },
    { id: 'agent', label: 'Agent', val: 'agent' },
    { id: 'number', label: 'Number', val: 'number' },
    { id: 'cli', label: 'CLI', val: 'cli' }
  ];

  const groupByHtml = groupOptions.map(g => `
    <label style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:#1e293b;font-weight:600;cursor:pointer;user-select:none;">
      <input type="checkbox" class="grp-chk" value="${g.val}" style="width:17px;height:17px;cursor:pointer;accent-color:#2563eb;">
      <span>${g.label}</span>
    </label>
  `).join('');

  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title"><i class="fas fa-chart-column" style="color:#2563eb;"></i> SMS Stats &amp; Reports</div>
        <div class="page-subtitle">Here you can view all call detail records, traffic stats, and export reports.</div>
      </div>
    </div>

    <!-- Day-to-Day Style Compact Filter Boxes -->
    <div class="zy-compact-filter-card">
      <div class="zy-compact-boxes-grid">
        <input type="text" id="rp-from" class="zy-compact-box" value="${defaultFrom}" placeholder="YYYY-MM-DD HH:mm:ss" onclick="if(window.zyOpenDatePicker)window.zyOpenDatePicker(this)" style="cursor:pointer;">
        <input type="text" id="rp-to" class="zy-compact-box" value="${defaultTo}" placeholder="YYYY-MM-DD HH:mm:ss" onclick="if(window.zyOpenDatePicker)window.zyOpenDatePicker(this)" style="cursor:pointer;">

        <select id="rp-range" class="zy-compact-box">
          <option value="">Filter Range</option>
        </select>

        <select id="rp-agent" class="zy-compact-box">
          <option value="">Filter Agent</option>
        </select>

        <input type="text" id="rp-num" class="zy-compact-box" placeholder="Search Number">

        <input type="text" id="rp-cli" class="zy-compact-box" placeholder="Search CLI">

        <select id="rp-status" class="zy-compact-box">
          <option value="All" selected>All</option>
          <option value="Success">Success</option>
          <option value="ScrubAg">ScrubAg</option>
          <option value="Others">Others</option>
        </select>
      </div>

      <!-- Group By Row -->
      <div class="zy-compact-groupby">
        <div class="zy-compact-groupby-title">Group By :</div>
        <div class="zy-compact-groupby-chips">
          ${groupByHtml}
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="zy-compact-actions" style="margin-bottom:14px;">
        <button type="button" class="zy-btn-orange" id="btn-export-report" onclick="zyMgrExportReport()">
          Export Report
        </button>
        <button type="button" class="zy-btn-blue" id="btn-show-report" onclick="pgSmsReportsLoad()">
          Show Report
        </button>
      </div>

      <!-- Divider & Toolbar -->
      <div class="zy-filter-divider" style="height:1px;background:#e2e8f0;margin:12px 0;"></div>
      <div class="zy-table-toolbar" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;">
        <div class="zy-toolbar-left" style="display:flex;align-items:center;gap:12px;">
          <div class="zy-toolbar-search-wrap">
            <input type="text" id="cdr-mgr-search" class="zy-toolbar-search" placeholder="Number, CLI, message, range" oninput="zyFilterTable('dt-cdr', this.value)" style="height:32px;padding:4px 10px;font-size:12px;border:1px solid #cbd5e1;border-radius:4px;">
          </div>
          <div class="zy-toolbar-limit-wrap" style="display:flex;align-items:center;gap:6px;font-size:12px;color:#64748b;">
            <label for="rp-limit">Show</label>
            <select id="rp-limit" class="zy-toolbar-select" onchange="pgSmsReportsLoad()" style="height:32px;padding:2px 8px;font-size:12px;border:1px solid #cbd5e1;border-radius:4px;">
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
    </div>`;

  const [ranges, agents] = await Promise.all([
    apiFetch('/api/numbers/sms-ranges').catch(() => []),
    apiFetch(typeof MANAGER_ID !== 'undefined' && MANAGER_ID ? `/api/agents?manager_id=${MANAGER_ID}&limit=200` : '/api/agents?limit=200').catch(() => ({ data: [] }))
  ]);
  ZY_RANGES = zyList(ranges); ZY_AGENTS = zyList(agents);
  const rEl = document.getElementById('rp-range');
  if (rEl) rEl.innerHTML = `<option value="">Filter Range</option>` +
    ZY_RANGES.map(r => `<option value="${zyEsc(r.range_name || r.name || r.country || '')}">${zyEsc(r.range_name || r.name || r.country || '')}${r.prefix ? ` (${zyEsc(r.prefix)})` : ''}</option>`).join('');
  const aEl = document.getElementById('rp-agent');
  if (aEl) aEl.innerHTML = `<option value="">Filter Agent</option>` +
    ZY_AGENTS.map(a => `<option value="${a.id}">${zyEsc(a.username || a.name || '')}</option>`).join('');

  pgSmsReportsLoad();
}

window.zyMgrExportReport = function() {
  const val = id => (document.getElementById(id) || {}).value || '';
  const params = new URLSearchParams();
  if (typeof MANAGER_ID !== 'undefined' && MANAGER_ID) params.append('manager_id', MANAGER_ID);
  if (val('rp-from')) params.append('date_from', val('rp-from'));
  if (val('rp-to')) params.append('date_to', val('rp-to'));
  if (val('rp-range')) params.append('range', val('rp-range'));
  if (val('rp-agent')) params.append('agent_id', val('rp-agent'));
  if (val('rp-num')) params.append('search', val('rp-num'));
  if (val('rp-cli')) params.append('cli', val('rp-cli'));
  const st = val('rp-status');
  if (st && st !== 'All') params.append('status', st);
  const checkedBoxes = Array.from(document.querySelectorAll('.grp-chk:checked')).map(cb => cb.value);
  if (checkedBoxes.length) params.append('group_by', checkedBoxes.join(','));
  params.append('export', 'csv');

  window.location.href = `/api/sms/logs?${params.toString()}`;
};

async function pgSmsReportsLoad(pageOrSummary = 1) {
  const targetPage = typeof pageOrSummary === 'number' ? pageOrSummary : 1;
  const panelBody = document.getElementById('rp-body') || document.querySelector('.zy-panel-body');
  if (!panelBody) return;

  if (window._managerCdrAbortController) {
    try { window._managerCdrAbortController.abort(); } catch (_) {}
  }
  window._managerCdrAbortController = new AbortController();
  const reqSignal = window._managerCdrAbortController.signal;

  panelBody.innerHTML = `<div class="zy-loading" style="padding:40px;text-align:center;color:#64748b;">
    <div style="display:inline-block;margin-bottom:8px;"><i class="fas fa-spinner fa-spin fa-2x" style="color:#0ea5e9;"></i></div>
    <div>Loading reports…</div>
  </div>`;

  const val = id => (document.getElementById(id) || {}).value || '';
  const from = val('rp-from'), to = val('rp-to');
  const range = val('rp-range'), agent = val('rp-agent');
  const num = val('rp-num'), cli = val('rp-cli');
  const status = val('rp-status');

  const checkedBoxes = Array.from(document.querySelectorAll('.grp-chk:checked')).map(cb => cb.value);

  const params = new URLSearchParams();
  if (typeof MANAGER_ID !== 'undefined' && MANAGER_ID) params.append('manager_id', MANAGER_ID);
  if (from) params.append('date_from', from);
  if (to) params.append('date_to', to);
  if (range) params.append('range', range);
  if (agent) params.append('agent_id', agent);
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
        provider: 'Provider',
        range: 'Range',
        agent: 'Agent',
        client: 'Client',
        number: 'Number',
        cli: 'CLI'
      };
      const cols = [...checkedBoxes.map(k => keyLabels[k] || k), 'SMS Count', 'Currency', 'My Payout', 'Agent Payout', 'Profit'];
      const rows = data.map(g => [
        ...checkedBoxes.map(k => (k === 'agent' || k === 'client' || k === 'manager') ? (g[k] || '') : (g[k] || '—')),
        g.sms_count || 0,
        g.currency || '$',
        Number(g.payout || 0).toFixed(4),
        Number(g.agent_payout != null ? g.agent_payout : 0).toFixed(4),
        Number(g.profit != null ? g.profit : (g.payout || 0)).toFixed(4)
      ]);
      const sum = logs.summary || {};
      const totalSms = sum.total_sms != null ? sum.total_sms : data.reduce((s, g) => s + (g.sms_count || 0), 0);
      const totalPayout = sum.payout != null ? sum.payout : data.reduce((s, g) => s + (parseFloat(g.payout) || 0), 0);
      const totalAgentPayout = sum.agent_payout != null ? sum.agent_payout : data.reduce((s, g) => s + (parseFloat(g.agent_payout) || 0), 0);
      const totalProfit = sum.profit != null ? sum.profit : totalPayout;

      panelBody.innerHTML = zyDT2('dt-reports', {
        cols,
        rows,
        sort: checkedBoxes.length,
        dir: -1,
        perPage: limitNum,
        serverMode: false,
        footRow: `<td><b>Total SMS: ${totalSms.toLocaleString()}</b></td>` +
                 '<td></td>'.repeat(Math.max(0, checkedBoxes.length - 1)) +
                 `<td><b>${totalSms.toLocaleString()}</b></td>` +
                 `<td><b>$</b></td>` +
                 `<td><b>${totalPayout.toFixed(4)}</b></td>` +
                 `<td><b>${totalAgentPayout.toFixed(4)}</b></td>` +
                 `<td><b>${totalProfit.toFixed(4)}</b></td>`
      });
      zy2Render('dt-reports');
    } else {
      const cleanOrg = (v) => {
        const s = String(v || '').trim();
        if (!s) return '';
        return ['—', '-', 'direct', 'general', 'unallocated', 'unassigned', 'test panel', 'unknown', 'none', 'null'].includes(s.toLowerCase()) ? '' : s;
      };
      const cols = ['Date', 'Provider', 'Range', 'Type', 'Number', 'CLI', 'SMS', 'Agent', 'Client', 'Curr.', 'My Payout', 'Agent Payout', 'Profit'];
      const rows = data.map(s => {
        const dtCell = typeof zyFormatDateTimeStacked === 'function'
          ? zyFormatDateTimeStacked(s.timestamp || s.date)
          : { v: (s.timestamp || s.date || '').replace('T', ' ').slice(0, 19), h: (s.timestamp || s.date || '').replace('T', ' ').slice(0, 19) };
        const myP = parseFloat(s.manager_amount != null ? s.manager_amount : (s.my_payout != null ? s.my_payout : (s.payout || 0))) || 0;
        const agP = parseFloat(s.agent_payout != null ? s.agent_payout : (s.agent_rate || 0)) || 0;
        const prof = myP;
        const smsCellHtml = typeof zyRenderSmsCell === 'function' ? zyRenderSmsCell(s.message || '') : `<div class="zy-sms-cell">${zyEsc(s.message || '')}</div>`;
        const agName = cleanOrg(s.agent || s.agent_username || s.agent_name);
        const clName = cleanOrg(s.client || s.client_username || s.client_name || s.user);
        const numStr = String(s.number || '').trim();
        const cliStr = String(s.cli || s.app || '').trim();

        return [
          dtCell,
          zyEsc(s.provider || '—'),
          zyEsc(s.range_name || s.range_label || s.range || (s.country || '—')),
          s.type === 'Test Panel' ? 'Test Panel' : 'General',
          { v: numStr, h: numStr ? `<span class="monospace" style="font-weight:600;">${zyEsc(numStr)}</span>` : '—' },
          { v: cliStr, h: `<span class="monospace">${zyEsc(cliStr || '—')}</span>` },
          { v: s.message || '', h: smsCellHtml },
          { v: agName, h: agName ? zyEsc(agName) : '' },
          { v: clName, h: clName ? zyEsc(clName) : '' },
          zyEsc(s.currency || '$'),
          Number(myP).toFixed(4),
          Number(agP).toFixed(4),
          Number(prof).toFixed(4)
        ];
      });

      const sum = logs.summary || {};
      const totalSms = (sum.total_sms != null) ? sum.total_sms : (logs.total != null ? logs.total : rows.length);
      const totalPayout = (sum.payout != null) ? sum.payout : data.reduce((acc, s) => acc + (parseFloat(s.manager_amount != null ? s.manager_amount : (s.my_payout != null ? s.my_payout : (s.payout || 0))) || 0), 0);
      const totalAgentPayout = (sum.agent_payout != null) ? sum.agent_payout : data.reduce((acc, s) => acc + (parseFloat(s.agent_payout != null ? s.agent_payout : (s.agent_rate || 0)) || 0), 0);
      const totalProfit = (sum.profit != null) ? sum.profit : totalPayout;

      const footRow = `<td><b>Total SMS<br>${totalSms.toLocaleString()}</b></td>` +
        '<td></td>'.repeat(9) +
        `<td><b>My Payout<br>${Number(totalPayout).toFixed(4)}</b></td>` +
        `<td><b>Agent Payout<br>${Number(totalAgentPayout).toFixed(4)}</b></td>` +
        `<td><b>Profit<br>${Number(totalProfit).toFixed(4)}</b></td>`;

      panelBody.innerHTML = zyDT2('dt-reports', {
        cols,
        rows,
        sort: 0,
        dir: -1,
        perPage: limitNum,
        serverMode: true,
        totalRecords: logs.total != null ? logs.total : data.length,
        totalPages: logs.total_pages || 1,
        page: logs.page || targetPage,
        onPageChange: (p) => pgSmsReportsLoad(p),
        onSizeChange: (s) => {
          const sel = document.getElementById('rp-limit');
          if (sel) sel.value = String(s);
          pgSmsReportsLoad(1);
        },
        searchPlaceholder: 'Number, CLI, message, range',
        footRow
      });
      zy2Render('dt-reports');
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    console.error('Manager CDR load error:', err);
    panelBody.innerHTML = '<div class="zy-empty" style="padding:40px;text-align:center;color:#ef4444;">Failed to load reports. Please try again.</div>';
  }
}

/* ── hook the pages into the router ─────────────────────────── */
(function zyHookPages() {
  const map = {
    'sms-overview': pgSmsRanges,
    'my-numbers': pgSmsNumbers,
    'payout-rates-view': pgRateCard,
    'assign-numbers': pgBulkAllocations,
    'agents': pgAgentsList,
    'clients': pgClientsList,
    'reports': pgSmsReports
  };
  const prev = loadPage;
  loadPage = function (page) {
    if (map[page]) {
      document.getElementById('zy-user-menu')?.classList.remove('open');
      if (window.innerWidth < 992) document.getElementById('zy-mega')?.classList.remove('open');
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.getElementById('nav-' + page)?.classList.add('active');
      window.scrollTo({ top: 0 });
      try { sessionStorage.setItem('manager_current_page', page); } catch (e) {}
      map[page]();
      return;
    }
    prev(page);
  };
})();


/* ═══ 8. SMS TEST PANEL ═════════════════════════════════════ */
async function pgTestPanel() {
  const c = document.getElementById('page-content');
  zyCrumb(['SMS Test Panel']);
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title"><i class="fas fa-flask" style="color:#2563eb;"></i> SMS Test Panel</div>
        <div class="page-subtitle">Here you can see all test numbers and make calls or live tests on them, and review incoming test SMS reports.</div>
      </div>
    </div>

    <!-- PANEL 1: SMS Test Numbers -->
    <div class="card zy-panel" style="margin-bottom:20px;">
      <div class="card-header zy-panel-head" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <span class="card-title">SMS Test Numbers</span>
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

    <!-- PANEL 2: Recent SMS Test -->
    <div class="zy-panel">
      <div class="zy-panel-head">Recent SMS Test</div>
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
    </div>
  `;

  const [nums, ranges, logs] = await Promise.all([
    apiFetch('/api/sms/test-numbers?limit=1000'),
    apiFetch('/api/numbers/sms-ranges'),
    apiFetch('/api/sms/test-logs?limit=1000')
  ]);
  ZY_RANGES = zyList(ranges);
  ZY_S2['tp-range'].items = ZY_RANGES.map(r => r.range_name || r.name || r.country || '');

  ZY_TESTNUMS = zyList(nums).map(n => [
    n.range_name || n.range_label || n.range || (n.country ? `${n.country}` : '—'),
    n.prefix || (n.number ? n.number.slice(0, 4) : '—'),
    { v: n.number || '', h: typeof zyRenderNumberCopyBox === 'function' ? zyRenderNumberCopyBox(n.number) : `<span class="monospace fw-600">${n.number || '—'}</span>` },
    { v: '', h: `<span style="font-size:11px;color:#64748b;">SD: <b>${n.sms_daily || 0}</b> | SW: <b>${n.sms_weekly || 0}</b></span>` }
  ]);
  document.getElementById('tp-nums-wrap').innerHTML =
    zyDT2('dt-testnums', { cols: ['Range', 'Prefix', 'Test Number', 'Limits'], rows: ZY_TESTNUMS });
  zy2Render('dt-testnums');

  const rows = zyList(logs).map(s => {
    const dtCell = typeof zyFormatDateTimeStacked === 'function'
      ? zyFormatDateTimeStacked(s.timestamp || s.date)
      : (s.timestamp || s.date || '').replace('T', ' ').slice(0, 19);
    const rLabel = s.range_name || s.range_label || s.range || (s.country ? `${s.country}` : '—');
    const msgCellHtml = typeof zyRenderSmsCell === 'function' ? zyRenderSmsCell(s.message) : `<div class="zy-sms-cell">${zyEsc(s.message || '—')}</div>`;
    return [
      dtCell,
      zyEsc(s.provider || '—'),
      zyEsc(rLabel),
      'Test Panel',
      { v: s.number || '', h: `<span class="monospace" style="font-weight:600;">${zyEsc(s.number || '—')}</span>` },
      { v: s.cli || '', h: `<span class="monospace">${zyEsc(zyMaskCli(s.cli))}</span>` },
      { v: s.message || '', h: msgCellHtml }
    ];
  });
  document.getElementById('tp-recent').innerHTML =
    zyDT2('dt-testlog', { cols: ['Date', 'Provider', 'Range', 'Type', 'Number', 'CLI', 'SMS'], rows, sort: 0, dir: -1 });
  zy2Render('dt-testlog');
}
let ZY_TESTNUMS = [];
function zyTestFilter() {
  const q = zyS2Value('tp-range').toLowerCase();
  const t = ZYT2['dt-testnums'];
  if (!t) return;
  t.rows = q ? ZY_TESTNUMS.filter(r => String(zyCell2(r[0]).v).toLowerCase().includes(q)) : ZY_TESTNUMS;
  t.page = 1; zy2Render('dt-testnums');
}
function zyTestFilterLimit(lim) {
  const t = ZYT2['dt-testnums'];
  if (!t) return;
  t.perPage = lim === 'all' ? 100000 : parseInt(lim, 10);
  t.page = 1; zy2Render('dt-testnums');
}
function zyTestLogLimit(lim) {
  const t = ZYT2['dt-testlog'];
  if (!t) return;
  t.perPage = lim === 'all' ? 100000 : parseInt(lim, 10);
  t.page = 1; zy2Render('dt-testlog');
}

/* ═══ 9. AGENT CREDIT NOTES ═════════════════════════════════ */
async function pgCreditNotes() {
  const c = document.getElementById('page-content');
  zyCrumb(['Agent Credit Notes']);
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title"><i class="fas fa-file-invoice" style="color:#2563eb;"></i> Agent Credit Notes</div>
        <div class="page-subtitle">These are the credit notes for your agent. You have to pay the amount to agent on due date.</div>
      </div>
    </div>
    ${zyFilterBox('cn', 'pgCreditNotesLoad()')}
    <div class="card zy-panel">
      <div class="card-header zy-panel-head"><span class="card-title">Agent Credit Notes</span></div>
      <div class="card-body zy-panel-body" id="cn-body"><div class="zy-loading">Loading…</div></div>
    </div>`;
  await zyFillAgents('cn-agent');
  pgCreditNotesLoad();
}
async function pgCreditNotesLoad() {
  const body = document.getElementById('cn-body');
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;
  const res = await apiFetch('/api/credit-notes?limit=500');
  const mine = new Set(ZY_AGENTS.map(a => String(a.id)));
  const pick = zyAgentFilter('cn');
  const rows = ((res && res.data) || [])
    .filter(n => mine.has(String(n.agent_id)))
    .filter(n => !pick || String(n.agent_id) === pick)
    .filter(n => zyInRange('cn', n.created || n.date))
    .map(n => {
      const due = new Date((n.date || n.created || '').slice(0, 10));
      due.setDate(due.getDate() + 1);
      return [ (n.date || n.created || '').slice(0, 10), zyAgentName(n.agent_id),
               n.term || 'Weekly', n.currency || 'USD',
               n.amount != null ? Number(n.amount).toFixed(3) : '',
               isNaN(due) ? '' : due.toISOString().slice(0, 10),
               { v: '', h: `<button class="zy-rowbtn" onclick="zyCreditPdf(${n.id})" title="Download">${zyImg('btn_dl_pdf')}</button>` } ];
    });
  body.innerHTML = zyDT2('dt-credit', {
    cols: ['Date', 'Agent', 'Term', 'Currency', 'Payout', 'Due Date', 'Download'], rows, sort: 0, dir: -1 });
  zy2Render('dt-credit');
}

function zyCreditPdf(id) { window.open(`/api/credit-notes/${id}/pdf`, '_blank'); }

/* ═══ 10. PAYMENT REQUESTS ══════════════════════════════════ */
async function pgPaymentRequests() {
  const c = document.getElementById('page-content');
  zyCrumb(['Payment Requests']);
  
  // Load manager stats/balance
  let mgrBalance = 0;
  try {
    const mgrUser = await apiFetch(`/api/users/${MANAGER_ID}`);
    mgrBalance = Number(mgrUser?.balance || 0);
  } catch (e) {}

  c.innerHTML = `
    <div class="zy-intro" style="font-size:13px;color:#475569;margin-bottom:14px;line-height:1.5;">Track downline agent payment requests, review settlement histories, and request commission payouts directly to Owner.</div>
    
    <!-- Balance & Action Banner -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-bottom:16px;">
      <div class="sp-card" style="padding:16px 18px;border-left:4px solid #10b981;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--sp-text-muted);text-transform:uppercase;">My Commission Balance</div>
          <div style="font-size:22px;font-weight:800;color:#10b981;margin-top:2px;">$<span id="mgr-bal-display">${mgrBalance.toFixed(2)}</span></div>
        </div>
        <button type="button" class="sp-btn-primary" style="height:36px;padding:0 14px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:6px;" onclick="zyManagerRequestPayoutModal(${mgrBalance})">
          <i class="fas fa-hand-holding-dollar"></i> Request Payout
        </button>
      </div>
      <div class="sp-card" style="padding:16px 18px;border-left:4px solid #3b82f6;">
        <div style="font-size:11px;font-weight:700;color:var(--sp-text-muted);text-transform:uppercase;">Downline Agents</div>
        <div style="font-size:22px;font-weight:800;color:#3b82f6;margin-top:2px;">${(ZY_AGENTS || []).length} Accounts</div>
      </div>
    </div>

    ${zyFilterBox('pr', 'pgPaymentRequestsLoad()')}
    <div class="zy-panel">
      <div class="zy-panel-head" style="display:flex;align-items:center;justify-content:space-between;">
        <span>Payment Requests Ledger</span>
      </div>
      <div class="zy-panel-body" id="pr-body"><div class="zy-loading">Loading…</div></div>
    </div>`;

  await zyFillAgents('pr-agent');
  pgPaymentRequestsLoad();
}

window.zyManagerRequestPayoutModal = async function(currentBal = 0) {
  let minPayout = 10;
  try {
    const settings = await apiFetch('/api/settings');
    minPayout = Number(settings?.min_payout ?? 10);
  } catch (e) {}

  zyModal('Request Commission Payout', `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:13px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="color:#64748b;">Available Balance:</span>
        <strong style="color:#10b981;font-size:15px;">$${Number(currentBal).toFixed(2)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#64748b;">Minimum Payout:</span>
        <strong>$${Number(minPayout).toFixed(2)}</strong>
      </div>
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label class="zy-lbl" style="font-weight:600;">Payout Amount ($) *</label>
      <input type="number" id="mpr-amount" class="zy-input" style="width:100%;height:38px;" step="0.01" min="${minPayout}" max="${currentBal}" value="${currentBal >= minPayout ? currentBal : minPayout}">
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label class="zy-lbl" style="font-weight:600;">Payment Method *</label>
      <select id="mpr-method" class="zy-input" style="width:100%;height:38px;">
        <option value="USDT TRC20" selected>USDT (TRC-20)</option>
        <option value="Bank Transfer">Bank Wire Transfer</option>
        <option value="Payoneer">Payoneer</option>
        <option value="PayPal">PayPal</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:12px;">
      <label class="zy-lbl" style="font-weight:600;">Wallet Address / IBAN / Account *</label>
      <input type="text" id="mpr-wallet" class="zy-input" style="width:100%;height:38px;" placeholder="TRC20 Address or IBAN Details">
    </div>
    <div class="form-group" style="margin-bottom:8px;">
      <label class="zy-lbl" style="font-weight:600;">Remarks / Notes (Optional)</label>
      <input type="text" id="mpr-notes" class="zy-input" style="width:100%;height:38px;" placeholder="Weekly commission payout settlement">
    </div>
  `, `
    <button class="zy-btn-grey" onclick="closeModal()">Cancel</button>
    <button class="sp-btn-primary" id="btn-submit-mpr" onclick="zySubmitManagerPayout(${minPayout}, ${currentBal})"><i class="fas fa-paper-plane"></i> Submit Request</button>
  `);
};

window.zySubmitManagerPayout = async function(minPayout, currentBal) {
  const amt = parseFloat(document.getElementById('mpr-amount')?.value);
  const method = document.getElementById('mpr-method')?.value;
  const wallet = document.getElementById('mpr-wallet')?.value.trim();
  const notes = document.getElementById('mpr-notes')?.value.trim();

  if (isNaN(amt) || amt <= 0) { toast('Please enter a valid payout amount', 'error'); return; }
  if (amt < minPayout) { toast(`Minimum payout is $${minPayout.toFixed(2)}`, 'error'); return; }
  if (amt > currentBal) { toast(`Amount cannot exceed available balance of $${currentBal.toFixed(2)}`, 'error'); return; }
  if (!wallet) { toast('Please provide your wallet address or account details', 'error'); return; }

  const btn = document.getElementById('btn-submit-mpr');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

  try {
    const res = await apiFetch('/api/payout-requests', {
      method: 'POST',
      body: JSON.stringify({
        amount: amt,
        method,
        wallet,
        notes,
        currency: 'USD',
        role: 'Manager'
      })
    });
    if (res && (res.id || res.success)) {
      closeModal();
      toast('Payout request submitted to Owner successfully', 'success');
      pgPaymentRequests();
    } else {
      toast(res?.error || 'Failed to submit payout request', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Submit Request'; }
    }
  } catch (err) {
    toast(err.message || 'Error submitting payout request', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Submit Request'; }
  }
};

async function pgPaymentRequestsLoad() {
  const body = document.getElementById('pr-body');
  if (!body) return;
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;
  const res = await apiFetch(`/api/payout-requests?manager_id=${MANAGER_ID}`);
  const pick = zyAgentFilter('pr');
  const pickName = pick ? zyAgentName(pick) : '';
  const rows = ((res && res.data) || [])
    .filter(r => !pick || r.user === pickName || String(r.user_id) === pick || String(r.agent_id) === pick)
    .filter(r => {
      const ts = r.timestamp || r.created || r.created_at || r.date;
      return zyInRange('pr', ts);
    })
    .map(r => {
      const ts = r.timestamp || r.created || r.created_at || r.date;
      return [
        zyDateOnly(ts),
        r.user || zyAgentName(r.user_id) || 'Manager',
        r.method || r.mode || 'Direct',
        r.currency || 'USD',
        r.amount != null ? Number(r.amount).toFixed(2) : '',
        { v: r.status || '', h: `<span class="zy-badge-active ${r.status === 'paid' ? '' : 'zy-badge-off'}">${(r.status || 'pending').replace(/^./, ch => ch.toUpperCase())}</span>` },
        r.notes || r.details || (r.wallet ? `Wallet: ${r.wallet}` : '—')
      ];
    });
  body.innerHTML = zyDT2('dt-payreq', {
    cols: ['Date', 'Account', 'Mode', 'Currency', 'Amount ($)', 'Status', 'Details'], rows, sort: 0, dir: -1 });
  zy2Render('dt-payreq');
}

/* ═══ 11-13. USD / EUR / GBP STATEMENTS ═════════════════════ */
async function pgStatements(cur) {
  const c = document.getElementById('page-content');
  zyCrumb([cur + ' Statements']);
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title"><i class="fas fa-file-invoice-dollar" style="color:#2563eb;"></i> ${cur} Ledger Statements</div>
        <div class="page-subtitle">Comprehensive financial ledger tracking commission credit notes, payout debits, and live running account balance.</div>
      </div>
    </div>
    ${zyFilterBox('st', `pgStatementsLoad('${cur}')`)}
    <div class="card zy-panel">
      <div class="card-header zy-panel-head" style="display:flex;align-items:center;justify-content:space-between;">
        <span class="card-title">${cur} Ledger Statements</span>
      </div>
      <div class="card-body zy-panel-body" id="st-body"><div class="zy-loading">Loading…</div></div>
    </div>`;
  await zyFillAgents('st-agent');
  pgStatementsLoad(cur);
}
async function pgStatementsLoad(cur) {
  const body = document.getElementById('st-body');
  if (!body) return;
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;
  const [resCredits, resPayouts] = await Promise.all([
    apiFetch('/api/credit-notes?limit=500'),
    apiFetch(`/api/payout-requests?manager_id=${MANAGER_ID}&limit=500`)
  ]);
  const mine = new Set((ZY_AGENTS || []).map(a => String(a.id)));
  const pick = zyAgentFilter('st');

  const credits = ((resCredits && resCredits.data) || [])
    .filter(n => mine.has(String(n.agent_id)) || String(n.user_id) === String(MANAGER_ID))
    .filter(n => (n.currency || 'USD') === cur)
    .filter(n => !pick || String(n.agent_id) === pick)
    .filter(n => zyInRange('st', n.created || n.date))
    .map(n => ({
      date: n.created || n.date,
      agent: zyAgentName(n.agent_id) || n.username || 'Manager',
      credit: Number(n.amount || 0),
      debit: 0,
      type: 'Credit Note',
      remarks: n.reason || 'Commission credit'
    }));

  const debits = ((resPayouts && resPayouts.data) || [])
    .filter(p => p.status === 'paid')
    .filter(p => (p.currency || 'USD') === cur)
    .filter(p => !pick || String(p.user_id) === pick || String(p.agent_id) === pick)
    .filter(p => zyInRange('st', p.paid_at || p.timestamp))
    .map(p => ({
      date: p.paid_at || p.timestamp,
      agent: p.user || p.username || 'Manager',
      credit: 0,
      debit: Number(p.amount || 0),
      type: 'Payout Settlement',
      remarks: `Paid #${p.id} (${p.method || 'Transfer'})`
    }));

  const allTx = [...credits, ...debits].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  let balance = 0;
  const rows = allTx.map(t => {
    balance = Math.round((balance + t.credit - t.debit) * 100) / 100;
    return [
      zyDateOnly(t.date),
      t.agent,
      t.credit > 0 ? `<span style="color:#10b981;font-weight:700;">+${t.credit.toFixed(2)}</span>` : '0.00',
      t.debit > 0 ? `<span style="color:#ef4444;font-weight:700;">-${t.debit.toFixed(2)}</span>` : '0.00',
      t.type,
      `<strong style="color:var(--sp-text);">${balance.toFixed(2)}</strong>`,
      t.remarks
    ];
  }).reverse();

  body.innerHTML = zyDT2('dt-stmt', {
    cols: ['Date', 'Account', 'Credit', 'Debit', 'Transaction Type', 'Balance', 'Remarks'], rows, sort: 0, dir: -1 });
  zy2Render('dt-stmt');
}

/* ═══ 14. MANAGER NOTIFICATIONS (Logic Removed — awaiting new user specification) ═══ */
async function pgManagerNotifications() {
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

async function pgManagerNotificationsLoad() {}
window.zyManagerMarkSingleRead = async function() {};
window.zyManagerMarkAllRead = async function() {};
window.zyManagerWipeNotifications = async function() {};

/* ═══ 15. ASTRA-STYLE CLI SEARCH (Manager & Chain Scoped) ══════════════ */
let _mgrCachedCliLogs = [];

window.zySetCliTimeFilter = function(hours) {
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - (hours * 60 * 60 * 1000));
  const fmt = d => {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const fromEl = document.getElementById('cs-from');
  const toEl = document.getElementById('cs-to');
  if (fromEl) fromEl.value = fmt(fromDate);
  if (toEl) toEl.value = fmt(toDate);

  document.querySelectorAll('.zy-cli-time-chip').forEach(btn => {
    const val = parseFloat(btn.getAttribute('data-hours'));
    const isAct = val === hours;
    btn.style.background = isAct ? '#2563eb' : '#f1f5f9';
    btn.style.color = isAct ? '#ffffff' : '#334155';
    btn.style.borderColor = isAct ? '#2563eb' : '#cbd5e1';
  });

  pgManagerAccessSearchLoad();
};

window.pgManagerAccessSearch = async function() {
  const c = document.getElementById('page-content');
  if (typeof zyCrumb === 'function') zyCrumb(['SMS Module', 'CLI Search']);
  const bc = document.getElementById('breadcrumb');
  if (bc) bc.textContent = 'CLI Search';

  const defaultFrom = typeof zyDefaultFromDateTime === 'function' ? zyDefaultFromDateTime() : `${(new Date().toISOString().slice(0, 10))} 00:00:00`;
  const defaultTo = typeof zyDefaultToDateTime === 'function' ? zyDefaultToDateTime() : `${(new Date().toISOString().slice(0, 10))} 23:59:59`;

  c.innerHTML = `
    <div class="page-header" style="margin-bottom:14px;">
      <div>
        <div class="page-title" style="font-size:18px;font-weight:800;color:#0f172a;">CLI Search &amp; Route Inspector</div>
        <div class="page-subtitle" style="font-size:12.5px;color:#64748b;">Search active ranges, destination endpoints, and live messages by Sender ID / CLI</div>
      </div>
    </div>

    <div class="zy-panel" style="border:1.5px solid #d5e4dd;border-radius:14px;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.04);margin-bottom:18px;padding:16px 18px;">
      <!-- Time Presets Pills -->
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
        <span style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-right:4px;">
          <i class="far fa-clock" style="margin-right:4px;"></i> Time Range:
        </span>
        ${[
          { label: '30m', hours: 0.5 },
          { label: '1h',  hours: 1 },
          { label: '4h',  hours: 4 },
          { label: '12h', hours: 12 },
          { label: '24h', hours: 24 }
        ].map((t, idx) => `
          <button type="button" class="zy-cli-time-chip" data-hours="${t.hours}" onclick="zySetCliTimeFilter(${t.hours})"
                  style="border:1px solid ${idx === 4 ? '#2563eb' : '#cbd5e1'};background:${idx === 4 ? '#2563eb' : '#f1f5f9'};color:${idx === 4 ? '#ffffff' : '#334155'};padding:4px 12px;border-radius:9999px;font-size:12px;font-weight:700;cursor:pointer;transition:all 0.15s ease;">
            ${t.label}
          </button>
        `).join('')}
      </div>

      <!-- Filter Grid -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:14px;">
        <div>
          <label style="display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:4px;">From Date / Time</label>
          <input type="text" id="cs-from" class="zy-filter-input" value="${defaultFrom}" placeholder="YYYY-MM-DD HH:mm:ss" style="height:42px;border-radius:8px;font-size:13px;width:100%;border:1px solid #cbd5e1;padding:0 12px;" onclick="if(window.zyOpenDatePicker)window.zyOpenDatePicker(this)">
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:4px;">To Date / Time</label>
          <input type="text" id="cs-to" class="zy-filter-input" value="${defaultTo}" placeholder="YYYY-MM-DD HH:mm:ss" style="height:42px;border-radius:8px;font-size:13px;width:100%;border:1px solid #cbd5e1;padding:0 12px;" onclick="if(window.zyOpenDatePicker)window.zyOpenDatePicker(this)">
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:4px;">Search CLI / Sender</label>
          <input type="text" id="cs-cli" class="zy-filter-input" placeholder="e.g. WhatsApp, Uber, 888..." style="height:42px;border-radius:8px;font-size:13px;width:100%;border:1px solid #cbd5e1;padding:0 12px;">
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:4px;">SMS Text Content</label>
          <input type="text" id="cs-text" class="zy-filter-input" placeholder="Keyword in SMS..." style="height:42px;border-radius:8px;font-size:13px;width:100%;border:1px solid #cbd5e1;padding:0 12px;">
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:10px;">
        <button type="button" class="zy-btn-blue-solid" onclick="pgManagerAccessSearchLoad()" style="height:38px;padding:0 18px;border-radius:8px;font-weight:700;font-size:13px;display:inline-flex;align-items:center;gap:6px;background:#00a86b;border:none;color:#fff;cursor:pointer;">
          <i class="fas fa-search"></i> Show Report
        </button>
        <button type="button" class="zy-btn-pill" onclick="zyResetCliSearch()" style="height:38px;padding:0 16px;border-radius:8px;font-weight:600;font-size:13px;border:1px solid #cbd5e1;background:#fff;color:#475569;cursor:pointer;">
          <i class="fas fa-undo"></i> Reset
        </button>
      </div>
    </div>

    <!-- Results Panel -->
    <div class="zy-panel" style="border:1.5px solid #d5e4dd;border-radius:14px;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.04);overflow:hidden;">
      <div class="zy-panel-head" style="background:#f8faf9;border-bottom:1px solid #d5e4dd;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-weight:800;font-size:13.5px;color:#1e293b;text-transform:uppercase;letter-spacing:0.3px;">
          <i class="fas fa-list-check" style="color:#00a86b;margin-right:6px;"></i> Active Ranges &amp; CLIs
        </div>
        <span id="cs-result-count" class="badge badge-green" style="font-size:11px;padding:3px 8px;">0 matching routes</span>
      </div>
      <div class="zy-panel-body" id="cs-body" style="padding:14px;">
        <div class="zy-loading" style="padding:40px;text-align:center;color:#64748b;">Loading routes…</div>
      </div>
    </div>
  `;

  pgManagerAccessSearchLoad();
};

window.zyResetCliSearch = function() {
  const fromEl = document.getElementById('cs-from');
  const toEl = document.getElementById('cs-to');
  const cliEl = document.getElementById('cs-cli');
  const txtEl = document.getElementById('cs-text');
  if (fromEl) fromEl.value = typeof zyDefaultFromDateTime === 'function' ? zyDefaultFromDateTime() : '';
  if (toEl) toEl.value = typeof zyDefaultToDateTime === 'function' ? zyDefaultToDateTime() : '';
  if (cliEl) cliEl.value = '';
  if (txtEl) txtEl.value = '';
  pgManagerAccessSearchLoad();
};

window.pgManagerAccessSearchLoad = async function() {
  const body = document.getElementById('cs-body');
  if (!body) return;
  body.innerHTML = `<div class="zy-loading" style="padding:40px;text-align:center;color:#64748b;"><i class="fas fa-spinner fa-spin"></i> Loading records…</div>`;

  const fromVal = (document.getElementById('cs-from')?.value || '').trim();
  const toVal = (document.getElementById('cs-to')?.value || '').trim();
  const cliFilter = (document.getElementById('cs-cli')?.value || '').toLowerCase().trim();
  const textFilter = (document.getElementById('cs-text')?.value || '').toLowerCase().trim();

  const params = new URLSearchParams();
  if (fromVal) params.append('date_from', fromVal);
  if (toVal) params.append('date_to', toVal);
  if (cliFilter) params.append('cli', cliFilter);
  if (textFilter) params.append('search', textFilter);
  params.append('limit', '500');

  try {
    const res = await apiFetch(`/api/cli-search?${params.toString()}`);
    const routes = (res && res.routes) || [];
    const recentMessages = (res && res.recent_messages) || [];
    const summary = (res && res.summary) || {};

    const countBadge = document.getElementById('cs-result-count');
    if (countBadge) countBadge.textContent = `${summary.total_sms ?? 0} SMS (${routes.length} routes)`;

    if (!routes.length) {
      body.innerHTML = `
        <div style="padding:50px 20px;text-align:center;color:#64748b;">
          <i class="fas fa-magnifying-glass" style="font-size:32px;color:#94a3b8;margin-bottom:12px;"></i>
          <div style="font-weight:700;font-size:14px;color:#1e293b;margin-bottom:4px;">No matching routes found</div>
          <div style="font-size:12.5px;">Try adjusting your time range, CLI search keyword, or content filters.</div>
        </div>`;
      return;
    }

    window._mgrCliGroups = routes.map(r => ({
      ...r,
      items: r.sample_messages || []
    }));

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
        `<button type="button" class="btn btn-outline btn-sm" onclick="zyManagerViewCliSms(${idx})" style="padding:3px 10px;font-size:11.5px;font-weight:600;">
           <i class="fas fa-eye"></i> View SMS (${g.count})
         </button>`
      ];
    });

    body.innerHTML = zyDT2('dt-cli-mgr', {
      cols: ['Range / Country', 'CLI', 'SMS Count', 'Conversion', 'Last Seen', 'Actions'],
      rows,
      sort: 2,
      dir: -1
    });
    zy2Render('dt-cli-mgr');

  } catch (err) {
    console.error('CLI search error:', err);
    body.innerHTML = `<div class="text-danger" style="padding:20px;text-align:center;">Failed to execute CLI search. Please try again.</div>`;
  }
};

window.zyManagerViewCliSms = function(grpIdx) {
  const grp = (window._mgrCliGroups || [])[grpIdx];
  if (!grp || !grp.items || !grp.items.length) return;

  const rows = grp.items.map(s => {
    const dt = (s.timestamp || s.date || '').replace('T', ' ').slice(0, 19);
    const msgHtml = typeof zyRenderSmsCell === 'function' ? zyRenderSmsCell(s.message || '') : `<div class="zy-sms-cell">${zyEsc(s.message || '')}</div>`;
    return `
      <tr>
        <td style="font-size:12px;color:#64748b;white-space:nowrap;">${dt}</td>
        <td class="monospace" style="font-weight:600;white-space:nowrap;">${zyEsc(s.number || '—')}</td>
        <td class="monospace" style="font-weight:600;color:#2563eb;white-space:nowrap;">${zyEsc(s.cli || s.app || '—')}</td>
        <td style="font-size:12.5px;">${msgHtml}</td>
      </tr>`;
  }).join('');

  zyModal(`Matched Messages — ${zyEsc(grp.cli)} (${zyEsc(grp.range)})`, `
    <div style="font-size:12.5px;color:#64748b;margin-bottom:12px;">
      Showing <strong>${grp.items.length}</strong> message(s) captured for CLI <strong>${zyEsc(grp.cli)}</strong> on <strong>${zyEsc(grp.range)}</strong>
    </div>
    <div style="max-height:420px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px;">
      <table class="data-table" style="width:100%;margin:0;border-collapse:collapse;">
        <thead>
          <tr style="background:#f8fafc;position:sticky;top:0;z-index:2;">
            <th style="padding:8px 12px;font-size:12px;">Date / Time</th>
            <th style="padding:8px 12px;font-size:12px;">Number</th>
            <th style="padding:8px 12px;font-size:12px;">CLI</th>
            <th style="padding:8px 12px;font-size:12px;">Message &amp; OTP</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `, `<button type="button" class="btn btn-primary btn-sm" onclick="closeModal()">Close</button>`);
};

async function pgNumberRequests() {
  const c = document.getElementById('page-content');
  if (typeof zyCrumb === 'function') zyCrumb(['SMS Module', 'Number Requests']);
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Number Requests</div>
        <div class="page-subtitle">Review and fulfill number inventory requests submitted by your downline Agents and Clients.</div>
      </div>
    </div>
    <div class="apx-card" style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:10px;overflow:hidden;">
      <div class="apx-card-header" style="height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:#f8fafc;border-bottom:1px solid #cbd5e1;">
        <span style="font-weight:700;font-size:13px;color:#1e293b;">
          <i class="fas fa-inbox" style="color:#2563eb;margin-right:6px;"></i> Downline Number Requests
        </span>
      </div>
      <div class="apx-card-body" id="mgr-numreq-host" style="padding:14px;"><div class="zy-loading">Loading requests…</div></div>
    </div>`;
  try {
    const raw = await apiFetch('/api/agent-requests?scope=downline');
    const data = Array.isArray(raw) ? raw : (raw?.data || []);
    const host = document.getElementById('mgr-numreq-host');
    if (!host) return;
    if (!data.length) {
      host.innerHTML = '<div style="padding:28px;text-align:center;color:#64748b;">No number requests from your downline yet.</div>';
      return;
    }
    const rows = data.map(r => [
      r.id || '—',
      `<strong>${zyEsc(r.requester_username || r.agent_username || 'Account')}</strong> <span class="badge badge-blue" style="font-size:10px;">${zyEsc(r.requester_role || r.agent_role || 'Agent')}</span>`,
      zyEsc(r.range_name || ('Range #' + (r.range_id || '—'))),
      `<span class="badge badge-blue">${r.quantity || 1}</span>`,
      zyEsc(r.notes || '—'),
      `<span class="badge badge-${(r.status || 'pending') === 'fulfilled' ? 'green' : ((r.status || 'pending') === 'rejected' ? 'red' : 'yellow')}">${zyEsc(r.status || 'pending')}</span>`,
      String(r.created_at || r.created || '').replace('T', ' ').slice(0, 16) || '—',
      {
        v: '',
        h: String(r.status || 'pending').toLowerCase() === 'pending'
          ? `<div style="display:inline-flex;gap:4px;">
               <button type="button" class="btn btn-success btn-xs" onclick="zyMgrFulfillReq(${r.id}, ${r.quantity || 1})"><i class="fas fa-check"></i> Fulfill</button>
               <button type="button" class="btn btn-danger btn-xs" onclick="zyMgrRejectReq(${r.id})"><i class="fas fa-times"></i> Reject</button>
             </div>`
          : zyEsc(r.reason || '—')
      }
    ]);
    host.innerHTML = zyDT2('dt-mgr-reqs', {
      cols: ['#', 'Requester', 'Range', 'Qty', 'Notes', 'Status', 'Date', 'Actions'],
      rows
    });
    zy2Render('dt-mgr-reqs');
  } catch (err) {
    const host = document.getElementById('mgr-numreq-host');
    if (host) host.innerHTML = `<div class="text-danger" style="padding:20px;">Failed to load requests: ${zyEsc(err.message)}</div>`;
  }
}

window.zyMgrFulfillReq = async function(id, qty) {
  try {
    const res = await apiFetch(`/api/agent-requests/${id}/fulfill`, {
      method: 'POST',
      body: JSON.stringify({ count: qty })
    });
    if (res && (res.success || !res.error)) {
      if (typeof toast === 'function') toast(res.message || 'Request fulfilled!', 'success');
      pgNumberRequests();
    } else {
      if (typeof toast === 'function') toast(res?.error || 'Failed to fulfill request', 'error');
    }
  } catch (err) {
    if (typeof toast === 'function') toast(err.message || 'Failed to fulfill request', 'error');
  }
};

window.zyMgrRejectReq = async function(id) {
  const reason = prompt('Optional rejection reason:') || 'Rejected by Manager';
  try {
    const res = await apiFetch(`/api/agent-requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
    if (res && (res.success || !res.error)) {
      if (typeof toast === 'function') toast('Request rejected', 'info');
      pgNumberRequests();
    } else {
      if (typeof toast === 'function') toast(res?.error || 'Failed to reject request', 'error');
    }
  } catch (err) {
    if (typeof toast === 'function') toast(err.message || 'Failed to reject request', 'error');
  }
};

/* ── register the new pages ─────────────────────────────────── */
(function zyHookPages2() {
  const map = {
    'sms-overview': pgSmsRanges,
    'sms-ratecard': pgSmsRanges,
    'payout-rates-view': pgSmsRanges,
    'my-numbers': pgSmsNumbers,
    'assign-numbers': pgBulkAllocations,
    'number-requests': pgNumberRequests,
    'agents': pgAgentsList,
    'clients': pgClientsList,
    'reports': pgSmsReports,
    'traffic': pgSmsReports,
    'sms-test-panel': pgTestPanel,
    'my-earnings': pgCreditNotes,
    'payout-requests': pgPaymentRequests,
    'usd-statements': () => pgStatements('USD'),
    'eur-statements': () => pgStatements('EUR'),
    'gbp-statements': () => pgStatements('GBP'),
    'news': pgManagerNotifications,
    'notifications': pgManagerNotifications,
    'clisearch': pgManagerAccessSearch,
    'access-search': pgManagerAccessSearch
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
      try { sessionStorage.setItem('manager_current_page', page); } catch (e) {}
      map[page]();
      return;
    }
    prev(page);
    if (window.zyCloseSidebar) window.zyCloseSidebar();
  };
})();
