/* ═══════════════════════════════════════════════════════════════
   𝑴𝑨𝑰𝑻 𝑺𝑴𝑺 — Manager Panel shell + dashboard
   Loads AFTER manager.js and manager_features.js
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
    document.body.classList.add(effective, 'rmsui');
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

/* ── V2 Manager menu model ───────────────────────────────────── */
const ZY_MENU = {
  'dashboard':   { t: 'Dashboard',        ic: 'dashboard', page: 'dashboard' },
  'clisearch':   { t: 'CLI Search',       ic: 'search',    page: 'access-search' },
  'smsmodule':   { t: 'NUMBERS GROUP',    ic: 'envelope',
    sub: [
      ['My Numbers', 'my-numbers'],
      ['Bulk Allocation', 'assign-numbers'],
      ['Ranges & Rate Card', 'sms-overview']
    ]
  },
  'smstest':     { t: 'SMS Test Panel',   ic: 'rss',       page: 'sms-test-panel' },
  'users':       { t: 'MANAGEMENT',       ic: 'user',
    sub: [
      ['Agents', 'agents'],
      ['Clients', 'clients'],
      ['Notifications', 'news']
    ]
  },
  'cdr':         { t: 'SMS & CDR',        ic: 'chart',     page: 'reports' },
  'payments':    { t: 'FINANCE',          ic: 'dollar',
    sub: [
      ['Payment Requests', 'payout-requests'],
      ['Credit Notes', 'my-earnings'],
      ['Statements', 'usd-statements']
    ]
  },
  'account':     { t: 'Account',          ic: 'profile',
    sub: [
      ['My Profile', 'profile'],
      ['REST API', 'api-tokens'],
      ['Transfer History', 'transfer-history']
    ]
  }
};
const ZY_SIDE_ORDER = ['dashboard', 'clisearch', 'smsmodule', 'smstest', 'users', 'cdr', 'payments'];
const ZY_MEGA_ORDER = ['dashboard', 'clisearch', 'smsmodule', 'smstest', 'users', 'cdr', 'payments', 'account'];

const ZY_LABELS = {
  'dashboard': 'Dashboard',
  'access-search': 'CLI Search',
  'sms-overview': 'Ranges & Rate Card',
  'my-numbers': 'My Numbers',
  'payout-rates-view': 'Ranges & Rate Card',
  'sms-ratecard': 'Ranges & Rate Card',
  'assign-numbers': 'Bulk Allocation',
  'agents': 'Agents',
  'clients': 'Clients',
  'news': 'Notifications',
  'reports': 'CDR & Statistics',
  'my-earnings': 'Credit Notes',
  'payout-requests': 'Payment Requests',
  'sms-test-panel': 'SMS Test Panel',
  'add-agent': 'Add Agent',
  'add-client': 'Add Client',
  'profile': 'My Profile',
  'agent-performance': 'Agent Performance',
  'client-balances': 'Client Balances',
  'client-limits': 'Limits & Quotas',
  'traffic': 'Live Traffic',
  'api-tokens': 'REST API',
  'assign-to-client': 'Assign to Client',
  'transfer-history': 'Transfer History',
  'usd-statements': 'USD Statements',
  'eur-statements': 'EUR Statements',
  'gbp-statements': 'GBP Statements'
};


/* ── Icons — cut straight from the source panel (same colours, 1:1) ── */
const ZY_ICON_BASE = window.ZY_ICON_BASE || '/static/img/icons/';
function zyIcon(n, cls) {
  const data = window.ZY_ICONS_DATA && window.ZY_ICONS_DATA[n];
  return `<img class="${cls || 'zy-icimg'}" src="${data || (ZY_ICON_BASE + n + '.png')}" alt="">`;
}

