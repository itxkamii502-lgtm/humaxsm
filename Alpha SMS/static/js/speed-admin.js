/* ═══════════════════════════════════════════════════════════════
   𝑴𝑨𝑰𝑻 𝑺𝑴𝑺 — Admin panel skin
   Same shell/skin as the manager, agent and client panels.
   The admin's own pages and features are untouched — this only
   rebuilds the frame (header, menu, breadcrumb) and applies the skin.
   Loads AFTER app.js / the admin feature scripts.
   ═══════════════════════════════════════════════════════════════ */

/* ── Respect Dark / Light / System theme profile setting ───── */
(function initSpeedTheme() {
  function getThemePref() {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light' || saved === 'system') return saved;
      const user = window._currentUser || window.CURRENT_USER || window._user;
      if (user && (user.theme_mode === 'dark' || user.theme_mode === 'light' || user.theme_mode === 'system')) {
        return user.theme_mode;
      }
    } catch (e) {}
    return 'system';
  }

  function applyTheme(pref) {
    const choice = pref || getThemePref();
    let effective = choice;
    if (choice === 'system') {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      effective = prefersDark ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', effective);
    document.body.classList.remove('dark', 'light');
    document.body.classList.add(effective, 'rmsui', 'adminui');
    return effective;
  }

  window.toggleTheme = function() {
    const cur = document.documentElement.getAttribute('data-theme') || (document.body.classList.contains('dark') ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('theme', next); } catch (e) {}
    applyTheme(next);
  };

  window.applyThemePreference = applyTheme;
  window.getThemePreference = getThemePref;

  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (getThemePref() === 'system') applyTheme('system');
      });
    } catch (e) {}
  }
  applyTheme();
})();

const ZY_ICON_BASE = window.ZY_ICON_BASE || '/static/img/icons/';
function zyIcon(n, cls) {
  const data = window.ZY_ICONS_DATA && window.ZY_ICONS_DATA[n];
  return `<img class="${cls || 'zy-icimg'}" src="${data || (ZY_ICON_BASE + n + '.png')}" alt="">`;
}
function zyImg(n, cls) { return zyIcon(n, cls); }

const ZY_LOGO_SRC = window.ZY_LOGO_SRC || '/static/img/humax-sms-logo.png';
const ZY_LOGO = `
<svg viewBox="0 0 250 62" xmlns="http://www.w3.org/2000/svg" style="height:44px;width:auto;display:block;">
  <defs><linearGradient id="zyg-adm" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#ffffff"/><stop offset="50%" stop-color="#f8fafc"/>
    <stop offset="100%" stop-color="#cbd5e1"/>
  </linearGradient></defs>
  <g fill="url(#zyg-adm)" font-family="Arial Black, Arial, sans-serif" font-size="38" font-weight="900"
     letter-spacing="5" transform="skewX(-4)"><text x="6" y="38">ALPHA</text></g>
  <path d="M88 6 L108 6 L92 34 Z" fill="#8FE51F" opacity=".95"/>
  <text x="14" y="55" fill="#8FE51F" font-family="Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="8">SMS</text>
  <rect x="75" y="50" width="85" height="2" fill="#8FE51F"/>
</svg>`;

const ZY_ADMIN_MENU = [
  { t: null, c: '#e0a030', items: [
      ['Dashboard', 'dashboard', 'fa-gauge-high'],
  ] },
  { t: "NUMBERS GROUP", c: '#e8a33d', items: [
      ['My Numbers', 'my-numbers', 'fa-mobile-screen'],
      ['Bulk Allocation', 'bulk-allocation', 'fa-plus'],
      ['Allocation History', 'allocation-history', 'fa-file-lines'],
      ['Ranges & Rate Card', 'sms-ranges', 'fa-table-list'],
      ['Upload Numbers', 'upload-numbers', 'fa-cloud-arrow-up'],
      ['Blacklist Management', 'blacklist-management', 'fa-ban'],
      ['Revoke Numbers', 'revoke-numbers', 'fa-rotate-right'],
      ['Transfer History', 'number-transfers-log', 'fa-list-check'],
      ['Test Numbers', 'test-numbers', 'fa-terminal'],
      ['SMS Test Panel', 'sms-test-panel', 'fa-vial'],
      ['Test Panel Numbers', 'test-panel-numbers', 'fa-mobile-screen'],
      ['Test Panel Accounts', 'test-panel-accounts', 'fa-user-shield'],
  ] },
  { t: "SMS GROUP", c: '#2f7fc4', items: [
      ['CLI Search', 'cli-search', 'fa-magnifying-glass'],
      ['My SMS', 'my-sms', 'fa-comment-sms'],
      ['Profit Stats', 'profit-stats', 'fa-dollar-sign'],
      ['Live OTP Feed', 'live-otp-feed', 'fa-bell'],
      ['SMS Analytics', 'sms-analytics', 'fa-chart-line'],
      ['Failed SMS', 'failed-sms', 'fa-xmark'],
      ['Live Traffic', 'live-traffic', 'fa-chart-line'],
  ] },
  { t: "PROVIDERS GROUP", c: '#5aa93f', items: [
      ['Dashboard', 'smpp-dashboard', 'fa-grid-2'],
      ['SMPP Accounts', 'smpp-accounts', 'fa-users'],
      ['Login Panel', 'login-panels', 'fa-right-to-bracket'],
      ['CR API Connected Panel', 'cr-api-panels', 'fa-link'],
      ['SMPP Sessions', 'smpp-sessions', 'fa-eye'],
      ['DLR Monitor', 'dlr-monitor', 'fa-file-lines'],
      ['Throughput Monitor', 'throughput-monitor', 'fa-chart-line'],
      ['Connection Logs', 'connection-logs', 'fa-file-lines'],
  ] },
  { t: "REQUESTS GROUP", c: '#4caf50', items: [
      ['Registration Requests', 'registration-requests', 'fa-user-plus'],
      ['Payout Requests', 'payout-requests', 'fa-wallet'],
      ['Number Requests', 'agent-requests', 'fa-sim-card'],
  ] },
  { t: "MANAGEMENT GROUP", c: '#d94f4f', items: [
      ['Managers', 'managers', 'fa-user-tie'],
      ['Agents', 'agents', 'fa-user-secret'],
      ['Clients', 'clients', 'fa-user-group'],
      ['Hierarchy View', 'hierarchy', 'fa-sitemap'],
      ['Audit Logs', 'audit-logs', 'fa-shield'],
      ['Login Activity', 'login-activity', 'fa-user-clock'],
      ['Business Reports', 'business-reports', 'fa-file-lines'],
      ['Permissions', 'permissions', 'fa-key'],
  ] },
  { t: "API & WEBHOOKS", c: '#f0862d', items: [
      ['API Tokens', 'api-tokens', 'fa-key'],
      ['API Playground & Docs', 'api-playground', 'fa-terminal'],
      ['Webhook & Interconnect', 'webhook-config', 'fa-share-nodes'],
  ] },
  { t: "COMMUNICATION", c: '#8bc34a', items: [
      ['News &amp; Announcements', 'announcements', 'fa-bell'],
      ['Support Tickets', 'support-tickets', 'fa-circle-question'],
  ] },
  { t: "SECURITY CENTER", c: '#c0392b', items: [
      ['Firewall & Security', 'firewall-dashboard', 'fa-shield-halved'],
      ['Rate Limits', 'rate-limits', 'fa-lock'],
  ] },
  { t: "SETTINGS GROUP", c: '#7f8c8d', items: [
      ['General Settings', 'general-settings', 'fa-gear'],
      ['CLI Manager', 'cli-manager', 'fa-terminal'],
      ['Backup &amp; Restore', 'backup-restore', 'fa-rotate-right'],
  ] }
];


