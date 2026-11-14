/* HUMEX SMS — TEST PANEL inner pages. Requires testpanel-shell.js + shared-ui-kit.js */

let TP_RANGES = [];

/* ═══ 1. SMS TEST NUMBERS ═══════════════════════════════════ */
async function pgTestNumbers() {
  const c = document.getElementById('page-content');
  zyCrumb(['SMS Test Numbers']);
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title"><i class="fas fa-vial" style="color:#2563eb;"></i> SMS Test Numbers</div>
        <div class="page-subtitle">Here you can see all test numbers, test them and view test reports.</div>
      </div>
    </div>
    <div class="card zy-panel">
      <div class="card-header zy-panel-head">
        <span class="card-title">SMS Test Numbers</span>
        <div class="zy-head-acts" style="display:flex;align-items:center;gap:8px;">
          ${zyS2('tn-range', 'Select Range', [])}
          <button class="btn btn-primary btn-sm" onclick="tpTnFilter()">Filter</button>
        </div>
      </div>
      <div class="card-body zy-panel-body"><div class="zy-loading">Loading…</div></div>
    </div>`;

  const [nums, ranges] = await Promise.all([
    apiFetch('/api/sms/test-numbers?limit=500'),
    apiFetch('/api/numbers/sms-ranges')
  ]);
  TP_RANGES = Array.isArray(ranges) ? ranges : ((ranges && ranges.data) || []);
  ZY_S2['tn-range'].items = TP_RANGES.map(r => r.name || r.country || '');

  TP_TNROWS = ((nums && nums.data) || []).map(n => [
    zyEsc(n.range_label || n.range || `${n.country || ''} ${n.provider || ''}`.trim()),
    zyEsc(n.prefix || ''),
    { v: n.number || '', h: typeof zyRenderNumberCopyBox === 'function' ? zyRenderNumberCopyBox(n.number) : zyEsc(n.number || '') },
    n.payout != null && n.payout !== '' ? zyEsc(n.payout) : 'Ask',
    { v: '', h: `SD : <b>${Number(n.sd_limit != null ? n.sd_limit : 0)}</b> | SW : <b>${Number(n.sw_limit != null ? n.sw_limit : 0)}</b>` }
  ]);

  c.querySelector('.zy-panel-body').innerHTML =
    zyDT2('dt-testnums', { cols: ['Range', 'Prefix', 'Test Number', 'Payout', 'Limits'], rows: TP_TNROWS });
  zy2Render('dt-testnums');
}
let TP_TNROWS = [];
function tpTnFilter() {
  const q = zyS2Value('tn-range').toLowerCase();
  const t = ZYT2['dt-testnums']; if (!t) return;
  t.rows = q ? TP_TNROWS.filter(r => String(zyCell2(r[0]).v).toLowerCase().includes(q)) : TP_TNROWS;
  t.page = 1; zy2Render('dt-testnums');
}

/* ═══ 2. TEST SMS CDR STATS ═════════════════════════════════ */
async function pgTestCdrStats() {
  const c = document.getElementById('page-content');
  zyCrumb(['Test SMS CDR Stats']);
  const fromDef = typeof zyDefaultFromDateTime === 'function' ? zyDefaultFromDateTime() : (new Date().toISOString().slice(0, 10) + ' 00:00:00');
  const toDef = typeof zyDefaultToDateTime === 'function' ? zyDefaultToDateTime() : (new Date().toISOString().slice(0, 10) + ' 23:59:59');
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title"><i class="fas fa-chart-line" style="color:#2563eb;"></i> Test SMS CDR Stats</div>
        <div class="page-subtitle">Here you can view all test SMS summary reports and traffic stats.</div>
      </div>
    </div>
    <div class="zy-filter-grid">
      <div class="zy-filter-grid-fields">
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="tc-from">From</label>
          <input type="text" class="zy-filter-input" id="tc-from" value="${zyEsc(fromDef)}" placeholder="YYYY-MM-DD HH:mm:ss">
        </div>
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="tc-to">To</label>
          <input type="text" class="zy-filter-input" id="tc-to" value="${zyEsc(toDef)}" placeholder="YYYY-MM-DD HH:mm:ss">
        </div>
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="tc-range">Range</label>
          <select class="zy-filter-input" id="tc-range"><option value="">All Ranges</option></select>
        </div>
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="tc-client">Client</label>
          <select class="zy-filter-input" id="tc-client"><option value="">All</option></select>
        </div>
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="tc-num">Number</label>
          <input type="text" class="zy-filter-input" id="tc-num" placeholder="Search Number">
        </div>
        <div class="zy-filter-field">
          <label class="zy-filter-label" for="tc-cli">CLI</label>
          <input type="text" class="zy-filter-input" id="tc-cli" placeholder="Search CLI">
        </div>
      </div>

      <div class="zy-groupby-card">
        <div class="zy-groupby-title"><i class="fas fa-layer-group" style="font-size:11px;color:var(--sp-text-muted,#64748b);"></i> Group By :</div>
        <div class="zy-groupby-chips">
          ${['Hour', 'Date', 'Month', 'Range', 'Client', 'Number', 'CLI'].map(g => `
            <label class="zy-chip-pill" for="tc-grp-${g.toLowerCase()}">
              <input type="checkbox" id="tc-grp-${g.toLowerCase()}" class="grp-chk" value="${g.toLowerCase()}" onchange="this.closest('.zy-chip-pill').classList.toggle('active', this.checked)">
              ${g}
            </label>`).join('')}
        </div>
      </div>

      <div class="zy-filter-actions">
        <button type="button" class="zy-btn-amber" id="btn-export-report" onclick="zy2Export('dt-testcdr','csv')"><i class="fas fa-file-export"></i> Export Report</button>
        <button type="button" class="zy-btn-blue-solid" id="btn-show-report" onclick="pgTestCdrStatsLoad()"><i class="fas fa-chart-column"></i> Show Report</button>
      </div>

      <hr class="zy-filter-divider">

      <div class="zy-table-toolbar">
        <div class="zy-toolbar-left">
          <div class="zy-search-wrap">
            <i class="fas fa-search"></i>
            <input type="text" class="zy-toolbar-search" placeholder="Search..." oninput="zy2Search('dt-testcdr', this.value)">
          </div>
          <div class="zy-toolbar-select-wrap">
            <label class="zy-toolbar-label" for="tc-limit">Show Records</label>
            <select id="tc-limit" class="zy-toolbar-select" onchange="pgTestCdrStatsLoad()">
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="500" selected>500</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>
        <div class="zy-toolbar-right">
          <div class="zy-toolbar-pills">
            <button type="button" class="zy-btn-pill" onclick="zy2Export('dt-testcdr','copy')"><i class="fas fa-copy"></i> Copy</button>
            <button type="button" class="zy-btn-pill" onclick="zy2Export('dt-testcdr','csv')"><i class="fas fa-file-csv"></i> CSV</button>
            <button type="button" class="zy-btn-pill" onclick="zy2Export('dt-testcdr','excel')"><i class="fas fa-file-excel"></i> Excel</button>
            <button type="button" class="zy-btn-pill" onclick="zy2Export('dt-testcdr','print')"><i class="fas fa-print"></i> Print</button>
            <button type="button" class="zy-btn-pill" onclick="zy2Cols('dt-testcdr', this)"><i class="fas fa-columns"></i> Columns</button>
          </div>
        </div>
      </div>
    </div>
    <div class="card zy-panel">
      <div class="card-header zy-panel-head"><span class="card-title">SMS CDR Reports &amp; Stats</span></div>
      <div class="card-body zy-panel-body" id="tc-body"><div class="zy-loading">Loading…</div></div>
    </div>`;

  const ranges = await apiFetch('/api/numbers/sms-ranges');
  TP_RANGES = Array.isArray(ranges) ? ranges : ((ranges && ranges.data) || []);
  const sel = document.getElementById('tc-range');
  if (sel) sel.innerHTML = `<option value="">All Ranges</option>` +
    TP_RANGES.map(r => `<option value="${r.id}">${zyEsc(r.name || r.country || '')}</option>`).join('');

  pgTestCdrStatsLoad();
}