/* ── ALPHA SMS brand (logo + wordmark) ────────────────────────── */
const ZY_LOGO_SRC = window.ZY_LOGO_SRC || '/static/img/humax-sms-logo.png';
const ZY_LOGO = `
<svg viewBox="0 0 250 62" xmlns="http://www.w3.org/2000/svg" style="height:44px;width:auto;display:block;">
  <defs>
    <linearGradient id="zyg-mgr" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="50%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#cbd5e1"/>
    </linearGradient>
  </defs>
  <g fill="url(#zyg-mgr)" font-family="Arial Black, Arial, sans-serif" font-size="38" font-weight="900"
     letter-spacing="5" transform="skewX(-4)">
    <text x="6" y="38">ALPHA</text>
  </g>
  <path d="M88 6 L108 6 L92 34 Z" fill="#8FE51F" opacity=".95"/>
  <text x="14" y="55" fill="#8FE51F" font-family="Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="8">SMS</text>
  <rect x="75" y="50" width="85" height="2" fill="#8FE51F"/>
</svg>`;

/* ── Dashboard tile icons (cut from the source panel) ───────── */
const ZY_ICONS = {
  monitor: zyIcon('t_monitor', 'zy-tileimg'),
  flag:    zyIcon('t_flag',    'zy-tileimg'),
  person:  zyIcon('t_person',  'zy-tileimg'),
  donut:   zyIcon('t_donut',   'zy-tileimg'),
  calc:    zyIcon('t_calc',    'zy-tileimg')
};

/* ── Build the shell ────────────────────────────────────────── */
(function zyBuildShell() {
  const logo = document.getElementById('zy-logo');
  if (logo) {
    const siteName = (window.__BRAND_SETTINGS__ && window.__BRAND_SETTINGS__.site_name) || 'HUMAX SMS';
    const logoUrl = (window.__BRAND_SETTINGS__ && window.__BRAND_SETTINGS__.logo_url) || '/static/img/humax-sms-logo.png';
    logo.innerHTML = `<span class="zy-panel-badge"><img class="zy-badge-logo" src="${logoUrl}" alt="${siteName}" onerror="this.style.display='none';"> <span class="zy-badge-name">${siteName}</span></span>`;
    logo.onclick = null;
    logo.style.cursor = 'default';
  }

  /* sidebar */
  const side = document.getElementById('zy-sidenav');
  if (side) {
    side.innerHTML = ZY_SIDE_ORDER.map(key => {
      const m = ZY_MENU[key];
      if (m.page) {
        return `<div class="zy-snav nav-item" id="nav-${m.page}" data-page="${m.page}" role="link" tabindex="0"
                     onclick="loadPage('${m.page}')"
                     onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();loadPage('${m.page}');}">
                  <span class="zy-ic">${zyIcon(m.ic)}</span><span>${m.t}</span>
                  <i class="fas fa-chevron-right zy-caret" style="opacity:0.65;font-size:10px;"></i>
                </div>`;
      }
      const subItems = (m.sub || []).map(([t, p]) =>
        `<div class="zy-ssub-item" id="nav-${p}" data-page="${p}" role="link" tabindex="0"
              onclick="loadPage('${p}')"
              onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();loadPage('${p}');}">
           <span>${t}</span>
         </div>`
      ).join('');
      return `<div class="zy-snav" id="grp-${key}" role="button" tabindex="0" aria-expanded="false" aria-controls="sb-${key}"
                   onclick="zyToggleGroup('sb-${key}', this)"
                   onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();zyToggleGroup('sb-${key}', this);}">
                <span class="zy-ic">${zyIcon(m.ic)}</span><span>${m.t}</span>
                <i class="fas fa-chevron-down zy-caret"></i>
              </div>
              <div class="zy-ssub" id="sb-${key}" role="region">${subItems}</div>`;
    }).join('');
  }

  const foot = document.querySelector('.zy-side-foot');
  if (foot) {
    foot.innerHTML = '';
  }

  /* mega menu */
  const mega = document.getElementById('zy-mega');
  if (mega) {
    mega.innerHTML = ZY_MEGA_ORDER.map(key => {
      const m = ZY_MENU[key];
      const click = m.page ? `loadPage('${m.page}')` : '';
      const sub = m.sub ? `<div class="zy-msub">` +
        m.sub.map(([t, p]) => `<div onclick="loadPage('${p}')">${t}</div>`).join('') + `</div>` : '';
      return `<div class="zy-mblock">
                <div class="zy-mtop" ${click ? `onclick="${click}"` : ''}>
                  <span class="zy-mi">${zyIcon(m.ic)}</span>${m.t}
                </div>${sub}</div>`;
    }).join('');
    if (window.innerWidth >= 992) mega.classList.add('open');
  }

  /* clock */
  function tick() {
    const el = document.getElementById('zy-clock');
    if (!el) return;
    if (typeof window.zyFormatUtc === 'function') {
      el.textContent = window.zyFormatUtc(new Date());
    } else {
      const d = new Date(), p = n => String(n).padStart(2, '0');
      el.textContent = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    }
  }
  tick(); setInterval(tick, 1000);

  /* usernames — read from whichever role object is present, else the session.
     The same shell serves Manager / Agent / Client, so fill every id. */
  let sess = {};
  try { sess = JSON.parse(sessionStorage.getItem('admin_user') || '{}'); } catch (e) {}
  const roleUser = window.MANAGER_USER || window.AGENT_USER || window.CLIENT_USER || sess;
  const u = (roleUser && roleUser.username) || sess.username || '';
  ['mgr-username', 'mgr-username-side', 'agent-username', 'client-username', 'zy-um-name'].forEach(id => {
    const el = document.getElementById(id); if (el && u) el.textContent = u;
  });
  const sub = document.getElementById('mgr-name-sub');
  if (sub) sub.textContent = 'Manager Panel';

  document.addEventListener('click', e => {
    const m = document.getElementById('zy-user-menu');
    if (m && !e.target.closest('.zy-head-right')) m.classList.remove('open');
  });

  setTimeout(() => {
    const initPage = sessionStorage.getItem('manager_current_page') || 'dashboard';
    if (typeof zySyncAccordionActive === 'function') zySyncAccordionActive(initPage);
  }, 100);
})();