/* ── chart fallback: the admin pages use Chart.js from a CDN; if that is blocked
      we draw a simple line/bar chart ourselves so no page can crash ────────── */
if (typeof window.Chart === 'undefined') {
  window.Chart = function (cv, cfg) {
    cv = (cv && cv.canvas) ? cv.canvas : cv;
    const ds = ((cfg.data || {}).datasets || [{}])[0] || {};
    const data = (ds.data || []).map(v => Number(v) || 0);
    const labels = (cfg.data || {}).labels || [];
    const type = cfg.type || 'line';
    const box = cv.getBoundingClientRect();
    const W = cv.width = Math.max(240, box.width || 320);
    const H = cv.height = Math.max(160, box.height || 200);
    const c = cv.getContext('2d');
    const L = 40, R = 10, T = 12, B = 28, w = W - L - R, h = H - T - B;
    const top = Math.max(1, ...data);
    c.clearRect(0, 0, W, H); c.font = '11px Roboto, Arial, sans-serif';
    for (let i = 0; i <= 4; i++) {
      const y = Math.round(T + h - h * i / 4) + .5;
      c.strokeStyle = '#e2e2e2'; c.beginPath(); c.moveTo(L, y); c.lineTo(L + w, y); c.stroke();
      c.fillStyle = '#666'; c.textAlign = 'right'; c.textBaseline = 'middle';
      c.fillText(String(Math.round(top * i / 4)), L - 6, y);
    }
    const n = Math.max(1, data.length - (type === 'bar' ? 0 : 1));
    const colour = ds.borderColor || ds.backgroundColor || '#659A00';
    if (type === 'bar') {
      const bw = w / Math.max(1, data.length) * .6;
      data.forEach((v, i) => {
        const x = L + w * (i + .5) / data.length, y = T + h - h * v / top;
        c.fillStyle = typeof colour === 'string' ? colour : '#659A00';
        c.fillRect(x - bw / 2, y, bw, T + h - y);
      });
    } else {
      c.strokeStyle = typeof colour === 'string' ? colour : '#659A00';
      c.lineWidth = 2; c.beginPath();
      data.forEach((v, i) => { const x = L + w * i / n, y = T + h - h * v / top; i ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.stroke();
    }
    c.fillStyle = '#666'; c.textAlign = 'center'; c.textBaseline = 'top';
    labels.forEach((lb, i) => {
      if (labels.length > 8 && i % Math.ceil(labels.length / 6)) return;
      c.fillText(String(lb), L + w * i / n, T + h + 8);
    });
    this.destroy = function () { c.clearRect(0, 0, W, H); };
    this.update = function () {};
    this.data = cfg.data;
  };
  window.Chart.register = function () {};
}

/* ── build the shell from the menu model ───────────────────── */
(function zyBuildAdminShell() {
  const logo = document.getElementById('zy-logo');
  if (logo) {
    const siteName = (window.__BRAND_SETTINGS__ && window.__BRAND_SETTINGS__.site_name) || 'HUMAX SMS';
    const logoUrl = (window.__BRAND_SETTINGS__ && window.__BRAND_SETTINGS__.logo_url) || '/static/img/humax-sms-logo.png';
    logo.innerHTML = `<span class="zy-panel-badge"><img class="zy-badge-logo" src="${logoUrl}" alt="${siteName}" onerror="this.style.display='none';"> <span class="zy-badge-name">${siteName}</span></span>`;
    logo.onclick = null;
    logo.style.cursor = 'default';
  }

  const side = document.getElementById('zy-sidenav');
  if (side) side.innerHTML = ZY_ADMIN_MENU.map((g, gi) => {
    if (!g.t) {
      return g.items.map(([label, page, icon]) => {
        return `<div class="zy-snav nav-item" id="nav-${page}" data-page="${page}" role="link" tabindex="0"
                     onclick="loadPage('${page}')"
                     onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();loadPage('${page}');}">
           <span class="zy-ic"><i class="fas ${icon}" style="color:${g.c}"></i></span><span>${label}</span>
           <i class="fas fa-chevron-right zy-caret" style="opacity:0.65;font-size:10px;"></i></div>`;
      }).join('');
    }
    const subItems = g.items.map(([label, page]) =>
      `<div class="zy-ssub-item" id="nav-${page}" data-page="${page}" role="link" tabindex="0"
            onclick="loadPage('${page}')"
            onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();loadPage('${page}');}">${label}</div>`
    ).join('');
    return `<div class="zy-snav" id="grp-adm-${gi}" role="button" tabindex="0" aria-expanded="false" aria-controls="sb-${gi}"
                 onclick="zyToggleGroup('sb-${gi}', this)"
                 onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();zyToggleGroup('sb-${gi}', this);}">
              <span class="zy-ic"><i class="fas fa-folder" style="color:${g.c}"></i></span><span>${g.t}</span>
              <i class="fas fa-chevron-down zy-caret"></i></div>
            <div class="zy-ssub" id="sb-${gi}" role="region">${subItems}</div>`;
  }).join('');

  const foot = document.querySelector('.zy-side-foot');
  if (foot) {
    foot.innerHTML = '';
  }

  const mega = document.getElementById('zy-mega');
  if (mega) {
    mega.innerHTML = ZY_ADMIN_MENU.map(g => {
      if (!g.t) return g.items.map(([label, page, icon]) =>
        `<div class="zy-mblock"><div class="zy-mtop" onclick="loadPage('${page}')">
           <span class="zy-mi"><i class="fas ${icon}" style="color:${g.c}"></i></span>${label}</div></div>`).join('');
      return `<div class="zy-mblock">
                <div class="zy-mtop"><span class="zy-mi"><i class="fas fa-folder" style="color:${g.c}"></i></span>${g.t}</div>
                <div class="zy-msub">` +
        g.items.map(([label, page]) => `<div onclick="loadPage('${page}')">${label}</div>`).join('') +
        `</div></div>`;
    }).join('');
    /* the dashboard must be visible on load — the menu opens on the button */
  }

  function tick() {
    const el = document.getElementById('zy-clock'); if (!el) return;
    if (typeof window.zyFormatUtc === 'function') {
      el.textContent = window.zyFormatUtc(new Date());
    } else {
      const d = new Date(), p = n => String(n).padStart(2, '0');
      el.textContent = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    }
  }
  tick(); setInterval(tick, 1000);

  let u = 'Kamran_Bhatti';
  let r = 'Owner';
  try {
    const au = JSON.parse(sessionStorage.getItem('admin_user')) || {};
    if (au.username) u = au.username;
    if (au.role) r = au.role;
  } catch (e) {}
  ['mgr-username', 'mgr-username-side', 'zy-um-name'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === 'zy-um-name') el.textContent = `${u} (${r === 'Admin' ? 'Owner' : r})`;
      else el.textContent = u;
    }
  });
  const roleEl = document.getElementById('brand-role');
  if (roleEl) roleEl.textContent = 'Owner Panel';

  document.addEventListener('click', e => {
    const m = document.getElementById('zy-user-menu');
    if (m && !e.target.closest('.zy-head-right')) m.classList.remove('open');
  });
})();

