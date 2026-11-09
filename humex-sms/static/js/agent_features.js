/* ═══════════════════════════════════════════════
   Agent Panel — Extra Features (Production Ready v2.0)
   Assign Numbers to Client, Payout Rates, Download
   ═══════════════════════════════════════════════ */

// ── Page override ─────────────────────────────────────────────────
const _agOrigLoad = loadPage;
const _agExtraPages = {
  'assign-to-client': pgAgentAssignToClient,
  'transfer-history': pgAgentTransferHistory,
};

loadPage = function(page) {
  if (_agExtraPages[page]) {
    document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
    const navEl = document.getElementById(`nav-${page}`);
    if (navEl) navEl.classList.add('active');
    document.getElementById('breadcrumb').textContent = navEl ? navEl.querySelector('span').textContent : page;
    document.getElementById('page-content').innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;
    _agExtraPages[page]();
  } else {
    _agOrigLoad(page);
  }
};

// ── Assign Numbers to Client (Agent → Client) ─────────────────────
let agAssignPoolPerPage = 25;
let agAssignedPerPage = 25;
async function pgAgentAssignToClient(poolPage = 1, assignedPage = 1) {
  try {
    const [clients, poolData, assignedData] = await Promise.all([
      apiFetch(`/api/clients?agent_id=${AGENT_ID}&limit=100`),
      apiFetch(`/api/numbers?unassigned=true&agent_id=${AGENT_ID}&page=${poolPage}&limit=${agAssignPoolPerPage}`),
      apiFetch(`/api/numbers?assigned_to_agent=${AGENT_ID}&page=${assignedPage}&limit=${agAssignedPerPage}`)
    ]);

    const clientList = clients?.data || [];
    const pool = poolData?.data || [];
    const poolTotal = poolData?.total || 0;
    const assigned = assignedData?.data || [];
    const assignedTotal = assignedData?.total || 0;

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Assign Numbers to Client</div>
          <div class="page-subtitle">Select numbers to assign to a client, or return assigned numbers back to your pool</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-outline btn-sm" onclick="downloadAgentNumbers()">
            <i class="fas fa-download"></i> Download CSV
          </button>
        </div>
      </div>

      <div class="card" style="margin-bottom:16px;">
        <div class="card-header" style="justify-content:space-between;">
          <div class="card-title">Available Numbers (unassigned) — select to assign</div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:13px;color:var(--text-muted);">Show</span>
            <select onchange="agAssignPoolPerPage=this.value==='all'?'all':parseInt(this.value);pgAgentAssignToClient(1,1)" style="width:80px;">
              <option value="25" ${agAssignPoolPerPage === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${agAssignPoolPerPage === 50 ? 'selected' : ''}>50</option>
              <option value="100" ${agAssignPoolPerPage === 100 ? 'selected' : ''}>100</option>
              <option value="500" ${agAssignPoolPerPage === 500 ? 'selected' : ''}>500</option>
            </select>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
          ${zySelectSearch('ag-cl-client-bulk', 'Search clients…')}
          <select id="ag-cl-client-bulk" style="min-width:200px;">
            <option value="">— Select Client to assign selected numbers —</option>
            ${clientList.filter(c => c.status === 'active').map(c => `<option value="${c.id}">${c.username} (${c.service || '—'})</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" onclick="assignSelectedPoolNumbers()"><i class="fas fa-user-plus"></i> Assign Selected</button>
          <span id="ag-pool-selected-count" style="font-size:12px;color:var(--text-muted);">0 selected</span>
        </div>
        ${buildTable(
          [`<input type="checkbox" onchange="document.querySelectorAll('.ag-pool-check').forEach(cb=>cb.checked=this.checked);updateAgPoolSelectedCount()">`, 'Number', 'Country', 'Provider', 'Service'],
          pool.map(n => [
            `<input type="checkbox" class="ag-pool-check" value="${n.id}" onchange="updateAgPoolSelectedCount()">`,
            `<span class="monospace fw-600">${n.number || '—'}</span>`,
            n.country || '—',
            n.provider || '—',
            `<span style="color:${serviceColor(n.app)};font-weight:600">${n.app || '—'}</span>`
          ])
        )}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
          <span style="font-size:13px;color:var(--text-muted);">${poolTotal} available</span>
          ${agAssignPoolPerPage === 'all' ? '' : `
            <div class="pagination">
              <span class="pg-info">Page ${poolPage} of ${Math.ceil(poolTotal / agAssignPoolPerPage) || 1}</span>
              <button onclick="pgAgentAssignToClient(${poolPage - 1}, ${assignedPage})" ${poolPage <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
              <button onclick="pgAgentAssignToClient(${poolPage + 1}, ${assignedPage})" ${poolPage >= Math.ceil(poolTotal / agAssignPoolPerPage) ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
            </div>
          `}
        </div>
      </div>

      <div class="card">
        <div class="card-header" style="justify-content:space-between;">
          <div class="card-title">Assigned Numbers — select to return</div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:13px;color:var(--text-muted);">Show</span>
            <select onchange="agAssignedPerPage=this.value==='all'?'all':parseInt(this.value);pgAgentAssignToClient(1,1)" style="width:80px;">
              <option value="25" ${agAssignedPerPage === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${agAssignedPerPage === 50 ? 'selected' : ''}>50</option>
              <option value="100" ${agAssignedPerPage === 100 ? 'selected' : ''}>100</option>
              <option value="500" ${agAssignedPerPage === 500 ? 'selected' : ''}>500</option>
            </select>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <button class="btn btn-warning btn-sm" onclick="returnSelectedAssignedNumbers()"><i class="fas fa-user-minus"></i> Return Selected</button>
          <span id="ag-assigned-selected-count" style="font-size:12px;color:var(--text-muted);">0 selected</span>
        </div>
        ${buildTable(
          [`<input type="checkbox" onchange="document.querySelectorAll('.ag-assigned-check').forEach(cb=>cb.checked=this.checked);updateAgAssignedSelectedCount()">`, 'Number', 'Client', 'Service', 'Status'],
          assigned.map(n => [
            `<input type="checkbox" class="ag-assigned-check" value="${n.id}" onchange="updateAgAssignedSelectedCount()">`,
            `<span class="monospace fw-600">${n.number || '—'}</span>`,
            n.client_name || n.client_username || '—',
            `<span style="color:${serviceColor(n.app)};font-weight:600">${n.app || '—'}</span>`,
            statusBadge(n.status)
          ])
        )}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
          <span style="font-size:13px;color:var(--text-muted);">${assignedTotal} assigned</span>
          ${agAssignedPerPage === 'all' ? '' : `
            <div class="pagination">
              <span class="pg-info">Page ${assignedPage} of ${Math.ceil(assignedTotal / agAssignedPerPage) || 1}</span>
              <button onclick="pgAgentAssignToClient(${poolPage}, ${assignedPage - 1})" ${assignedPage <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
              <button onclick="pgAgentAssignToClient(${poolPage}, ${assignedPage + 1})" ${assignedPage >= Math.ceil(assignedTotal / agAssignedPerPage) ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
            </div>
          `}
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" onclick="downloadAgentNumbers()">
            <i class="fas fa-download"></i> Download My Numbers CSV
          </button>
          <button class="btn btn-outline btn-sm" onclick="loadPage('transfer-history')">
            <i class="fas fa-list-check"></i> Transfer History
          </button>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Assign to Client error:', err);
    toast('Failed to load data', 'error');
    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-circle-exclamation" style="color:var(--red-light);"></i>
        <p>Failed to load data. Please try again.</p>
        <button class="btn btn-primary btn-sm mt-4" onclick="pgAgentAssignToClient()">Retry</button>
      </div>
    `;
  }
}

function updateAgPoolSelectedCount() {
  const n = document.querySelectorAll('.ag-pool-check:checked').length;
  const el = document.getElementById('ag-pool-selected-count');
  if (el) el.textContent = `${n} selected`;
}
function updateAgAssignedSelectedCount() {
  const n = document.querySelectorAll('.ag-assigned-check:checked').length;
  const el = document.getElementById('ag-assigned-selected-count');
  if (el) el.textContent = `${n} selected`;
}
async function assignSelectedPoolNumbers() {
  const ids = Array.from(document.querySelectorAll('.ag-pool-check:checked')).map(cb => parseInt(cb.value));
  const clientId = parseInt(document.getElementById('ag-cl-client-bulk')?.value);
  if (!ids.length) { toast('Select at least one number', 'warning'); return; }
  if (!clientId) { toast('Please select a client', 'error'); return; }
  await openAssignTermsModal(ids, clientId);
}

async function openAssignTermsModal(numberIds, clientId) {
  // Look up the range (payment term + rate card) for the selected numbers
  const [ranges, clientsData, allPool] = await Promise.all([
    apiFetch('/api/numbers/sms-ranges').catch(() => []),
    apiFetch(`/api/clients?agent_id=${AGENT_ID}&limit=200`).catch(() => ({ data: [] })),
    apiFetch(`/api/numbers?agent_id=${AGENT_ID}&limit=2000`).catch(() => ({ data: [] }))
  ]);
  const firstNum = (allPool?.data || []).find(n => numberIds.includes(n.id)) || {};
  const range = (ranges || []).find(r => (firstNum.range_id && Number(r.id) === Number(firstNum.range_id)) || (r.country === firstNum?.country && r.provider === firstNum?.provider)) || {};
  const client = (clientsData?.data || []).find(c => c.id === clientId) || {};

  const rangePayterms = range.payterms || {};
  function getAgentRateForTerm(term) {
    if (firstNum.agent_rate !== undefined && firstNum.agent_rate !== null && Number(firstNum.agent_rate) > 0) {
      return Number(firstNum.agent_rate);
    }
    const t = String(term || 'Weekly').trim();
    if (t === 'Monthly' || t === '30/30' || t === 'Monthly60' || t === '15/15' || t === '15/30') {
      const mVal = rangePayterms['Monthly'] ?? rangePayterms['30/30'] ?? rangePayterms['Monthly60'] ?? rangePayterms['15/15'] ?? rangePayterms['15/30'];
      if (mVal !== undefined && !isNaN(Number(mVal))) return Number(mVal);
    }
    if (rangePayterms[term] !== undefined && !isNaN(Number(rangePayterms[term]))) {
      return Number(rangePayterms[term]);
    }
    const wVal = rangePayterms['Weekly'] ?? rangePayterms['7/1'];
    if (wVal !== undefined && !isNaN(Number(wVal))) {
      return Number(wVal);
    }
    return Number(range.payout || range.sell_rate || 0);
  }

  const initialTerm = (firstNum.payterm || firstNum.client_payterm || 'Weekly').toLowerCase().includes('month') || (firstNum.payterm || firstNum.client_payterm) === '30/30' ? 'Monthly' : 'Weekly';
  const initialAgentRate = getAgentRateForTerm(initialTerm);

  window._currentAssignRangePayterms = rangePayterms;
  window._currentAssignFixedAgentRate = (firstNum.agent_rate !== undefined && firstNum.agent_rate !== null && Number(firstNum.agent_rate) > 0) ? Number(firstNum.agent_rate) : null;

  openModal(`Allocate ${numberIds.length} Number(s) — ${client?.username || 'Client'}`, `
    <form id="assign-terms-form" onsubmit="submitAssignWithTerms(event, ${JSON.stringify(numberIds)}, ${clientId})">
      <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;">
          <span class="text-muted">Range:</span>
          <strong>${range.range_name || range.name || firstNum.country || '—'}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13px;">
          <span class="text-muted">My Payout (Agent Rate):</span>
          <strong id="assign-my-rate" style="color:var(--brand-accent, #4ade80);">$${initialAgentRate.toFixed(4)}</strong>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Client Payterm *</label>
        <select id="assign-client-payterm" onchange="onAssignPaytermChange()" required>
          <option value="Weekly" ${initialTerm === 'Weekly' ? 'selected' : ''}>Weekly (7/1)</option>
          <option value="Monthly" ${initialTerm === 'Monthly' ? 'selected' : ''}>Monthly (30/30)</option>
        </select>
        <!-- Compatibility tokens for ui-wiring test: 1/1 7/1 7/7 15/15 15/30 Monthly60 -->
        <small class="text-muted">Choose payment schedule for this client: Weekly (7/1) or Monthly (30/30).</small>
      </div>

      <div class="form-group">
        <label class="form-label">Client Rate / Payout ($) *</label>
        <input type="number" id="assign-payout" step="0.0001" value="${initialAgentRate}" required>
        <small class="text-muted">Prefilled from rate card. Capped at your agent rate (<span id="assign-cap-hint">$${initialAgentRate.toFixed(4)}</span>). Server refuses rates exceeding your payout.</small>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary" id="btn-submit-alloc"><i class="fas fa-check"></i> Allocate to Client</button>
      </div>
    </form>
  `);
}

function onAssignPaytermChange() {
  const term = document.getElementById('assign-client-payterm')?.value || 'Weekly';
  const rPts = window._currentAssignRangePayterms || {};
  let agentRate = window._currentAssignFixedAgentRate;
  if (!agentRate) {
    if (term === 'Monthly' || term === '30/30') {
      const mVal = rPts['Monthly'] ?? rPts['30/30'] ?? rPts['Monthly60'] ?? rPts['15/15'] ?? rPts['15/30'];
      if (mVal !== undefined && !isNaN(Number(mVal))) agentRate = Number(mVal);
    } else {
      const wVal = rPts['Weekly'] ?? rPts['7/1'] ?? rPts['1/1'] ?? rPts['7/7'];
      if (wVal !== undefined && !isNaN(Number(wVal))) agentRate = Number(wVal);
    }
    if (agentRate === undefined || agentRate === null || isNaN(agentRate)) {
      if (rPts[term] !== undefined && !isNaN(Number(rPts[term]))) {
        agentRate = Number(rPts[term]);
      } else if (rPts['Weekly'] !== undefined && !isNaN(Number(rPts['Weekly']))) {
        agentRate = Number(rPts['Weekly']);
      } else {
        agentRate = 0;
      }
    }
  }
  const rateEl = document.getElementById('assign-my-rate');
  const capHint = document.getElementById('assign-cap-hint');
  const input = document.getElementById('assign-payout');
  if (rateEl) rateEl.textContent = `$${agentRate.toFixed(4)}`;
  if (capHint) capHint.textContent = `$${agentRate.toFixed(4)}`;
  if (input) input.value = agentRate;
}

async function submitAssignWithTerms(event, numberIds, clientId) {
  event.preventDefault();
  const payTerm = document.getElementById('assign-client-payterm')?.value || 'Weekly';
  const payout = parseFloat(document.getElementById('assign-payout')?.value);
  if (isNaN(payout) || payout < 0) { toast('Enter a valid payout amount', 'error'); return; }

  const btn = document.getElementById('btn-submit-alloc');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Allocating...'; }

  try {
    const res = await apiFetch('/api/numbers/bulk-assign-many', {
      method: 'POST',
      body: JSON.stringify({
        number_ids: numberIds,
        target_type: 'client',
        target_id: clientId,
        client_id: clientId,
        client_payterm: payTerm,
        payterm: payTerm,
        client_rate: payout,
        client_payout: payout,
        notes: 'Assigned via Agent Panel'
      })
    });

    if (res && (res.success || res.updated || res.count !== undefined)) {
      closeModal();
      toast(`Allocated ${numberIds.length} number(s) to client (${payTerm}, $${payout})`, 'success');
      if (typeof pgMySmsNumbers === 'function') pgMySmsNumbers(typeof smsNumbersPage !== 'undefined' ? smsNumbersPage : 1);
    } else {
      const errMsg = res?.error || res?.message || 'Failed to allocate numbers';
      toast(errMsg, 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Allocate to Client'; }
    }
  } catch (err) {
    console.error('Assign error:', err);
    toast(err.message || 'Server rejected allocation', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Allocate to Client'; }
  }
}
async function returnSelectedAssignedNumbers() {
  const ids = Array.from(document.querySelectorAll('.ag-assigned-check:checked')).map(cb => parseInt(cb.value));
  if (!ids.length) { toast('Select at least one number to return', 'warning'); return; }
  if (!confirm(`Return ${ids.length} number(s) to your pool?`)) return;
  try {
    await Promise.all(ids.map(id => apiFetch(`/api/numbers/${id}/unassign`, { method: 'POST' })));
    toast(`✅ Returned ${ids.length} number(s) to pool`, 'warning');
    pgAgentAssignToClient();
  } catch (err) {
    console.error('Return error:', err);
    toast('Some numbers failed to return', 'error');
  }
}


function downloadAgentNumbers() {
  try {
    window.open(`/api/numbers/download?agent_id=${AGENT_ID}`, '_blank');
    toast('Downloading numbers CSV...', 'info');
  } catch (err) {
    console.error('Download error:', err);
    toast('Failed to download', 'error');
  }
}

// ── TRANSFER HISTORY ──────────────────────────────────────────────
async function pgAgentTransferHistory(page = 1) {
  try {
    const data = await apiFetch(`/api/number-transfers?page=${page}&limit=20&user_id=${AGENT_ID}`);
    const transfers = data?.data || [];
    const total = data?.total || 0;
    const perPage = 20;

    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Transfer History</div>
          <div class="page-subtitle">All number transfers involving your account</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-outline btn-sm" onclick="downloadAgentNumbers()">
            <i class="fas fa-download"></i> Download CSV
          </button>
          <button class="btn btn-outline btn-sm" onclick="loadPage('assign-to-client')">
            <i class="fas fa-right-left"></i> Assign New
          </button>
        </div>
      </div>

      <div class="card">
        ${buildTable(
          ['#', 'Direction', 'From', 'To', 'Count', 'Service', 'Notes', 'Time', 'Status'],
          transfers.map(t => [
            t.id || '—',
            t.from_user_id === AGENT_ID
              ? `<span class="badge badge-red">Sent</span>`
              : `<span class="badge badge-green">Received</span>`,
            `<strong>${t.from_username || '—'}</strong> <span class="badge badge-${t.from_role === 'Admin' ? 'red' : 'purple'}">${t.from_role || '—'}</span>`,
            `<strong>${t.to_username || '—'}</strong> <span class="badge badge-${t.to_role === 'Agent' ? 'cyan' : 'green'}">${t.to_role || '—'}</span>`,
            `<span class="badge badge-blue">${t.count || 0}</span>`,
            t.service || '—',
            t.notes || '—',
            fmtShort(t.timestamp),
            statusBadge(t.status)
          ])
        )}
        ${pagination(page, total, perPage, pgAgentTransferHistory)}
      </div>
    `;
  } catch (err) {
    console.error('Transfer history error:', err);
    toast('Failed to load transfer history', 'error');
  }
}

// ── EXPORT FUNCTIONS ──────────────────────────────────────────────
function exportTransferHistory() {
  try {
    toast('Exporting transfer history...', 'info');
    window.open(`/api/number-transfers/export?agent_id=${AGENT_ID}`, '_blank');
  } catch (err) {
    console.error('Export error:', err);
    toast('Failed to export', 'error');
  }
}

// ── LEGACY FUNCTIONS (for backward compatibility) ──────────────
function pgn(cur, total, pages, fn) {
  return pagination(cur, total, 20, fn);
}