function zyToggleMenu() { if (window.zyToggleSidebar) window.zyToggleSidebar(); }
function zyToggleUser(e) { e.stopPropagation(); document.getElementById('zy-user-menu')?.classList.toggle('open'); }
function zyToggleGroup(id, trigger) {
  if (window.zyToggleGroup && window.zyToggleGroup !== zyToggleGroup) {
    return window.zyToggleGroup(id || trigger);
  }
  const el = typeof id === 'string' ? (document.getElementById(id) || document.getElementById('sb-' + id) || document.getElementById('grp-' + id)) : (id || trigger);
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

/* ── Breadcrumb "Home » X" + close mobile sidebar drawer on navigation ── */
const _zyPrevLoad = loadPage;
loadPage = function (page) {
  _zyPrevLoad(page);
  const bc = document.getElementById('breadcrumb');
  if (bc) bc.textContent = ZY_LABELS[page] || bc.textContent || page;
  if (typeof zySyncAccordionActive === 'function') zySyncAccordionActive(page);
  if (window.zyCloseSidebar) window.zyCloseSidebar();
  document.getElementById('zy-user-menu')?.classList.remove('open');
  window.scrollTo({ top: 0 });
};

/* ── DataTable (MAIT SMS / DataTables look) ────────────────────── */
const ZYT = {};
function zyTable(id, headers, rows, perPage) {
  ZYT[id] = { headers, rows, perPage: perPage || 5, sort: 0, dir: 1, page: 1 };
  return `<div id="${id}"></div>`;
}
function zySort(id, col) {
  const t = ZYT[id]; if (!t) return;
  if (t.sort === col) t.dir = -t.dir; else { t.sort = col; t.dir = 1; }
  t.page = 1; zyRender(id);
}
function zyPage(id, p) {
  const t = ZYT[id]; if (!t) return;
  const max = Math.max(1, Math.ceil(t.rows.length / t.perPage));
  t.page = Math.min(Math.max(1, p), max); zyRender(id);
}
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

  const nums = [];
  for (let i = 1; i <= Math.min(total, 4); i++) nums.push(i);

  const pager = `<div class="zy-pager">
    <button ${page === 1 ? 'disabled' : ''} onclick="zyPage('${id}',1)">First</button>
    <button ${page === 1 ? 'disabled' : ''} onclick="zyPage('${id}',${page - 1})">Previous</button>
    ${nums.map(n => `<button class="${n === page ? 'on' : ''}" onclick="zyPage('${id}',${n})">${n}</button>`).join('')}
    <button ${page === total ? 'disabled' : ''} onclick="zyPage('${id}',${page + 1})">Next</button>
    <button ${page === total ? 'disabled' : ''} onclick="zyPage('${id}',${total})">Last</button>
  </div>`;

  const head = t.headers.map((h, i) => {
    const on = i === t.sort;
    const isAsc = on && t.dir === 1;
    const isDesc = on && t.dir === -1;
    const ic = (typeof zySortIc === 'function')
      ? zySortIc(on, t.dir)
      : `<span class="zy-sort ${on ? (isAsc ? 'zy-sort-asc sorted' : 'zy-sort-desc sorted') : 'zy-sort-neutral'}" aria-hidden="true"><svg class="zy-sort-svg" width="9" height="13" viewBox="0 0 10 14" fill="none"><path class="zy-sort-arr zy-sort-arr-up" d="M5 2L1.8 6.2H8.2L5 2Z" fill="currentColor"/><path class="zy-sort-arr zy-sort-arr-down" d="M5 12L8.2 7.8H1.8L5 12Z" fill="currentColor"/></svg></span>`;
    return `<th class="${on ? 'sorted' : ''}" onclick="zySort('${id}',${i})">${h}${ic}</th>`;
  }).join('');

  const body = slice.length
    ? slice.map(r => `<tr>${r.map((c, i) => {
        const cell = zyCell(c);
        return `<td class="${i === t.sort ? 'sorted' : ''}">${cell.h ?? ''}</td>`;
      }).join('')}</tr>`).join('')
    : `<tr><td class="zy-empty" colspan="${t.headers.length}">No data available in table</td></tr>`;

  host.innerHTML = `${pager}<div class="zy-dt-wrap"><table class="zy-dt">
      <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/* ── week chart, drawn on the canvas (no CDN needed) ────────── */
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
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);

    const L = 46, R = 14, T = 14, B = 34;
    const w = W - L - R, h = H - T - B;
    const peak = Math.max(1, ...data);
    let step = Math.ceil(peak / 5); if (step < 1) step = 1;
    const top = step * 5;

    c.font = '13px Roboto, Arial, sans-serif';
    c.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = Math.round(T + h - (h * i / 5)) + .5;
      c.strokeStyle = '#e2e2e2';
      c.beginPath(); c.moveTo(L, y); c.lineTo(L + w, y); c.stroke();
      c.fillStyle = '#555'; c.textAlign = 'right'; c.textBaseline = 'middle';
      c.fillText(String(step * i), L - 8, y);
    }
    const n = Math.max(1, labels.length - 1);
    labels.forEach((lb, i) => {
      const x = Math.round(L + (w * i / n)) + .5;
      c.strokeStyle = '#e2e2e2';
      c.beginPath(); c.moveTo(x, T); c.lineTo(x, T + h); c.stroke();
      c.fillStyle = '#555'; c.textAlign = 'center'; c.textBaseline = 'top';
      c.fillText(lb, x, T + h + 10);
    });

    if (!data.length) return;
    const px = i => L + (w * i / n);
    const py = v => T + h - (h * v / top);
    c.strokeStyle = '#659A00'; c.lineWidth = 2.5; c.lineJoin = 'round';
    c.beginPath();
    data.forEach((v, i) => i ? c.lineTo(px(i), py(v)) : c.moveTo(px(i), py(v)));
    c.stroke();
    c.fillStyle = '#659A00';
    data.forEach((v, i) => { c.beginPath(); c.arc(px(i), py(v), 5, 0, Math.PI * 2); c.fill(); });
  };
  draw();
  if (window._zyChartR) window.removeEventListener('resize', window._zyChartR);
  window._zyChartR = () => { clearTimeout(window._zyChartT); window._zyChartT = setTimeout(draw, 150); };
  window.addEventListener('resize', window._zyChartR);
}

/* ── DASHBOARD (panel layout V4) ───────────────────────────── */
pgDashboard = async function () {
  const c = document.getElementById('page-content');
  if (typeof zyUpdateBreadcrumb === 'function') {
    zyUpdateBreadcrumb('dashboard', 'SMS Dashboard');
  }
  try {
    const [stats, daily, agentsRes, ranges, recentRes, periodStats] = await Promise.all([
      apiFetch(`/api/manager/${MANAGER_ID}/stats`),
      apiFetch(`/api/sms/daily-stats?manager_id=${MANAGER_ID}`),
      apiFetch(`/api/agents?manager_id=${MANAGER_ID}&limit=200`),
      apiFetch(`/api/numbers/sms-ranges`),
      apiFetch(`/api/sms/logs?manager_id=${MANAGER_ID}&limit=8`).catch(() => ({ data: [] })),
      apiFetch(`/api/sms/period-stats?manager_id=${MANAGER_ID}`).catch(() => null)
    ]);

    const agents = (agentsRes && agentsRes.data) || [];
    const rangeList = Array.isArray(ranges) ? ranges : [];
    const traffic = (daily && daily.weekly_traffic) || [0, 0, 0, 0, 0, 0, 0];
    const recentSms = (recentRes && recentRes.data) || [];
    const p = periodStats || {};

    const todaySmsVal = p.today != null ? p.today : (daily?.today || 0);
    const weeklySmsVal = p.week != null ? p.week : (daily?.this_week || 0);
    const monthlySmsVal = p.month != null ? p.month : (daily?.this_month || 0);
    const yearlySmsVal = p.year != null ? p.year : (daily?.this_year || 0);

    const labels = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const tiles = [
      ['Dashboard',   ZY_ICONS.monitor, 'dashboard'],
      ['SMS Ranges',  ZY_ICONS.flag,    'sms-overview'],
      ['Agents',      ZY_ICONS.person,  'agents'],
      ['Statistics',  ZY_ICONS.donut,   'reports'],
      ['SMS Numbers', ZY_ICONS.calc,    'my-numbers']
    ];

    const topAgents = agents.filter(a => (a.today_otp || 0) > 0)
      .sort((a, b) => (b.today_otp || 0) - (a.today_otp || 0)).slice(0, 5);

    const rangeRows = rangeList.map(r => [
      { v: r.range_name || r.name || r.country || '—', h: r.range_name || r.name || r.country || '—' },
      { v: r.prefix || r.prefix_code || '', h: r.prefix || r.prefix_code || '' }
    ]);

    const agentRows = agents.map(a => [
      { v: a.username || '', h: a.username || '—' },
      { v: a.email || '',    h: a.email || '' },
      { v: a.skype || '',    h: a.skype || '' },
      { v: a.status || '',   h: `<span class="zy-badge-active ${a.status === 'active' ? '' : 'zy-badge-off'}">${a.status === 'active' ? 'Active' : 'Inactive'}</span>` },
      { v: '', h: `<button class="zy-gear" onclick="zyAgentActions(${a.id})">${zyIcon('ui_gear')}</button>` }
    ]);

    const commEarnedVal = Number((stats && (stats.commission_earned != null ? stats.commission_earned : stats.revenue_today)) || 0).toFixed(4);
    const recentSmsCardHtml = (typeof zyRecentSmsCard === 'function' && recentSms.length > 0) ? zyRecentSmsCard(recentSms, { title: 'Recent Team SMS Traffic Live' }) : '';

    const kpiCardsHtml = (typeof zyKpiCard === 'function') ? `
      <div class="zy-kpi-grid">
        ${zyKpiCard({
          title: "Today SMS",
          value: Number(todaySmsVal).toLocaleString(),
          icon: 'fa-calendar-day',
          color: '#16a34a',
          bgLight: 'rgba(22, 163, 74, 0.12)',
          sparklineData: traffic,
          onClick: "loadPage('reports')"
        })}
        ${zyKpiCard({
          title: "Weekly SMS",
          value: Number(weeklySmsVal).toLocaleString(),
          icon: 'fa-calendar-week',
          color: '#2563eb',
          bgLight: 'rgba(37, 99, 235, 0.12)',
          sparklineData: traffic,
          onClick: "loadPage('reports')"
        })}
        ${zyKpiCard({
          title: "Monthly SMS",
          value: Number(monthlySmsVal).toLocaleString(),
          icon: 'fa-calendar-alt',
          color: '#0891b2',
          bgLight: 'rgba(8, 145, 178, 0.12)',
          sparklineData: traffic.slice().reverse(),
          onClick: "loadPage('reports')"
        })}
        ${zyKpiCard({
          title: "Yearly SMS",
          value: Number(yearlySmsVal).toLocaleString(),
          icon: 'fa-calendar-check',
          color: '#7c3aed',
          bgLight: 'rgba(124, 58, 237, 0.12)',
          sparklineData: [yearlySmsVal || 0, yearlySmsVal || 0, yearlySmsVal || 0, yearlySmsVal || 0, yearlySmsVal || 0],
          onClick: "loadPage('reports')"
        })}
      </div>
    ` : '';

    c.innerHTML = `
      <div class="zy-tiles">
        ${tiles.map(([t, ic, p]) => `<div class="zy-tile" onclick="loadPage('${p}')">${ic}<span>${t}</span></div>`).join('')}
      </div>

      ${kpiCardsHtml}

      ${recentSmsCardHtml}

      <div class="zy-panel zy-chart-panel">
        <div class="zy-chart-title">SMS LAST 7 DAYS</div>
        <div class="zy-chart-box"><canvas id="zy-week-chart"></canvas></div>
      </div>

      <div class="zy-panel" style="margin-top:20px;">
        <div class="zy-panel-head">Today's Top Agents <span style="font-size:12px;font-weight:normal;float:right;">Commission Earned: <b>$${commEarnedVal}</b></span></div>
        <div class="zy-panel-body" style="padding:0;overflow-x:auto;">
          <table class="zy-dt zy-dt-plain" style="margin:0;">
            <thead><tr><th style="cursor:default">Username</th><th style="cursor:default">Total SMS</th></tr></thead>
            <tbody>
              ${topAgents.length
                ? topAgents.map(a => `<tr><td><b>${a.username}</b></td><td><span class="badge" style="background:var(--sp-bg-subtle);">${a.today_otp}</span></td></tr>`).join('')
                : `<tr><td class="zy-empty" colspan="2">No SMS recorded today</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div class="zy-panel" style="margin-top:20px;">
        <div class="zy-panel-head"><span class="zy-ph-ic">${zyIcon('list')}</span> Recent Billing Groups/Ranges</div>
        <div class="zy-panel-body">${zyTable('zy-ranges', ['Range Name', 'Prefix'], rangeRows, 5)}</div>
      </div>

      <div class="zy-panel" style="margin-top:20px;">
        <div class="zy-panel-head">
          <span class="zy-ph-ic">${zyIcon('users')}</span> Recent Agents
          <button class="zy-ph-plus" onclick="loadPage('agents')" title="Add Agent">${zyIcon('ui_plus')}</button>
        </div>
        <div class="zy-panel-body">${zyTable('zy-agents', ['Username', 'Email', 'Skype', 'Status', 'Action'], agentRows, 5)}</div>
      </div>
    `;

    zyRender('zy-ranges');
    zyRender('zy-agents');

    zyLineChart('zy-week-chart', labels, traffic);

    const bc = document.getElementById('breadcrumb');
    if (bc) bc.textContent = 'SMS Dashboard';

  } catch (err) {
    console.error('Dashboard error:', err);
    c.innerHTML = `<div class="zy-panel"><div class="zy-panel-body" style="text-align:center;padding:30px;">
        Dashboard could not load. <button class="zy-gear" onclick="pgDashboard()">Retry</button></div></div>`;
  }
};

function zyAgentActions(id) {
  openModal('Agent Actions', `
    <div style="display:grid;gap:10px;">
      <button class="btn btn-primary" onclick="closeModal();openEditAgentModal(${id})"><i class="fas fa-pen"></i> Edit Agent</button>
      <button class="btn btn-outline" onclick="closeModal();loadPage('agent-performance')"><i class="fas fa-chart-line"></i> Performance</button>
      <button class="btn btn-outline" onclick="closeModal();loadPage('agents')"><i class="fas fa-users"></i> All Agents</button>
    </div>`);
}