function zyToggleMenu() { if (window.zyToggleSidebar) window.zyToggleSidebar(); }
function zyToggleUser(e) { e.stopPropagation(); document.getElementById('zy-user-menu')?.classList.toggle('open'); }
function zyToggleGroup(id, trigger) {
  if (window.zyToggleGroup && window.zyToggleGroup !== zyToggleGroup) {
    return window.zyToggleGroup(id || trigger);
  }
  const el = typeof id === 'string' ? (document.getElementById(id) || document.getElementById('sb-' + id) || document.getElementById('grp-adm-' + id)) : (id || trigger);
  if (!el) return;
  const nav = el.classList.contains('zy-snav') ? el : (document.querySelector(`[aria-controls="${el.id}"]`) || el.previousElementSibling);
  const sub = el.classList.contains('zy-ssub') ? el : (document.getElementById(el.getAttribute('aria-controls')) || el.nextElementSibling);
  if (!nav || !sub) return;
  const wasOpen = sub.classList.contains('open') || nav.classList.contains('open');
  const parent = nav.closest('.zy-sidenav') || document.getElementById('zy-sidenav');
  if (parent) {
    parent.querySelectorAll('.zy-snav').forEach(h => {
      if (h !== nav) {
        h.classList.remove('open');
        h.setAttribute('aria-expanded', 'false');
      }
    });
    parent.querySelectorAll('.zy-ssub').forEach(s => {
      if (s !== sub) s.classList.remove('open');
    });
  }
  if (wasOpen) {
    nav.classList.remove('open');
    nav.setAttribute('aria-expanded', 'false');
    sub.classList.remove('open');
  } else {
    nav.classList.add('open');
    nav.setAttribute('aria-expanded', 'true');
    sub.classList.add('open');
  }
}
window.zyToggleGroup = window.zyToggleGroup || zyToggleGroup;
function zySideSub(id, trigger) {
  return zyToggleGroup(trigger || id);
}
window.zySideSub = zySideSub;
function toggleSidebar() { if (window.zyToggleSidebar) window.zyToggleSidebar(); }
function toggleGroup(id) { zyToggleGroup(id); }

/* breadcrumb + close the sidebar drawer after navigating */
const ZY_ADMIN_LABELS = {};
ZY_ADMIN_MENU.forEach(g => g.items.forEach(([label, page]) => { ZY_ADMIN_LABELS[page] = label; }));
const _zyPrevLoad = loadPage;
loadPage = function (page) {
  _zyPrevLoad(page);
  const bc = document.getElementById('breadcrumb');
  if (bc) bc.textContent = ZY_ADMIN_LABELS[page] || bc.textContent || page;
  if (typeof zySyncAccordionActive === 'function') zySyncAccordionActive(page);
  if (window.zyCloseSidebar) window.zyCloseSidebar();
  document.getElementById('zy-user-menu')?.classList.remove('open');
  window.scrollTo({ top: 0 });
};
setTimeout(() => {
  const initPage = sessionStorage.getItem('admin_current_page') || 'dashboard';
  if (typeof zySyncAccordionActive === 'function') zySyncAccordionActive(initPage);
}, 100);

/* ═══ DASHBOARD — same layout as the manager/agent/client panels ═══
   (tiles → stat strips → chart → circle stats → panels)
   The data is the admin's own: /api/dashboard/stats + /api/sms/daily-stats  */
function zyLineChart(id, labels, values) {
  const cv = document.getElementById(id);
  if (!cv) return;
  const data = (values || []).map(v => Number(v) || 0);
  const draw = () => {
    const box = cv.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(240, box.width), H = Math.max(180, box.height);
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const L = 46, R = 14, T = 14, B = 34, w = W - L - R, h = H - T - B;
    const peak = Math.max(1, ...data);
    let step = Math.ceil(peak / 5); if (step < 1) step = 1;
    const top = step * 5;
    c.font = '13px Roboto, Arial, sans-serif'; c.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = Math.round(T + h - (h * i / 5)) + .5;
      c.strokeStyle = '#e2e2e2'; c.beginPath(); c.moveTo(L, y); c.lineTo(L + w, y); c.stroke();
      c.fillStyle = '#555'; c.textAlign = 'right'; c.textBaseline = 'middle';
      c.fillText(String(step * i), L - 8, y);
    }
    const n = Math.max(1, labels.length - 1);
    labels.forEach((lb, i) => {
      const x = Math.round(L + (w * i / n)) + .5;
      c.strokeStyle = '#e2e2e2'; c.beginPath(); c.moveTo(x, T); c.lineTo(x, T + h); c.stroke();
      c.fillStyle = '#555'; c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(lb, x, T + h + 10);
    });
    if (!data.length) return;
    const px = i => L + (w * i / n), py = v => T + h - (h * v / top);
    c.strokeStyle = '#334155'; c.lineWidth = 2.5; c.lineJoin = 'round'; c.beginPath();
    data.forEach((v, i) => i ? c.lineTo(px(i), py(v)) : c.moveTo(px(i), py(v)));
    c.stroke(); c.fillStyle = '#334155';
    data.forEach((v, i) => { c.beginPath(); c.arc(px(i), py(v), 5, 0, Math.PI * 2); c.fill(); });
  };
  draw();
  if (window._zyChartR) window.removeEventListener('resize', window._zyChartR);
  window._zyChartR = () => { clearTimeout(window._zyChartT); window._zyChartT = setTimeout(draw, 150); };
  window.addEventListener('resize', window._zyChartR);
}

const ZYT = {};
function zyTable(id, headers, rows, perPage) {
  ZYT[id] = { headers, rows, perPage: perPage || 5, sort: 0, dir: 1, page: 1 };
  return `<div id="${id}"></div>`;
}
function zySort(id, col) { const t = ZYT[id]; if (!t) return;
  if (t.sort === col) t.dir = -t.dir; else { t.sort = col; t.dir = 1; } t.page = 1; zyRender(id); }
function zyPage(id, p) { const t = ZYT[id]; if (!t) return;
  t.page = Math.min(Math.max(1, p), Math.max(1, Math.ceil(t.rows.length / t.perPage))); zyRender(id); }