async function pgTestCdrStatsLoad() {
  const body = document.getElementById('tc-body');
  if (!body) return;
  body.innerHTML = `<div class="zy-loading">Loading…</div>`;

  const val = id => (document.getElementById(id) || {}).value || '';
  const from = val('tc-from'), to = val('tc-to');
  const num = val('tc-num').toLowerCase(), cli = val('tc-cli').toLowerCase();
  const rangeId = val('tc-range');
  const rangeName = (TP_RANGES.find(r => String(r.id) === String(rangeId)) || {}).name || '';
  const limitRaw = val('tc-limit') || '500';
  const limitNum = limitRaw === 'all' ? 100000 : Number(limitRaw) || 500;

  const checkedBoxes = Array.from(document.querySelectorAll('.grp-chk:checked')).map(cb => cb.value);

  const params = new URLSearchParams();
  if (from) params.append('date_from', from.slice(0, 10));
  if (to) params.append('date_to', to.slice(0, 10));
  if (rangeName) params.append('range', rangeName);
  if (num) params.append('search', num);
  if (cli) params.append('cli', cli);
  if (checkedBoxes.length) params.append('group_by', checkedBoxes.join(','));
  params.append('limit', limitRaw === 'all' ? '5000' : String(limitNum));

  const res = await apiFetch(`/api/sms/test-logs?${params.toString()}`);
  const data = (res && res.data) || [];

  if (res && res.grouped && checkedBoxes.length) {
    const keyLabels = {
      hour: 'Hour',
      date: 'Date',
      month: 'Month',
      range: 'Range',
      client: 'Client',
      number: 'Number',
      cli: 'CLI'
    };
    const cols = [...checkedBoxes.map(k => keyLabels[k] || k), 'SMS Count'];
    const rows = data.map(g => [
      ...checkedBoxes.map(k => zyEsc(g[k] || '—')),
      Number(g.sms_count || g.count || 0)
    ]);
    const totalSms = data.reduce((s, g) => s + (g.sms_count || g.count || 0), 0);

    body.innerHTML = zyDT2('dt-testcdr', {
      cols,
      rows,
      sort: checkedBoxes.length,
      dir: -1,
      perPage: limitNum,
      noTopBar: true,
      footRow: `<td><b>Total Groups ${rows.length}</b></td>` +
               '<td></td>'.repeat(Math.max(0, checkedBoxes.length - 1)) +
               `<td><b>Total SMS: ${totalSms}</b></td>`
    });
    zy2Render('dt-testcdr');
  } else {
    const rows = data
      .filter(s => zyInRange('tc', s.timestamp || s.date))
      .filter(s => !num || String(s.number || '').toLowerCase().includes(num))
      .filter(s => !cli || String(s.cli || '').toLowerCase().includes(cli))
      .filter(s => !rangeName || String(s.range_label || s.range || '').includes(rangeName))
      .map(s => [
        typeof zyFormatDateTimeStacked === 'function'
          ? zyFormatDateTimeStacked(s.timestamp || s.date)
          : zyEsc(String(s.timestamp || s.date || '').replace('T', ' ').slice(0, 19)),
        zyEsc(s.provider || '—'),
        zyEsc(s.range_label || s.range || `${s.country || ''} ${s.provider || ''}`.trim() || '—'),
        'Test Panel',
        { v: s.number || '', h: `<span class="monospace" style="font-weight:600;">${zyEsc(s.number || '—')}</span>` },
        { v: s.cli || '', h: `<span class="monospace">${zyEsc(zyMaskCli(s.cli))}</span>` },
        s.sms || s.message ? 'XXXXX' : '',
        zyEsc(s.status || '')
      ]);

    body.innerHTML = zyDT2('dt-testcdr', {
      cols: ['Date', 'Provider', 'Range', 'Type', 'Number', 'CLI', 'SMS', 'Status'],
      rows,
      sort: 0,
      dir: -1,
      perPage: limitNum,
      noTopBar: true
    });
    zy2Render('dt-testcdr');
  }
}

/* CLI masking lives in shared-ui-kit.js as zyMaskCli() — first character only,
   then XXXXX. The SMS body is masked completely (see the rows above). */