function zyCell(c) { return (c && typeof c === 'object') ? c : { v: c, h: c }; }
function zyRender(id) {
  const t = ZYT[id], host = document.getElementById(id);
  if (!t || !host) return;
  const rows = t.rows.slice().sort((a, b) => {
    const x = zyCell(a[t.sort]).v, y = zyCell(b[t.sort]).v;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * t.dir;
    return String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true }) * t.dir;
  });
  const total = Math.max(1, Math.ceil(rows.length / t.perPage));
  const page = Math.min(t.page, total);
  const slice = rows.slice((page - 1) * t.perPage, page * t.perPage);
  const nums = []; for (let i = 1; i <= Math.min(total, 4); i++) nums.push(i);
  const pager = `<div class="zy-pager">
    <button ${page === 1 ? 'disabled' : ''} onclick="zyPage('${id}',1)">First</button>
    <button ${page === 1 ? 'disabled' : ''} onclick="zyPage('${id}',${page - 1})">Previous</button>
    ${nums.map(n => `<button class="${n === page ? 'on' : ''}" onclick="zyPage('${id}',${n})">${n}</button>`).join('')}
    <button ${page === total ? 'disabled' : ''} onclick="zyPage('${id}',${page + 1})">Next</button>
    <button ${page === total ? 'disabled' : ''} onclick="zyPage('${id}',${total})">Last</button></div>`;
  const head = t.headers.map((h, i) =>
    `<th class="${i === t.sort ? 'sorted' : ''}" onclick="zySort('${id}',${i})">${h}</th>`).join('');
  const body = slice.length
    ? slice.map(r => `<tr>${r.map((c, i) => `<td class="${i === t.sort ? 'sorted' : ''}">${zyCell(c).h ?? ''}</td>`).join('')}</tr>`).join('')
    : `<tr><td class="zy-empty" colspan="${t.headers.length}">No data available in table</td></tr>`;
  host.innerHTML = `${pager}<div class="zy-dt-wrap"><table class="zy-dt">
      <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

renderDashboard = async function () {
  if (typeof window !== 'undefined' && (window.__AUTH_BLOCKED__ || (window.SpeedAuth && !window.SpeedAuth.isLoggedIn()))) {
    return;
  }
  const c = document.getElementById('page-content');
  if (typeof zyUpdateBreadcrumb === 'function') {
    zyUpdateBreadcrumb('dashboard', 'SMS Dashboard');
  }
  try {
    const [stats, daily, ranges, agents, recentRes, periodStats] = await Promise.all([
      apiFetch('/api/dashboard/stats'),
      apiFetch('/api/sms/daily-stats'),
      apiFetch('/api/numbers/sms-ranges'),
      apiFetch('/api/agents?limit=50'),
      apiFetch('/api/sms/logs?limit=8').catch(() => ({ data: [] })),
      apiFetch('/api/sms/period-stats').catch(() => null)
    ]);
    if (!stats && !daily && !ranges && !agents) {
      return;
    }
    const s = stats || {};
    const d = daily || {};
    const p = periodStats || {};
    const traffic = d.weekly_traffic || s.traffic_data || [0, 0, 0, 0, 0, 0, 0];
    const recentSms = (recentRes && recentRes.data) || [];
    const labels = Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(); dt.setDate(dt.getDate() - (6 - i));
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const tiles = [
      ['Dashboard',   't_monitor', 'dashboard'],
      ['SMS Ranges',  't_flag',    'sms-ranges'],
      ['Managers',    't_person',  'managers'],
      ['Statistics',  't_donut',   'my-sms'],
      ['My Numbers',  't_calc',    'my-numbers']
    ];

    const todaySmsVal = p.today != null ? p.today : (d.today || s.total_sms_today || 0);
    const weeklySmsVal = p.week != null ? p.week : (d.this_week || 0);
    const monthlySmsVal = p.month != null ? p.month : (d.this_month || 0);
    const yearlySmsVal = p.year != null ? p.year : (s.this_year_sms || 0);

    const kpiCardsHtml = (typeof zyKpiCard === 'function') ? `
      <div class="zy-kpi-grid">
        ${zyKpiCard({
          title: "Today SMS",
          value: Number(todaySmsVal).toLocaleString(),
          icon: 'fa-calendar-day',
          color: '#16a34a',
          bgLight: 'rgba(22, 163, 74, 0.12)',
          sparklineData: traffic,
          onClick: "loadPage('my-sms')"
        })}
        ${zyKpiCard({
          title: "Weekly SMS",
          value: Number(weeklySmsVal).toLocaleString(),
          icon: 'fa-calendar-week',
          color: '#2563eb',
          bgLight: 'rgba(37, 99, 235, 0.12)',
          sparklineData: traffic,
          onClick: "loadPage('my-sms')"
        })}
        ${zyKpiCard({
          title: "Monthly SMS",
          value: Number(monthlySmsVal).toLocaleString(),
          icon: 'fa-calendar-alt',
          color: '#0891b2',
          bgLight: 'rgba(8, 145, 178, 0.12)',
          sparklineData: traffic.slice().reverse(),
          onClick: "loadPage('my-sms')"
        })}
        ${zyKpiCard({
          title: "Yearly SMS",
          value: Number(yearlySmsVal).toLocaleString(),
          icon: 'fa-calendar-check',
          color: '#7c3aed',
          bgLight: 'rgba(124, 58, 237, 0.12)',
          sparklineData: [yearlySmsVal || 0, yearlySmsVal || 0, yearlySmsVal || 0, yearlySmsVal || 0, yearlySmsVal || 0],
          onClick: "loadPage('my-sms')"
        })}
      </div>
    ` : '';

    const bottomKpiCardsHtml = (typeof zyKpiCard === 'function') ? `
      <div class="zy-section-title" style="margin-top:28px;margin-bottom:14px;">System Performance & Revenue</div>
      <div class="zy-kpi-grid">
        ${zyKpiCard({
          title: "Revenue",
          value: `$${Number(s.revenue_today || 0).toFixed(2)}`,
          icon: 'fa-dollar-sign',
          color: '#2563eb',
          bgLight: 'rgba(37, 99, 235, 0.12)',
          trend: 'Daily income',
          trendDir: 'up',
          sparklineData: traffic.map(v => Math.round(v * 0.15)),
          onClick: "loadPage('profit-stats')"
        })}
        ${zyKpiCard({
          title: "Active number pool",
          value: Number(s.active_numbers || 0).toLocaleString(),
          icon: 'fa-mobile-screen',
          color: '#0891b2',
          bgLight: 'rgba(8, 145, 178, 0.12)',
          trend: `${s.total_ranges || 0} ranges`,
          trendDir: 'neutral',
          sparklineData: [s.active_numbers || 0, s.active_numbers || 0, s.active_numbers || 0, s.active_numbers || 0, s.active_numbers || 0],
          onClick: "loadPage('my-numbers')"
        })}
        ${zyKpiCard({
          title: "Delivery rate",
          value: `${s.success_rate || 98.5}%`,
          icon: 'fa-circle-check',
          color: '#7c3aed',
          bgLight: 'rgba(124, 58, 237, 0.12)',
          trend: 'High deliverability',
          trendDir: 'up',
          sparklineData: [96, 97, 95, 98, 97, 99, s.success_rate || 98.5],
          onClick: "loadPage('delivery-logs')"
        })}
      </div>
    ` : '';

    const circles = [
      ['NEW ACCOUNTS',       'circ_accounts', s.active_users || 0],
      ['NEW RANGES',         'circ_numbers',  s.total_ranges || s.total_numbers || 0],
      ['EST. PROFIT WEEKLY', 'circ_sms',      `$${s.revenue_today || 0}`],
      ['TODAY SMS',          'stat_today',    todaySmsVal],
      ['SMS THIS WEEK',      'stat_7day',     weeklySmsVal]
    ];

    const rangeRows = (Array.isArray(ranges) ? ranges : ((ranges && ranges.data) || []))
      .slice(0, 25).map(r => [
        r.range_name || r.name || r.country || '—',
        r.prefix || '', r.payterm || '7/1', r.payout != null ? r.payout : ''
      ]);
    const agtRows = ((agents && agents.data) || []).slice(0, 25).map(a => [
      a.username || '', a.email || '', a.skype_id || '',
      { v: a.status || '', h: `<span class="zy-badge-active ${a.status === 'active' ? '' : 'zy-badge-off'}">${a.status === 'active' ? 'Active' : 'Inactive'}</span>` }
    ]);

    const recentSmsCardHtml = (typeof zyRecentSmsCard === 'function')
      ? zyRecentSmsCard(recentSms, { title: 'Recent System SMS Stream', onViewAll: "loadPage('my-sms')" })
      : '';

    c.innerHTML = `
      ${s.down_connections && s.down_connections.length ? `
        <div class="zy-alert">SMPP Connection Down — OTPs may be missed!<br>
          <small>${s.down_connections.map(x => `${x.company} (${x.status})`).join(', ')}</small></div>` : ''}

      <div class="zy-tiles">
        ${tiles.map(([t, ic, p]) => `<div class="zy-tile" onclick="loadPage('${p}')">${zyIcon(ic, 'zy-tileimg')}<span>${t}</span></div>`).join('')}
      </div>

      ${kpiCardsHtml}

      <div class="zy-dash-mid">
        <div class="zy-panel zy-chart-panel">
          <div class="zy-chart-title">SMS LAST 7 DAYS</div>
          <div class="zy-chart-box"><canvas id="zy-week-chart"></canvas></div>
        </div>
        <div class="zy-circles">
          ${circles.map(([t, ic, v]) => `<div class="zy-circle">
              <span class="zy-circle-ic">${zyIcon(ic)}</span>
              <span class="zy-circle-txt"><b>${v}</b><i>${t}</i></span></div>`).join('')}
        </div>
      </div>

      <div class="zy-section-title" style="margin-top:20px;">Today's System Summary</div>
      <div class="zy-dt-wrap" style="margin-bottom:22px;">
        <table class="zy-dt zy-dt-plain">
          <thead><tr><th style="cursor:default">Item</th><th style="cursor:default">Value</th></tr></thead>
          <tbody>
            <tr><td>Total SMS Today</td><td><b>${todaySmsVal}</b></td></tr>
            <tr><td>Revenue Today</td><td><b>$${s.revenue_today || 0}</b></td></tr>
            <tr><td>Active Numbers</td><td><b>${s.active_numbers || 0}</b></td></tr>
            <tr><td>Success Rate</td><td><span class="badge" style="background:#16a34a;color:#fff;">${s.success_rate || 0}%</span></td></tr>
            <tr><td>Pending Requests</td><td><b>${s.pending_requests || 0}</b></td></tr>
          </tbody>
        </table>
      </div>

      <div class="zy-dash-panels">
        <div class="zy-panel">
          <div class="zy-panel-head"><span class="zy-ph-ic">${zyIcon('list')}</span> Recent Billing Groups/Ranges
            <button class="zy-ph-plus" onclick="loadPage('sms-ranges')" title="SMS Ranges">${zyIcon('ui_plus')}</button>
          </div>
          <div class="zy-panel-body">${zyTable('zy-mgrs', ['Range Name', 'Prefix', 'Payterm', 'Payout'], rangeRows, 5)}</div>
        </div>

        <div class="zy-panel">
          <div class="zy-panel-head"><span class="zy-ph-ic">${zyIcon('users')}</span> Recent Agents
            <button class="zy-ph-plus" onclick="loadPage('agents')" title="Agents">${zyIcon('ui_plus')}</button>
          </div>
          <div class="zy-panel-body">${zyTable('zy-agts', ['Username', 'Email', 'Skype', 'Status'], agtRows, 5)}</div>
        </div>
      </div>

      ${bottomKpiCardsHtml}`;

    zyRender('zy-mgrs'); zyRender('zy-agts');
    zyLineChart('zy-week-chart', labels, traffic);
  } catch (err) {
    console.error('Admin dashboard error:', err);
    c.innerHTML = `<div class="zy-panel"><div class="zy-panel-body" style="text-align:center;padding:30px;">
        Dashboard could not load. <button class="zy-gear" onclick="renderDashboard()">Retry</button></div></div>`;
  }
};

/* ═══ SMS CDR STATS (My SMS) — authentic speed panel layout ═══ */
window.zyAdminSwitchTab = function (tabId) {
  const isSummary = tabId === 'grouped';
  document.querySelectorAll('.zy-cdr-tab').forEach(t => {
    const active = t.id === `tab-${tabId}`;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active);
  });
  if (isSummary) {
    const checked = Array.from(document.querySelectorAll('.grp-chk:checked'));
    if (!checked.length) {
      const dateChip = document.getElementById('grp-chip-date');
      if (dateChip) {
        dateChip.checked = true;
        dateChip.closest('.zy-chip-pill')?.classList.add('active');
      }
    }
  } else {
    document.querySelectorAll('.grp-chk').forEach(cb => {
      cb.checked = false;
      cb.closest('.zy-chip-pill')?.classList.remove('active');
    });
  }
  renderMySmsLoad(isSummary);
};

window.zyAdminDatePreset = function (key) {
  if (typeof zyApplyDatePreset === 'function') {
    zyApplyDatePreset(key, 'rp-from', 'rp-to', '.zy-date-presets');
  }
  renderMySmsLoad();
};

window.zyAdminResetFilters = function () {
  const defaultFrom = typeof zyDefaultFromDateTime === 'function' ? zyDefaultFromDateTime() : `${(typeof zyToday === 'function' ? zyToday() : new Date().toISOString().slice(0, 10))} 00:00:00`;
  const defaultTo = typeof zyDefaultToDateTime === 'function' ? zyDefaultToDateTime() : `${(typeof zyToday === 'function' ? zyToday() : new Date().toISOString().slice(0, 10))} 23:59:59`;
  const elFrom = document.getElementById('rp-from');
  if (elFrom) elFrom.value = defaultFrom;
  const elTo = document.getElementById('rp-to');
  if (elTo) elTo.value = defaultTo;
  ['rp-range', 'rp-manager', 'rp-agent', 'rp-client', 'rp-num', 'rp-cli'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.querySelectorAll('.grp-chk').forEach(cb => {
    cb.checked = false;
    cb.closest('.zy-chip-pill')?.classList.remove('active');
  });
  document.querySelectorAll('.zy-preset-chip').forEach(c => {
    const isToday = c.getAttribute('data-preset') === 'today';
    c.classList.toggle('active', isToday);
    c.setAttribute('aria-pressed', isToday);
  });
  document.querySelectorAll('.zy-cdr-tab').forEach(t => {
    const isDetailed = t.id === 'tab-detailed';
    t.classList.toggle('active', isDetailed);
    t.setAttribute('aria-selected', isDetailed);
  });
  if (typeof toast === 'function') toast('Filters reset', 'info');
  renderMySmsLoad(false);
};

renderMySms = async function (summary = false) {
  const c = document.getElementById('page-content');
  if (typeof zyCrumb === 'function') {
    zyCrumb(['SMS Stats & Reports']);
  }
  const bc = document.getElementById('breadcrumb');
  if (bc) bc.textContent = 'SMS Stats & Reports';

  const today = (typeof zyToday === 'function' ? zyToday() : new Date().toISOString().slice(0, 10));
  const defaultFrom = `${today} 00:00:00`;
  const defaultTo = `${today} 23:59:59`;

  const groupChips = [
    { id: 'hour', label: 'Hour', val: 'hour' },
    { id: 'date', label: 'Date', val: 'date' },
    { id: 'month', label: 'Month', val: 'month' },
    { id: 'provider', label: 'Provider', val: 'provider' },
    { id: 'range', label: 'Range', val: 'range' },
    { id: 'manager', label: 'Manager', val: 'manager' },
    { id: 'agent', label: 'Agent', val: 'agent' },
    { id: 'number', label: 'Number', val: 'number' },
    { id: 'cli', label: 'CLI', val: 'cli' }
  ];

  const chipsHtml = groupChips.map(g => `
    <label class="zy-chip-pill" for="grp-adm-${g.id}">
      <input type="checkbox" id="grp-adm-${g.id}" class="grp-chk" value="${g.val}" onchange="this.closest('.zy-chip-pill').classList.toggle('active', this.checked)">
      ${g.label}
    </label>
  `).join('');

  c.innerHTML = `
    <div class="zy-intro" style="font-size:12px;color:#64748b;margin-bottom:10px;">Here You can view all the call detail records.</div>
    <!-- APX / ZY COMPACT FILTER BAR -->
    <div class="zy-filter-grid" data-apx="filter-bar" style="margin-bottom:14px;">
      <div class="zy-filter-grid-fields">
        <div>
          <label for="rp-from">From</label>
          <input type="text" id="rp-from" class="apx-input" style="width:100%;" value="${defaultFrom}" placeholder="YYYY-MM-DD HH:mm:ss" onclick="if(window.zyOpenDatePicker)window.zyOpenDatePicker(this)">
        </div>
        <div>
          <label for="rp-to">To</label>
          <input type="text" id="rp-to" class="apx-input" style="width:100%;" value="${defaultTo}" placeholder="YYYY-MM-DD HH:mm:ss" onclick="if(window.zyOpenDatePicker)window.zyOpenDatePicker(this)">
        </div>
        <div>
          <label for="rp-provider">Provider</label>
          <select id="rp-provider" class="apx-select" style="width:100%;">
            <option value="">Filter Provider</option>
          </select>
        </div>
        <div>
          <label for="rp-range">Range</label>
          <select id="rp-range" class="apx-select" style="width:100%;">
            <option value="">Filter Range</option>
          </select>
        </div>
        <div>
          <label for="rp-agent">Agent</label>
          <select id="rp-agent" class="apx-select" style="width:100%;">
            <option value="">Filter Agent</option>
          </select>
        </div>
        <div>
          <label for="rp-manager">Manager</label>
          <select id="rp-manager" class="apx-select" style="width:100%;">
            <option value="">Filter Manager</option>
          </select>
        </div>
        <div>
          <label for="rp-client">Client</label>
          <input type="text" id="rp-client" class="apx-input" style="width:100%;" placeholder="Filter Client">
        </div>
        <div>
          <label for="rp-num">Search Number</label>
          <input type="text" id="rp-num" class="apx-input" style="width:100%;" placeholder="Search Number">
        </div>
        <div>
          <label for="rp-cli">Search CLI</label>
          <input type="text" id="rp-cli" class="apx-input" style="width:100%;" placeholder="Search CLI">
        </div>
        <div>
          <label for="rp-status">Cause</label>
          <select id="rp-status" class="apx-select" style="width:100%;">
            <option value="All">All</option>
            <option value="1">Success</option>
            <option value="2">ScrubAg</option>
            <option value="3">Others</option>
          </select>
        </div>
      </div>
      <div class="zy-groupby-card apx-groupby-card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:8px;padding:6px 10px;border-top:1px solid rgba(0,0,0,0.08);">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="font-size:11px;font-weight:700;color:#334155;text-transform:uppercase;">Group By :</span>
          <div style="display:inline-flex;gap:4px;flex-wrap:wrap;">
            ${chipsHtml}
          </div>
        </div>
        <div style="display:flex;gap:6px;">
          <button type="button" class="zy-btn-amber apx-btn apx-btn-warning apx-btn-small" id="btn-export-report" onclick="zyExportCdrAdminStream()" style="height:28px;padding:0 12px;font-size:11.5px;font-weight:700;">
            <i class="fas fa-file-export"></i> Export Report
          </button>
          <button type="button" class="zy-btn-blue-solid apx-btn apx-btn-primary apx-btn-small" id="btn-show-report" onclick="renderMySmsLoad()" style="height:28px;padding:0 14px;font-size:11.5px;font-weight:700;">
            <i class="fas fa-chart-column"></i> Show Report
          </button>
        </div>
      </div>
      <div class="zy-filter-divider" style="height:1px;background:#e2e8f0;margin:4px 0;"></div>

      <div class="zy-table-toolbar">
        <div class="zy-toolbar-left">
          <div class="zy-search-wrap">
            <i class="fas fa-search"></i>
            <input type="text" class="zy-toolbar-search" placeholder="Search..." oninput="if(typeof zyToolbarFilter==='function')zyToolbarFilter(this.value)">
          </div>
          <div class="zy-toolbar-select-wrap">
            <label class="zy-toolbar-label" for="rp-limit">Show Records</label>
            <select id="rp-limit" class="zy-toolbar-select" onchange="renderMySmsLoad()">
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
    </div>

    <!-- Results Panel: SMS REPORTS & STATS -->
    <div class="zy-panel" style="border:1px solid #cbd5e1;border-radius:4px;background:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.05);overflow:hidden;">
      <div class="zy-panel-head" style="background:#f1f5f9;border-bottom:1px solid #cbd5e1;padding:10px 14px;font-size:13.5px;font-weight:700;color:#1e293b;letter-spacing:0.3px;text-transform:uppercase;">
        SMS REPORTS &amp; STATS
      </div>
      <div class="zy-panel-body" id="rp-body" style="padding:14px;">
        <div class="zy-loading" style="padding:40px;text-align:center;color:#64748b;">Loading CDR records…</div>
      </div>
    </div>
  `;

  // Populate Dropdowns from APIs
  try {
    const [rangesRes, managersRes, agentsRes, providersRes] = await Promise.all([
      apiFetch('/api/numbers/sms-ranges').catch(() => []),
      apiFetch('/api/users?role=Manager&limit=1000').catch(() => ({ data: [] })),
      apiFetch('/api/agents?limit=1000').catch(() => ({ data: [] })),
      apiFetch('/api/providers?limit=1000').catch(() => ({ data: [] }))
    ]);

    const ranges = (Array.isArray(rangesRes) ? rangesRes : (rangesRes && rangesRes.data)) || [];
    const managers = (managersRes && managersRes.data) || [];
    const agents = (agentsRes && agentsRes.data) || [];
    const providers = (providersRes && providersRes.data) || [];

    const pEl = document.getElementById('rp-provider');
    if (pEl) {
      pEl.innerHTML = '<option value="">Filter Provider</option>' +
        providers.map(p => {
          const pName = p.name || p.provider_name || p.id;
          return `<option value="${zyEsc(pName)}">${zyEsc(pName)}</option>`;
        }).join('');
    }

    const rEl = document.getElementById('rp-range');
    if (rEl) {
      rEl.innerHTML = '<option value="">Filter Range</option>' +
        ranges.map(r => {
          const rName = r.range_name || r.name || r.country || r.id;
          return `<option value="${zyEsc(rName)}">${zyEsc(rName)}</option>`;
        }).join('');
    }

    const aEl = document.getElementById('rp-agent');
    if (aEl) {
      aEl.innerHTML = '<option value="">Filter Agent</option>' +
        agents.map(ag => `<option value="${ag.id}">${zyEsc(ag.username || ag.name || ag.id)}</option>`).join('');
    }

    const mEl = document.getElementById('rp-manager');
    if (mEl) {
      mEl.innerHTML = '<option value="">Filter Manager</option>' +
        managers.map(mg => `<option value="${mg.id}">${zyEsc(mg.username || mg.name || mg.id)}</option>`).join('');
    }
  } catch (err) {
    console.warn('Error populating filters:', err);
  }

  // Load initial report
  renderMySmsLoad(summary);
};

// Helper for Export Report button matching video format & streaming
window.zyExportCdrAdminStream = function() {
  const val = id => (document.getElementById(id) || {}).value || '';
  const checkedBoxes = Array.from(document.querySelectorAll('.grp-chk:checked')).map(cb => cb.value);
  zyExportCdrStream({
    date_from: val('rp-from'),
    date_to: val('rp-to'),
    range: val('rp-range'),
    client_id: val('rp-client'),
    search: val('rp-num'),
    cli: val('rp-cli'),
    group_by: checkedBoxes.join(',')
  });
};
window.zyExportCdrVideoFormat = window.zyExportCdrAdminStream;

async function renderMySmsLoad(pageOrSummary = 1) {
  const targetPage = typeof pageOrSummary === 'number' ? pageOrSummary : 1;
  const isSummaryMode = typeof pageOrSummary === 'boolean' ? pageOrSummary : false;

  const body = document.getElementById('rp-body');
  if (!body) return;

  if (window._adminCdrAbortController) {
    try { window._adminCdrAbortController.abort(); } catch (_) {}
  }
  window._adminCdrAbortController = new AbortController();
  const reqSignal = window._adminCdrAbortController.signal;

  body.innerHTML = `<div class="zy-loading" style="padding:40px;text-align:center;color:#64748b;">
    <div style="display:inline-block;margin-bottom:8px;"><i class="fas fa-spinner fa-spin fa-2x" style="color:#0ea5e9;"></i></div>
    <div>Loading CDR records…</div>
  </div>`;

  const val = id => (document.getElementById(id) || {}).value || '';
  const from = val('rp-from'), to = val('rp-to');
  const provider = val('rp-provider');
  const range = val('rp-range');
  const agentId = val('rp-agent');
  const managerId = val('rp-manager');
  const num = val('rp-num'), cli = val('rp-cli');
  const status = val('rp-status');

  const checkedBoxes = Array.from(document.querySelectorAll('.grp-chk:checked')).map(cb => cb.value);

  const params = new URLSearchParams();
  if (from) params.append('date_from', from);
  if (to) params.append('date_to', to);
  if (provider) params.append('provider', provider);
  if (range) params.append('range', range);
  if (agentId) params.append('agent_id', agentId);
  if (managerId) params.append('manager_id', managerId);
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
      // ── Grouped Mode ──
      const keyLabels = {
        hour: 'Hour',
        date: 'Date',
        daily: 'Date',
        month: 'Month',
        year: 'Year',
        provider: 'Provider',
        range: 'Range',
        manager: 'Manager',
        agent: 'Agent',
        number: 'Number',
        cli: 'CLI'
      };
      const cols = [
        ...checkedBoxes.map(k => keyLabels[k] || k),
        'SMS Count',
        'Currency',
        'My Payout',
        'Agent Payout',
        'Profit'
      ];
      const rows = data.map(g => [
        ...checkedBoxes.map(k => g[k] || '—'),
        g.sms_count || 0,
        g.currency || '$',
        Number(g.payout || 0).toFixed(4),
        Number(g.agent_payout != null ? g.agent_payout : (g.client_payout || 0)).toFixed(4),
        Number(g.profit != null ? g.profit : ((g.payout || 0) - (g.client_payout || 0))).toFixed(4)
      ]);

      const sumTotals = typeof zyBuildCdrTotalRow === 'function' ? zyBuildCdrTotalRow(data, true, { summary: logs.summary }) : null;
      const totalGroups = sumTotals ? sumTotals.count : data.length;
      const totalSms = sumTotals ? sumTotals.totalSms : (logs.summary && logs.summary.total_sms != null ? logs.summary.total_sms : data.reduce((s, g) => s + (g.sms_count || 0), 0));
      const totalPayout = sumTotals ? sumTotals.totalPayout : (logs.summary && logs.summary.payout != null ? logs.summary.payout : data.reduce((s, g) => s + (parseFloat(g.payout) || 0), 0));
      const totalAgentPayout = sumTotals ? sumTotals.totalClientPayout : (logs.summary && logs.summary.client_payout != null ? logs.summary.client_payout : data.reduce((s, g) => s + (parseFloat(g.agent_payout != null ? g.agent_payout : g.client_payout) || 0), 0));
      const totalProfit = sumTotals ? sumTotals.totalProfit : (logs.summary && logs.summary.profit != null ? logs.summary.profit : Math.max(0, totalPayout - totalAgentPayout));

      const footRow = `<td><b>Total Groups: ${totalGroups}</b><br><small>Total SMS: ${totalSms.toLocaleString()}</small></td>` +
        '<td></td>'.repeat(Math.max(0, checkedBoxes.length - 1)) +
        `<td><b>${totalSms.toLocaleString()}</b></td>` +
        `<td><b>$</b></td>` +
        `<td><b>${totalPayout.toFixed(4)}</b></td>` +
        `<td><b>${totalAgentPayout.toFixed(4)}</b></td>` +
        `<td><b>${totalProfit.toFixed(4)}</b></td>`;

      body.innerHTML = zyDT2('dt-cdr', {
        cols,
        rows,
        sort: checkedBoxes.length,
        dir: -1,
        perPage: limitNum,
        serverMode: false,
        footRow
      });
      zy2Render('dt-cdr');
    } else {
      // ── Detailed Ungrouped Mode (Matching Video Columns 1:1) ──
      const cols = [
        'Date',
        'Provider',
        'Range',
        'Type',
        'Number',
        'CLI',
        'SMS',
        'Agent',
        'Manager',
        'Currency',
        'My Payout',
        'Agent Payout',
        'Profit',
        'Cause',
        'IP'
      ];

      const rows = data.map(s => {
        const dtStr = (s.timestamp || s.date || '').replace('T', ' ').slice(0, 19);
        const myPayoutVal = parseFloat(s.my_payout != null ? s.my_payout : (s.company_rate != null ? s.company_rate : (s.payout || 0))) || 0;
        const agentPayoutVal = parseFloat(s.agent_payout != null ? s.agent_payout : (s.agent_rate != null ? s.agent_rate : 0)) || 0;
        const profitVal = Math.max(0, myPayoutVal - agentPayoutVal);
        const causeVal = (s.cause || (s.status === 'delivered' || s.status === 'success' ? 'Success' : (s.status || '—')));

        const copyBtn = s.number ? `<button type="button" class="zy-num-copy-btn" onclick="event.stopPropagation();window.zyCopyNumber('${zyEsc(s.number)}', this)" title="Copy number" style="background:none;border:none;cursor:pointer;padding:2px 4px;font-size:12px;color:#94a3b8;border-radius:3px;transition:all 0.15s ease;" onmouseover="this.style.color='#10b981'" onmouseout="this.style.color='#94a3b8'"><i class="far fa-copy"></i></button>` : '';
        const numberHtml = s.number ? `<span style="display:inline-flex;align-items:center;gap:6px;"><span style="font-family:monospace;font-weight:600;">${zyEsc(s.number)}</span>${copyBtn}</span>` : '—';

        return [
          dtStr,
          s.provider || '—',
          s.range || s.range_name || s.range_label || s.country || '—',
          s.type || 'General',
          { v: s.number || '', h: numberHtml },
          typeof zyEsc === 'function' ? zyEsc(s.cli || s.app || '—') : (s.cli || s.app || '—'),
          typeof zyHighlightOtp === 'function' ? zyHighlightOtp(s.message || '') : (typeof zyEsc === 'function' ? zyEsc(s.message || '') : (s.message || '')),
          typeof zyEsc === 'function' ? zyEsc(s.agent || s.agent_name || s.user || '—') : (s.agent || s.agent_name || s.user || '—'),
          s.manager || '—',
          s.currency || '$',
          myPayoutVal ? zyFmtMoney(myPayoutVal, 4) : '0',
          agentPayoutVal ? zyFmtMoney(agentPayoutVal, 4) : '0',
          profitVal ? zyFmtMoney(profitVal, 4) : '0',
          causeVal,
          s.ip || '—'
        ];
      });

      const sum = logs.summary || {};
      const totalSms = (sum.total_sms != null) ? sum.total_sms : (logs.total != null ? logs.total : rows.length);

      let sumMyPayout = 0;
      let sumAgentPayout = 0;
      rows.forEach(r => {
        sumMyPayout += parseFloat(zyCell2(r[10]).v) || 0;
        sumAgentPayout += parseFloat(zyCell2(r[11]).v) || 0;
      });
      const sumProfit = Math.max(0, sumMyPayout - sumAgentPayout);

      // Foot row matching AURA Softswitch: Total SMS, Multi-currency Payouts (USD, EUR, GBP) and Profit
      const mc = sum.multi_currency || {};
      const usdIn = mc.USD ? mc.USD.in : (sum.payout != null ? sum.payout : sumMyPayout);
      const eurIn = mc.EUR ? mc.EUR.in : 0;
      const gbpIn = mc.GBP ? mc.GBP.in : 0;

      const usdOut = mc.USD ? mc.USD.out : (sum.client_payout != null ? sum.client_payout : sumAgentPayout);
      const eurOut = mc.EUR ? mc.EUR.out : 0;
      const gbpOut = mc.GBP ? mc.GBP.out : 0;

      const usdPr = mc.USD ? mc.USD.profit : (sum.profit != null ? sum.profit : sumProfit);
      const eurPr = mc.EUR ? mc.EUR.profit : 0;
      const gbpPr = mc.GBP ? mc.GBP.profit : 0;

      const myPayoutBlock = `<div style="font-size:11px;line-height:1.4;">
        <span class="aura-badge-usd apx-badge-usd">USD: ${zyFmtMoney(usdIn, 4)}</span><br>
        <span class="aura-badge-eur apx-badge-eur">EUR: ${zyFmtMoney(eurIn, 4)}</span><br>
        <span class="aura-badge-gbp apx-badge-gbp">GBP: ${zyFmtMoney(gbpIn, 4)}</span>
      </div>`;

      const agentPayoutBlock = `<div style="font-size:11px;line-height:1.4;">
        <span class="aura-badge-usd apx-badge-usd">USD: ${zyFmtMoney(usdOut, 4)}</span><br>
        <span class="aura-badge-eur apx-badge-eur">EUR: ${zyFmtMoney(eurOut, 4)}</span><br>
        <span class="aura-badge-gbp apx-badge-gbp">GBP: ${zyFmtMoney(gbpOut, 4)}</span>
      </div>`;

      const profitBlock = `<div style="font-size:11px;line-height:1.4;">
        <span class="aura-badge-usd apx-badge-usd">USD: ${zyFmtMoney(usdPr, 4)}</span><br>
        <span class="aura-badge-eur apx-badge-eur">EUR: ${zyFmtMoney(eurPr, 4)}</span><br>
        <span class="aura-badge-gbp apx-badge-gbp">GBP: ${zyFmtMoney(gbpPr, 4)}</span>
      </div>`;

      const footRow = `<td><b>Total SMS<br>${totalSms.toLocaleString()}</b></td>` +
        '<td></td>'.repeat(8) +
        `<td><b>Multi</b></td>` +
        `<td><b>My Payout</b><br>${myPayoutBlock}</td>` +
        `<td><b>Agent Payout</b><br>${agentPayoutBlock}</td>` +
        `<td><b>Profit</b><br>${profitBlock}</td>` +
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
        onPageChange: (p) => renderMySmsLoad(p),
        onSizeChange: (s) => {
          const sel = document.getElementById('rp-limit');
          if (sel) sel.value = String(s);
          renderMySmsLoad(1);
        },
        footRow
      });
      zy2Render('dt-cdr');
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    console.error('SMS CDR Stats load error:', err);
    body.innerHTML = '<div class="zy-empty" style="padding:40px;text-align:center;color:#ef4444;">Failed to load SMS CDR stats. Please try again.</div>';
  }
}


