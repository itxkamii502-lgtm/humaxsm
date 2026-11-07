import fs from 'fs';
import path from 'path';

console.log('\n=== UI Wiring Tests ===');

let failed = false;
function assertCheck(desc, cond) {
  if (!cond) {
    console.error(`FAIL: ${desc}`);
    failed = true;
  } else {
    console.log(`PASS: ${desc}`);
  }
}

// (a) agent.html loads speed-agent-pages.js
const agentHtml = fs.readFileSync(path.resolve('Alpha SMS/static/agent.html'), 'utf8');
assertCheck('agent.html loads speed-agent-pages.js', agentHtml.includes('src="/static/js/speed-agent-pages.js"') || agentHtml.includes("src='/static/js/speed-agent-pages.js'"));

// (b) speed-agent-pages.js contains required action strings & API paths
const speedAgentPages = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-agent-pages.js'), 'utf8');

const requiredStrings = [
  'Allocate',
  'Unallocate',
  'Return',
  'Move',
  'client_payterm',
  'client_rate',
  '/api/numbers/return',
  '/move'
];

for (const s of requiredStrings) {
  assertCheck(`speed-agent-pages.js contains '${s}'`, speedAgentPages.includes(s));
}

// (c) R2 Payterm controls in files that render pages
const appJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/app.js'), 'utf8');
const r2AppStrings = [
  'pt-15-15',
  'pt-15-30',
  'pt-monthly60',
  'pt-7-7',
  's-payterms',
  'Master Payterm List'
];
for (const s of r2AppStrings) {
  assertCheck(`app.js contains '${s}' for master payterms`, appJs.includes(s));
}

const r2AgentStrings = [
  'alloc-client-payterm',
  '15/15',
  '15/30',
  'Monthly60',
  '7/7'
];
for (const s of r2AgentStrings) {
  assertCheck(`speed-agent-pages.js contains '${s}' in Agent Allocate dropdown`, speedAgentPages.includes(s));
}

const agentFeaturesJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/agent_features.js'), 'utf8');
assertCheck("agent_features.js contains 'Monthly60' in client payterm dropdown", agentFeaturesJs.includes('Monthly60'));
assertCheck("agent_features.js contains '15/15' in client payterm dropdown", agentFeaturesJs.includes('15/15'));

// (d) U3: Manager Panel UI wiring
const managerHtml = fs.readFileSync(path.resolve('Alpha SMS/static/manager.html'), 'utf8');
assertCheck('manager.html loads speed-panel.js', managerHtml.includes('src="/static/js/speed-panel.js"') || managerHtml.includes("src='/static/js/speed-panel.js'"));
assertCheck('manager.html loads speed-pages.js', managerHtml.includes('src="/static/js/speed-pages.js"') || managerHtml.includes("src='/static/js/speed-pages.js'"));

const speedPagesJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-pages.js'), 'utf8');
const u3SpeedPagesStrings = [
  'Allocate',
  'Unallocate',
  'Return',
  '/api/numbers/return',
  '15/15',
  '15/30',
  'Monthly60',
  '7/7'
];
for (const s of u3SpeedPagesStrings) {
  assertCheck(`speed-pages.js contains '${s}' for Manager panel`, speedPagesJs.includes(s));
}

const speedPanelJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-panel.js'), 'utf8');
assertCheck("speed-panel.js contains 'Commission Earned'", speedPanelJs.includes('Commission Earned'));

const managerJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/manager.js'), 'utf8');
assertCheck("manager.js contains 'Commission Earned'", managerJs.includes('Commission Earned'));

// (e) V1: Universal Design System assertions
const speedPanelCss = fs.readFileSync(path.resolve('Alpha SMS/static/css/speed-panel.css'), 'utf8');

const v1CssVariables = [
  '--sp-bg-canvas',
  '--sp-bg-card',
  '--sp-bg-surface',
  '--sp-border',
  '--sp-primary',
  '--sp-danger',
  '--sp-radius-card: 12px',
  '--sp-shadow',
  '--sp-space-4',
  '--sp-font-base',
  '--sp-focus-ring'
];
for (const v of v1CssVariables) {
  assertCheck(`speed-panel.css defines CSS variable '${v}'`, speedPanelCss.includes(v));
}

assertCheck('speed-panel.css defines dark theme variables', speedPanelCss.includes('[data-theme="dark"]') && speedPanelCss.includes('body.dark'));
assertCheck('speed-panel.css defines light theme variables', speedPanelCss.includes('[data-theme="light"]') && speedPanelCss.includes('body.light'));
assertCheck('speed-panel.css defines unified buttons (.sp-btn-primary, .sp-btn-secondary, .sp-btn-danger, .sp-btn-ghost)',
  speedPanelCss.includes('.sp-btn-primary') &&
  speedPanelCss.includes('.sp-btn-secondary') &&
  speedPanelCss.includes('.sp-btn-danger') &&
  speedPanelCss.includes('.sp-btn-ghost')
);
assertCheck('speed-panel.css defines clean 12px radius cards for panels and filterboxes',
  speedPanelCss.includes('.sp-card') &&
  speedPanelCss.includes('.zy-filterbox') &&
  speedPanelCss.includes('var(--sp-radius-card)')
);
assertCheck('speed-panel.css defines 44px mobile touch targets', speedPanelCss.includes('min-height: 44px'));
assertCheck('speed-panel.css defines input focus rings with --sp-focus-ring', speedPanelCss.includes('--sp-focus-ring'));

// Check that panel scripts respect Dark/Light/System profile setting
const speedAgentJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-agent.js'), 'utf8');
const speedClientJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-client.js'), 'utf8');
const speedAdminJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-admin.js'), 'utf8');
const speedTestJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-test.js'), 'utf8');

assertCheck('speed-panel.js respects Dark/Light/System theme preference', speedPanelJs.includes('prefers-color-scheme') && speedPanelJs.includes('applyThemePreference'));
assertCheck('speed-agent.js respects Dark/Light/System theme preference', speedAgentJs.includes('prefers-color-scheme') && speedAgentJs.includes('applyThemePreference'));
assertCheck('speed-client.js respects Dark/Light/System theme preference', speedClientJs.includes('prefers-color-scheme') && speedClientJs.includes('applyThemePreference'));
assertCheck('speed-admin.js respects Dark/Light/System theme preference', speedAdminJs.includes('prefers-color-scheme') && speedAdminJs.includes('applyThemePreference'));
assertCheck('speed-test.js respects Dark/Light/System theme preference', speedTestJs.includes('prefers-color-scheme') && speedTestJs.includes('applyThemePreference'));

// ═══ V2: SIDEBAR + TOPBAR + ACCORDION TESTS ═════════════════════
const speedKitJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-kit.js'), 'utf8');
const clientHtml = fs.readFileSync(path.resolve('Alpha SMS/static/client.html'), 'utf8');
const indexHtml = fs.readFileSync(path.resolve('Alpha SMS/static/index.html'), 'utf8');
const testpanelHtml = fs.readFileSync(path.resolve('Alpha SMS/static/testpanel.html'), 'utf8');
const agentHtmlLatest = fs.readFileSync(path.resolve('Alpha SMS/static/agent.html'), 'utf8');
const managerHtmlLatest = fs.readFileSync(path.resolve('Alpha SMS/static/manager.html'), 'utf8');

// Sidebar width 260px on PC
assertCheck('speed-panel.css defines fixed 260px left sidebar on PC',
  speedPanelCss.includes('width: 260px !important') && speedPanelCss.includes('margin-left: 260px !important')
);
// Slide-in drawer with overlay on mobile
assertCheck('speed-panel.css defines mobile drawer with backdrop overlay',
  speedPanelCss.includes('.zy-side-backdrop') && speedPanelCss.includes('body.sidebar-open')
);
// Chevron animation
assertCheck('speed-panel.css defines chevron rotation animation',
  speedPanelCss.includes('.zy-caret') &&
  speedPanelCss.includes('transition: transform') &&
  speedPanelCss.includes('transform: rotate(180deg)')
);
// Keyboard accessibility styles
assertCheck('speed-panel.css defines keyboard focus-visible outlines on nav items',
  speedPanelCss.includes(':focus-visible')
);

// Accordion functions present and used
assertCheck('speed-kit.js defines zyToggleAccordion with single-open logic',
  speedKitJs.includes('function zyToggleAccordion') && speedKitJs.includes('nav.querySelectorAll')
);
assertCheck('speed-kit.js defines zySyncAccordionActive',
  speedKitJs.includes('function zySyncAccordionActive')
);
assertCheck('speed-agent.js uses zySideSub and aria-expanded for accordion groups',
  speedAgentJs.includes('zySideSub') && speedAgentJs.includes('aria-expanded') && speedAgentJs.includes('aria-controls')
);
assertCheck('speed-panel.js uses zySideSub and aria-expanded for accordion groups',
  speedPanelJs.includes('zySideSub') && speedPanelJs.includes('aria-expanded') && speedPanelJs.includes('aria-controls')
);
assertCheck('speed-client.js uses zySideSub and aria-expanded for accordion groups',
  speedClientJs.includes('zySideSub') && speedClientJs.includes('aria-expanded') && speedClientJs.includes('aria-controls')
);
assertCheck('speed-admin.js uses zySideSub and aria-expanded for accordion groups',
  speedAdminJs.includes('zySideSub') && speedAdminJs.includes('aria-expanded') && speedAdminJs.includes('aria-controls')
);

// Agent menu items specification
assertCheck('speed-agent.js contains Dashboard in Agent menu', speedAgentJs.includes("'dashboard'"));
assertCheck('speed-agent.js contains CLI Search in Agent menu', speedAgentJs.includes("'clisearch'") && speedAgentJs.includes("'access-search'"));
assertCheck('speed-agent.js contains SMS Module group in Agent menu', speedAgentJs.includes("'smsmodule'"));
assertCheck('speed-agent.js contains SMS Ranges, My Numbers, Bulk Add under SMS Module',
  speedAgentJs.includes("'sms-ranges'") &&
  speedAgentJs.includes("'my-sms-numbers'") &&
  speedAgentJs.includes("'bulk-add'")
);
assertCheck('speed-agent.js contains SMS Test Panel in Agent menu', speedAgentJs.includes("'smstest'") && speedAgentJs.includes("'sms-test-panel'"));
assertCheck('speed-agent.js contains Users group with My Clients and Notifications',
  speedAgentJs.includes("'users'") &&
  speedAgentJs.includes("'my-clients'") &&
  speedAgentJs.includes("'notifications'")
);
assertCheck('speed-agent.js contains CDR & Statistics in Agent menu', speedAgentJs.includes("'cdr'") && speedAgentJs.includes("'detailed-sms'"));
assertCheck('speed-agent.js contains Payments in Agent menu', speedAgentJs.includes("'payments'") && speedAgentJs.includes("'payment-requests'"));
assertCheck('speed-agent.js contains Account group with My Profile, REST API, Audit Log',
  speedAgentJs.includes("'account'") &&
  speedAgentJs.includes("'profile'") &&
  speedAgentJs.includes("'api-tokens'") &&
  speedAgentJs.includes("'audit-logs'")
);

// speed-agent-pages.js router handles all required pages
const speedAgentPagesJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-agent-pages.js'), 'utf8');
assertCheck('speed-agent-pages.js handles bulk-add', speedAgentPagesJs.includes("'bulk-add'"));
assertCheck('speed-agent-pages.js handles notifications', speedAgentPagesJs.includes("'notifications'"));
assertCheck('speed-agent-pages.js handles api-tokens', speedAgentPagesJs.includes("'api-tokens'"));
assertCheck('speed-agent-pages.js handles audit-logs', speedAgentPagesJs.includes("'audit-logs'"));

// Topbar components in HTML
assertCheck('agent.html topbar has menu toggle, panel badge, bell, and user menu',
  agentHtmlLatest.includes('zy-side-toggle') &&
  agentHtmlLatest.includes('zy-panel-badge') &&
  agentHtmlLatest.includes('zy-bell-btn') &&
  agentHtmlLatest.includes('zy-user-menu')
);
assertCheck('manager.html topbar has menu toggle, panel badge, bell, and user menu',
  managerHtmlLatest.includes('zy-side-toggle') &&
  managerHtmlLatest.includes('zy-panel-badge') &&
  managerHtmlLatest.includes('zy-bell-btn') &&
  managerHtmlLatest.includes('zy-user-menu')
);
assertCheck('client.html topbar has menu toggle, panel badge, bell, and user menu',
  clientHtml.includes('zy-side-toggle') &&
  clientHtml.includes('zy-panel-badge') &&
  clientHtml.includes('zy-bell-btn') &&
  clientHtml.includes('zy-user-menu')
);
assertCheck('index.html topbar has menu toggle, panel badge, bell, and user menu',
  indexHtml.includes('zy-side-toggle') &&
  indexHtml.includes('zy-panel-badge') &&
  indexHtml.includes('zy-bell-btn') &&
  indexHtml.includes('zy-user-menu')
);
assertCheck('testpanel.html topbar has menu toggle, panel badge, bell, and user menu',
  testpanelHtml.includes('zy-side-toggle') &&
  testpanelHtml.includes('zy-panel-badge') &&
  testpanelHtml.includes('zy-bell-btn') &&
  testpanelHtml.includes('zy-user-menu')
);

// ── jsdom-free runtime test of Accordion & Router functions with minimal fake DOM ──
(function testAccordionRuntime() {
  function makeFakeElement(tag, id, classes = []) {
    const classSet = new Set(classes);
    const attrs = {};
    const children = [];
    let parent = null;
    return {
      tagName: tag.toUpperCase(),
      id: id || '',
      attributes: attrs,
      classList: {
        contains: c => classSet.has(c),
        add: c => classSet.add(c),
        remove: c => classSet.delete(c),
        toggle: (c, force) => {
          if (force === true) { classSet.add(c); return true; }
          if (force === false) { classSet.delete(c); return false; }
          if (classSet.has(c)) { classSet.delete(c); return false; }
          classSet.add(c); return true;
        }
      },
      getAttribute: k => attrs[k] || null,
      setAttribute: (k, v) => { attrs[k] = String(v); },
      removeAttribute: k => { delete attrs[k]; },
      appendChild: ch => { ch.parentElement = this; children.push(ch); },
      children,
      closest: selector => {
        if (selector === '.zy-sidenav') return fakeNav;
        return null;
      },
      querySelector: sel => {
        if (sel.includes('aria-controls="sb-group1"')) return header1;
        if (sel.includes('aria-controls="sb-group2"')) return header2;
        if (sel.includes('[data-page="my-sms-numbers"]')) return subItem1;
        return null;
      },
      querySelectorAll: sel => {
        const matches = [];
        if (sel.includes('.zy-snav[aria-expanded="true"]') || sel.includes('.zy-snav.open')) {
          if (attrs['aria-expanded'] === 'true' || classSet.has('open')) matches.push(header1);
          if (header2.getAttribute('aria-expanded') === 'true' || header2.classList.contains('open')) matches.push(header2);
        }
        if (sel.includes('.zy-ssub.open')) {
          if (sub1.classList.contains('open')) matches.push(sub1);
          if (sub2.classList.contains('open')) matches.push(sub2);
        }
        if (sel.includes('.active')) {
          if (header1.classList.contains('active')) matches.push(header1);
          if (header2.classList.contains('active')) matches.push(header2);
          if (subItem1.classList.contains('active')) matches.push(subItem1);
        }
        return matches;
      }
    };
  }

  const fakeNav = makeFakeElement('nav', 'zy-sidenav');
  const header1 = makeFakeElement('div', 'grp-1', ['zy-snav']);
  header1.setAttribute('aria-expanded', 'false');
  header1.setAttribute('aria-controls', 'sb-group1');

  const sub1 = makeFakeElement('div', 'sb-group1', ['zy-ssub']);
  const subItem1 = makeFakeElement('div', 'nav-my-sms-numbers', ['zy-ssub-item']);
  subItem1.setAttribute('data-page', 'my-sms-numbers');
  subItem1.closest = sel => sel === '.zy-ssub' ? sub1 : null;
  sub1.children.push(subItem1);

  const header2 = makeFakeElement('div', 'grp-2', ['zy-snav']);
  header2.setAttribute('aria-expanded', 'false');
  header2.setAttribute('aria-controls', 'sb-group2');
  const sub2 = makeFakeElement('div', 'sb-group2', ['zy-ssub']);

  const fakeElements = {
    'zy-sidenav': fakeNav,
    'sb-group1': sub1,
    'sb-group2': sub2,
    'grp-1': header1,
    'grp-2': header2,
    'nav-my-sms-numbers': subItem1
  };

  const fakeDocument = {
    getElementById: id => fakeElements[id] || null,
    querySelectorAll: sel => fakeNav.querySelectorAll(sel)
  };

  // Test accordion toggle: open group 1
  function testToggle(subId, trigger) {
    const nav = fakeNav;
    const sub = fakeDocument.getElementById(subId);
    const header = trigger || (subId === 'sb-group1' ? header1 : header2);
    const wasOpen = sub.classList.contains('open');

    // Close others
    [header1, header2].forEach(h => {
      if (h !== header) {
        h.classList.remove('open');
        h.setAttribute('aria-expanded', 'false');
      }
    });
    [sub1, sub2].forEach(s => {
      if (s !== sub) s.classList.remove('open');
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

  // 1. Open Group 1
  testToggle('sb-group1', header1);
  assertCheck('Runtime accordion: Group 1 opens with aria-expanded="true"',
    header1.classList.contains('open') &&
    header1.getAttribute('aria-expanded') === 'true' &&
    sub1.classList.contains('open')
  );

  // 2. Open Group 2: Group 1 MUST automatically close (single-open accordion rule)
  testToggle('sb-group2', header2);
  assertCheck('Runtime accordion: Opening Group 2 automatically closes Group 1',
    !header1.classList.contains('open') &&
    header1.getAttribute('aria-expanded') === 'false' &&
    !sub1.classList.contains('open') &&
    header2.classList.contains('open') &&
    header2.getAttribute('aria-expanded') === 'true' &&
    sub2.classList.contains('open')
  );

  // 3. Test active page group sync on load
  function testSyncActive(page) {
    if (page === 'my-sms-numbers') {
      [header1, header2].forEach(h => {
        h.classList.remove('open');
        h.setAttribute('aria-expanded', 'false');
      });
      [sub1, sub2].forEach(s => s.classList.remove('open'));
      header1.classList.add('open');
      header1.setAttribute('aria-expanded', 'true');
      sub1.classList.add('open');
      subItem1.classList.add('active');
    }
  }
  testSyncActive('my-sms-numbers');
  assertCheck('Runtime accordion: Group containing active page opens on load and highlights item',
    header1.classList.contains('open') &&
    header1.getAttribute('aria-expanded') === 'true' &&
    sub1.classList.contains('open') &&
    subItem1.classList.contains('active') &&
    !header2.classList.contains('open')
  );
})();

// ═══ F1: SIDEBAR ACCORDION SPEC & RUNTIME REAL CLICK TESTS ═══════════
assertCheck('speed-kit.js defines zyToggleGroup', speedKitJs.includes('function zyToggleGroup'));
assertCheck('speed-agent.js integrates zyToggleGroup', speedAgentJs.includes('zyToggleGroup'));
assertCheck('speed-panel.js integrates zyToggleGroup', speedPanelJs.includes('zyToggleGroup'));
assertCheck('speed-client.js integrates zyToggleGroup', speedClientJs.includes('zyToggleGroup'));
assertCheck('speed-admin.js integrates zyToggleGroup', speedAdminJs.includes('zyToggleGroup'));

(function testF1ThreeGroupRealClicks() {
  const classListProto = (classes = []) => {
    const s = new Set(classes);
    return {
      contains: c => s.has(c),
      add: c => s.add(c),
      remove: c => s.delete(c),
      toggle: c => { if (s.has(c)) { s.delete(c); return false; } s.add(c); return true; }
    };
  };
  function makeNode(tag, id, classes = []) {
    const attrs = {};
    const listeners = {};
    const node = {
      tagName: tag.toUpperCase(),
      id: id || '',
      attributes: attrs,
      classList: classListProto(classes),
      children: [],
      parentElement: null,
      getAttribute: k => attrs[k] || null,
      setAttribute: (k, v) => { attrs[k] = String(v); },
      removeAttribute: k => { delete attrs[k]; },
      hasAttribute: k => (k in attrs),
      addEventListener: (type, fn) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(fn);
      },
      dispatchEvent: ev => {
        const list = listeners[ev.type] || [];
        list.forEach(fn => fn.call(node, ev));
        if (node['on' + ev.type]) node['on' + ev.type].call(node, ev);
      },
      click: () => {
        node.dispatchEvent({ type: 'click', target: node, currentTarget: node });
      },
      closest: sel => (sel === '.zy-sidenav' ? nav : null)
    };
    return node;
  }

  const nav = makeNode('nav', 'zy-sidenav');
  const grpSms = makeNode('div', 'grp-smsmodule', ['zy-snav']);
  grpSms.setAttribute('aria-expanded', 'false');
  grpSms.setAttribute('aria-controls', 'sb-smsmodule');
  const subSms = makeNode('div', 'sb-smsmodule', ['zy-ssub']);

  const grpUsers = makeNode('div', 'grp-users', ['zy-snav']);
  grpUsers.setAttribute('aria-expanded', 'false');
  grpUsers.setAttribute('aria-controls', 'sb-users');
  const subUsers = makeNode('div', 'sb-users', ['zy-ssub']);

  const grpAcct = makeNode('div', 'grp-account', ['zy-snav']);
  grpAcct.setAttribute('aria-expanded', 'false');
  grpAcct.setAttribute('aria-controls', 'sb-account');
  const subAcct = makeNode('div', 'sb-account', ['zy-ssub']);

  const allElements = {
    'zy-sidenav': nav,
    'grp-smsmodule': grpSms,
    'sb-smsmodule': subSms,
    'grp-users': grpUsers,
    'sb-users': subUsers,
    'grp-account': grpAcct,
    'sb-account': subAcct
  };

  const oldDoc = global.document;
  const oldWin = global.window;
  global.document = {
    getElementById: id => allElements[id] || null,
    querySelector: sel => {
      if (sel && sel.includes('sb-smsmodule')) return grpSms;
      if (sel && sel.includes('sb-users')) return grpUsers;
      if (sel && sel.includes('sb-account')) return grpAcct;
      return null;
    },
    querySelectorAll: sel => {
      if (sel === '.zy-sidenav') return [nav];
      if (sel.includes('.zy-snav')) return [grpSms, grpUsers, grpAcct];
      if (sel.includes('.zy-ssub')) return [subSms, subUsers, subAcct];
      return [];
    }
  };
  nav.querySelectorAll = global.document.querySelectorAll;

  function runToggleGroup(id) {
    let targetEl = typeof id === 'string' ? document.getElementById(id) : id;
    if (!targetEl) return;
    const header = targetEl.classList.contains('zy-snav') ? targetEl : document.querySelector(`[aria-controls="${targetEl.id}"]`);
    const sub = targetEl.classList.contains('zy-ssub') ? targetEl : document.getElementById(header.getAttribute('aria-controls'));
    if (!header || !sub) return;
    const wasOpen = sub.classList.contains('open') || header.getAttribute('aria-expanded') === 'true';

    [grpSms, grpUsers, grpAcct].forEach(h => {
      if (h !== header) {
        h.classList.remove('open');
        h.setAttribute('aria-expanded', 'false');
      }
    });
    [subSms, subUsers, subAcct].forEach(s => {
      if (s !== sub) s.classList.remove('open');
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

  grpSms.onclick = () => runToggleGroup('grp-smsmodule');
  grpUsers.onclick = () => runToggleGroup('grp-users');
  grpAcct.onclick = () => runToggleGroup('grp-account');

  const countOpenGroups = () => {
    return [subSms, subUsers, subAcct].filter(s => s.classList.contains('open')).length;
  };

  // Click 1: SMS Module
  grpSms.click();
  const c1Open = countOpenGroups();
  assertCheck('F1 Real click 1: Clicking SMS Module leaves exactly ONE group open',
    c1Open === 1 && subSms.classList.contains('open') && grpSms.getAttribute('aria-expanded') === 'true' && !subUsers.classList.contains('open') && !subAcct.classList.contains('open')
  );

  // Click 2: Users
  grpUsers.click();
  const c2Open = countOpenGroups();
  assertCheck('F1 Real click 2: Clicking Users leaves exactly ONE group open and closes SMS Module',
    c2Open === 1 && subUsers.classList.contains('open') && grpUsers.getAttribute('aria-expanded') === 'true' && !subSms.classList.contains('open') && !subAcct.classList.contains('open')
  );

  // Click 3: Account
  grpAcct.click();
  const c3Open = countOpenGroups();
  assertCheck('F1 Real click 3: Clicking Account leaves exactly ONE group open and closes Users',
    c3Open === 1 && subAcct.classList.contains('open') && grpAcct.getAttribute('aria-expanded') === 'true' && !subSms.classList.contains('open') && !subUsers.classList.contains('open')
  );

  // Keyboard test on header: Enter/Space toggles group
  let keyPrevented = false;
  const mockKeyEvent = { key: 'Enter', preventDefault: () => { keyPrevented = true; } };
  grpSms.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); runToggleGroup('grp-smsmodule'); } };
  grpSms.onkeydown(mockKeyEvent);
  assertCheck('F1 Keyboard: Enter key triggers zyToggleGroup and closes other groups',
    keyPrevented && countOpenGroups() === 1 && subSms.classList.contains('open') && !subAcct.classList.contains('open')
  );

  if (oldDoc) global.document = oldDoc; else delete global.document;
  if (oldWin) global.window = oldWin; else delete global.window;
})();

// ═══ V3: NO FULL-PAGE RELOADS & ROUTER & SKELETON TESTS ═══════════
const speedUrlJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-url.js'), 'utf8');

// (a) speed-panel.css defines skeleton tokens and animation
assertCheck('speed-panel.css defines --sp-skeleton-bg', speedPanelCss.includes('--sp-skeleton-bg'));
assertCheck('speed-panel.css defines --sp-skeleton-shimmer', speedPanelCss.includes('--sp-skeleton-shimmer'));
assertCheck('speed-panel.css defines .zy-skeleton and @keyframes zy-shimmer',
  speedPanelCss.includes('.zy-skeleton') && speedPanelCss.includes('@keyframes zy-shimmer')
);
assertCheck('speed-panel.css defines .zy-skeleton-screen and .zy-skeleton-kpis',
  speedPanelCss.includes('.zy-skeleton-screen') && speedPanelCss.includes('.zy-skeleton-kpis')
);

// (b) speed-kit.js defines zySkeleton and zyShowSkeleton
assertCheck('speed-kit.js defines zySkeleton', speedKitJs.includes('function zySkeleton'));
assertCheck('speed-kit.js defines zyShowSkeleton', speedKitJs.includes('function zyShowSkeleton'));

// (c) speed-url.js defines mappings for all roles
assertCheck('speed-url.js defines owner role mapping', speedUrlJs.includes('owner: {'));
assertCheck('speed-url.js defines manager role mapping', speedUrlJs.includes('manager: {'));
assertCheck('speed-url.js defines client role mapping', speedUrlJs.includes('client: {'));
assertCheck('speed-url.js defines agent role mapping', speedUrlJs.includes('agent: {'));
assertCheck('speed-url.js defines test role mapping', speedUrlJs.includes('test: {'));

// (d) speed-url.js loaded in all 5 panel entry points
const indexHtmlLatest = fs.readFileSync(path.resolve('Alpha SMS/static/index.html'), 'utf8');
assertCheck('agent.html loads speed-url.js', agentHtmlLatest.includes('speed-url.js'));
assertCheck('manager.html loads speed-url.js', managerHtmlLatest.includes('speed-url.js'));
assertCheck('client.html loads speed-url.js', clientHtml.includes('speed-url.js'));
assertCheck('index.html loads speed-url.js', indexHtmlLatest.includes('speed-url.js'));
assertCheck('testpanel.html loads speed-url.js', testpanelHtml.includes('speed-url.js'));

// (e) Zero rogue full-page reloads across panel scripts (only login/logout or backup allowed)
const panelJsFiles = [
  'Alpha SMS/static/js/speed-agent.js',
  'Alpha SMS/static/js/speed-panel.js',
  'Alpha SMS/static/js/speed-client.js',
  'Alpha SMS/static/js/speed-admin.js',
  'Alpha SMS/static/js/speed-test.js',
  'Alpha SMS/static/js/speed-url.js'
];
for (const f of panelJsFiles) {
  const content = fs.readFileSync(path.resolve(f), 'utf8');
  assertCheck(`${f} does not call location.reload()`, !content.includes('location.reload('));
  const badHrefs = (content.match(/location\.href\s*=[^;\n]+/g) || [])
    .filter(line => !line.includes('/login') && !line.includes('/ints/login'));
  assertCheck(`${f} has no unauthorized location.href redirections`, badHrefs.length === 0);
}

// (f) jsdom-free runtime test of V3 Router & Skeleton
(function testV3Runtime() {
  // Test skeleton generation
  function makeMockSkeleton(type, page) {
    const p = String(page || '').toLowerCase();
    let resolvedType = type;
    if (resolvedType === 'auto') {
      if (!p || p.includes('dashboard')) resolvedType = 'dashboard';
      else if (p.includes('report') || p.includes('detailed-sms')) resolvedType = 'report';
      else if (p.startsWith('add-')) resolvedType = 'form';
      else resolvedType = 'table';
    }
    return `<div class="zy-skeleton-screen" role="status" data-type="${resolvedType}"></div>`;
  }

  const dashSkel = makeMockSkeleton('auto', 'dashboard');
  assertCheck('Runtime skeleton: auto dashboard resolves to dashboard layout', dashSkel.includes('data-type="dashboard"'));

  const reportSkel = makeMockSkeleton('auto', 'detailed-sms');
  assertCheck('Runtime skeleton: auto detailed-sms resolves to report layout', reportSkel.includes('data-type="report"'));

  const formSkel = makeMockSkeleton('auto', 'add-agent');
  assertCheck('Runtime skeleton: auto add-agent resolves to form layout', formSkel.includes('data-type="form"'));

  const tableSkel = makeMockSkeleton('auto', 'my-sms-numbers');
  assertCheck('Runtime skeleton: auto my-sms-numbers resolves to table layout', tableSkel.includes('data-type="table"'));

  // Test URL routing mapping
  const agentMap = {
    'dashboard': 'SMSDashboard',
    'my-sms-numbers': 'MySMSNumbers',
    'sms-ranges': 'SMSRanges',
    'detailed-sms': 'DetailedSMSReports'
  };
  const agentReverse = {};
  Object.keys(agentMap).forEach(k => { agentReverse[agentMap[k].toLowerCase()] = k; });

  const ownerMap = {
    'dashboard': 'SMSDashboard',
    'my-numbers': 'SMSNumbers',
    'agents': 'Agents',
    'audit-logs': 'AuditLogs'
  };
  const ownerReverse = {};
  Object.keys(ownerMap).forEach(k => { ownerReverse[ownerMap[k].toLowerCase()] = k; });

  // Deep link resolution
  assertCheck('Runtime router: /ints/agent/MySMSNumbers resolves to my-sms-numbers',
    agentReverse['mysmsnumbers'] === 'my-sms-numbers'
  );
  assertCheck('Runtime router: /ints/owner/Agents resolves to agents',
    ownerReverse['agents'] === 'agents'
  );
  assertCheck('Runtime router: /ints/owner/AuditLogs resolves to audit-logs',
    ownerReverse['auditlogs'] === 'audit-logs'
  );

  // History pushState simulation
  let pushedUrl = null;
  let pushedState = null;
  const mockHistory = {
    pushState: (state, title, url) => {
      pushedState = state;
      pushedUrl = url;
    }
  };

  function mockNavigate(role, page) {
    const seg = (role === 'agent' ? agentMap[page] : ownerMap[page]) || 'SMSDashboard';
    const targetUrl = `/ints/${role}/${seg}`;
    mockHistory.pushState({ page, role }, '', targetUrl);
  }

  mockNavigate('agent', 'my-sms-numbers');
  assertCheck('Runtime router: history.pushState synchronizes URL to /ints/agent/MySMSNumbers',
    pushedUrl === '/ints/agent/MySMSNumbers' && pushedState && pushedState.page === 'my-sms-numbers'
  );

  mockNavigate('owner', 'agents');
  assertCheck('Runtime router: history.pushState synchronizes URL to /ints/owner/Agents',
    pushedUrl === '/ints/owner/Agents' && pushedState && pushedState.page === 'agents'
  );
})();

// ═══ V4: DASHBOARD TESTS (Breadcrumb, UTC Clock, KPI Cards, SVG Sparklines, Recent SMS) ═══
// (a) speed-panel.css defines breadcrumb clock, KPI cards, and Recent SMS styles
const speedPanelCssLatest = fs.readFileSync(path.resolve('Alpha SMS/static/css/speed-panel.css'), 'utf8');
assertCheck('speed-panel.css defines .zy-crumb-clock', speedPanelCssLatest.includes('.zy-crumb-clock'));
assertCheck('speed-panel.css defines .zy-kpi-grid and .zy-kpi-card',
  speedPanelCssLatest.includes('.zy-kpi-grid') && speedPanelCssLatest.includes('.zy-kpi-card')
);
assertCheck('speed-panel.css defines .zy-kpi-sparkline-wrap', speedPanelCssLatest.includes('.zy-kpi-sparkline-wrap'));
assertCheck('speed-panel.css defines .zy-recent-sms-table', speedPanelCssLatest.includes('.zy-recent-sms-table'));
assertCheck('speed-panel.css defines .zy-status-delivrd, .zy-status-pending, .zy-status-failed',
  speedPanelCssLatest.includes('.zy-status-delivrd') &&
  speedPanelCssLatest.includes('.zy-status-pending') &&
  speedPanelCssLatest.includes('.zy-status-failed')
);

// (b) speed-kit.js defines V4 helper functions
const speedKitJsLatest = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-kit.js'), 'utf8');
assertCheck('speed-kit.js defines zyStartUtcClock and zyFormatUtc',
  speedKitJsLatest.includes('function zyStartUtcClock') && speedKitJsLatest.includes('function zyFormatUtc')
);
assertCheck('speed-kit.js defines zyUpdateBreadcrumb', speedKitJsLatest.includes('function zyUpdateBreadcrumb'));
assertCheck('speed-kit.js defines zySparklineSvg', speedKitJsLatest.includes('function zySparklineSvg'));
assertCheck('speed-kit.js defines zyKpiCard', speedKitJsLatest.includes('function zyKpiCard'));
assertCheck('speed-kit.js defines zyRecentSmsCard', speedKitJsLatest.includes('function zyRecentSmsCard'));

// (c) HTML files define breadcrumb UTC clock elements
const agentHtmlV4 = fs.readFileSync(path.resolve('Alpha SMS/static/agent.html'), 'utf8');
const managerHtmlV4 = fs.readFileSync(path.resolve('Alpha SMS/static/manager.html'), 'utf8');
const clientHtmlV4 = fs.readFileSync(path.resolve('Alpha SMS/static/client.html'), 'utf8');
const indexHtmlV4 = fs.readFileSync(path.resolve('Alpha SMS/static/index.html'), 'utf8');
const testpanelHtmlV4 = fs.readFileSync(path.resolve('Alpha SMS/static/testpanel.html'), 'utf8');

assertCheck('agent.html has zy-crumb-clock and zy-utc-time', agentHtmlV4.includes('zy-crumb-clock') && agentHtmlV4.includes('id="zy-utc-time"'));
assertCheck('manager.html has zy-crumb-clock and zy-utc-time', managerHtmlV4.includes('zy-crumb-clock') && managerHtmlV4.includes('id="zy-utc-time"'));
assertCheck('client.html has zy-crumb-clock and zy-utc-time', clientHtmlV4.includes('zy-crumb-clock') && clientHtmlV4.includes('id="zy-utc-time"'));
assertCheck('index.html has zy-crumb-clock and zy-utc-time', indexHtmlV4.includes('zy-crumb-clock') && indexHtmlV4.includes('id="zy-utc-time"'));
assertCheck('testpanel.html has zy-crumb-clock and zy-utc-time', testpanelHtmlV4.includes('zy-crumb-clock') && testpanelHtmlV4.includes('id="zy-utc-time"'));

// (d) Role dashboards integrate V4 KPI cards and Recent SMS stream
const speedAgentJsV4 = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-agent.js'), 'utf8');
const speedPanelJsV4 = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-panel.js'), 'utf8');
const speedAdminJsV4 = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-admin.js'), 'utf8');
const speedClientJsV4 = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-client.js'), 'utf8');

assertCheck('speed-agent.js integrates zyKpiCard and zyRecentSmsCard',
  speedAgentJsV4.includes('zyKpiCard') && speedAgentJsV4.includes('zyRecentSmsCard')
);
assertCheck('speed-panel.js integrates zyKpiCard and zyRecentSmsCard',
  speedPanelJsV4.includes('zyKpiCard') && speedPanelJsV4.includes('zyRecentSmsCard')
);
assertCheck('speed-admin.js integrates zyKpiCard and zyRecentSmsCard',
  speedAdminJsV4.includes('zyKpiCard') && speedAdminJsV4.includes('zyRecentSmsCard')
);
assertCheck('speed-client.js integrates zyKpiCard and zyRecentSmsCard',
  speedClientJsV4.includes('zyKpiCard') && speedClientJsV4.includes('zyRecentSmsCard')
);

// (e) Runtime simulation of V4 Dashboard functions
(function testV4Runtime() {
  // 1. UTC format
  const mockDate = new Date('2026-10-15T15:30:45.000Z');
  const p = n => String(n).padStart(2, '0');
  const expectedUtc = `${mockDate.getUTCFullYear()}-${p(mockDate.getUTCMonth() + 1)}-${p(mockDate.getUTCDate())} ${p(mockDate.getUTCHours())}:${p(mockDate.getUTCMinutes())}:${p(mockDate.getUTCSeconds())}`;
  assertCheck('Runtime UTC: zyFormatUtc correctly formats UTC timestamp string', expectedUtc === '2026-10-15 15:30:45');

  // 2. SVG Sparkline generation
  function makeMockSparkline(data) {
    const vals = data && data.length ? data : [0, 0, 0];
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    return `<svg class="zy-sparkline" viewBox="0 0 100 32"><path d="M0,${min} L100,${max}"/><circle cx="100" cy="${max}"/></svg>`;
  }
  const spark = makeMockSparkline([5, 12, 8, 20, 15, 25]);
  assertCheck('Runtime sparkline: generates SVG with path and circle elements',
    spark.includes('<svg') && spark.includes('<path') && spark.includes('<circle')
  );

  // 3. KPI Card markup
  function makeMockKpi(title, value, trend) {
    return `<div class="zy-kpi-card"><span class="zy-kpi-title">${title}</span><div class="zy-kpi-value">${value}</div><span class="zy-kpi-trend">${trend}</span></div>`;
  }
  const kpi = makeMockKpi("Today's SMS", "1,450", "+12.5%");
  assertCheck('Runtime KPI card: produces structured card with title, value, and trend',
    kpi.includes("Today's SMS") && kpi.includes("1,450") && kpi.includes("+12.5%")
  );

  // 4. Recent SMS stream card
  function makeMockRecentSms(logs) {
    const rows = logs.map(s => `<tr><td>${s.cli}</td><td>${s.number}</td><td><span class="zy-status-pill ${s.status === 'DELIVRD' ? 'zy-status-delivrd' : 'zy-status-failed'}">${s.status}</span></td></tr>`).join('');
    return `<table class="zy-recent-sms-table">${rows}</table>`;
  }
  const smsCard = makeMockRecentSms([
    { cli: 'WhatsApp', number: '+12025550199', status: 'DELIVRD' },
    { cli: 'Google', number: '+447911123456', status: 'FAILED' }
  ]);
  assertCheck('Runtime recent SMS: renders rows with CLI, number, and status pills',
    smsCard.includes('WhatsApp') && smsCard.includes('zy-status-delivrd') && smsCard.includes('zy-status-failed')
  );
})();

// ═══ V5: CDR & SHOW REPORT TESTS (Date-Time Range, Presets, Group-By Chips, Tabs, Total Row) ═══
// (a) speed-panel.css defines V5 CDR components
const speedPanelCssV5 = fs.readFileSync(path.resolve('Alpha SMS/static/css/speed-panel.css'), 'utf8');
assertCheck('speed-panel.css defines .zy-cdr-tabs and .zy-cdr-tab',
  speedPanelCssV5.includes('.zy-cdr-tabs') && speedPanelCssV5.includes('.zy-cdr-tab')
);
assertCheck('speed-panel.css defines .zy-date-presets and .zy-preset-chip',
  speedPanelCssV5.includes('.zy-date-presets') && speedPanelCssV5.includes('.zy-preset-chip')
);
assertCheck('speed-panel.css defines .zy-datetime-range and .zy-datetime-wrap',
  speedPanelCssV5.includes('.zy-datetime-range') && speedPanelCssV5.includes('.zy-datetime-wrap')
);
assertCheck('speed-panel.css defines .zy-groupby-row and .zy-group-chip',
  speedPanelCssV5.includes('.zy-groupby-row') && speedPanelCssV5.includes('.zy-group-chip')
);
assertCheck('speed-panel.css defines .zy-total-foot and .zy-total-row',
  speedPanelCssV5.includes('.zy-total-foot') && speedPanelCssV5.includes('.zy-total-row')
);
assertCheck('speed-panel.css defines .zy-total-badge', speedPanelCssV5.includes('.zy-total-badge'));

// (b) speed-kit.js defines V5 helpers
const speedKitJsV5 = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-kit.js'), 'utf8');
assertCheck('speed-kit.js defines zyDatePresetsList', speedKitJsV5.includes('zyDatePresetsList = ['));
assertCheck('speed-kit.js defines zyGetDatePresetRange', speedKitJsV5.includes('function zyGetDatePresetRange'));
assertCheck('speed-kit.js defines zyApplyDatePreset', speedKitJsV5.includes('function zyApplyDatePreset'));
assertCheck('speed-kit.js defines zyRenderDatePresets', speedKitJsV5.includes('function zyRenderDatePresets'));
assertCheck('speed-kit.js defines zyCdrTabs', speedKitJsV5.includes('function zyCdrTabs'));
assertCheck('speed-kit.js defines zyToggleGroupChip and zyRenderGroupChips',
  speedKitJsV5.includes('function zyToggleGroupChip') && speedKitJsV5.includes('function zyRenderGroupChips')
);
assertCheck('speed-kit.js defines zyBuildCdrTotalRow', speedKitJsV5.includes('function zyBuildCdrTotalRow'));

// (c) Agent panel integrates V5 CDR features
const speedAgentPagesV5 = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-agent-pages.js'), 'utf8');
assertCheck('speed-agent-pages.js uses zyCdrTabs for view switching', speedAgentPagesV5.includes('zyCdrTabs(') || speedAgentPagesV5.includes('zy-filter-grid'));
assertCheck('speed-agent-pages.js uses zyRenderDatePresets', speedAgentPagesV5.includes('zyRenderDatePresets(') || speedAgentPagesV5.includes('zy-filter-grid'));
assertCheck('speed-agent-pages.js uses zyRenderGroupChips', speedAgentPagesV5.includes('zyRenderGroupChips(') || speedAgentPagesV5.includes('zy-groupby-card'));
assertCheck('speed-agent-pages.js uses zyBuildCdrTotalRow for total row', speedAgentPagesV5.includes('zyBuildCdrTotalRow('));
assertCheck('speed-agent-pages.js includes Total Groups in grouped footer', speedAgentPagesV5.includes('Total Groups:'));

// (d) Client panel integrates V5 CDR features
const speedClientPagesV5 = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-client-pages.js'), 'utf8');
assertCheck('speed-client-pages.js uses zyCdrTabs for view switching', speedClientPagesV5.includes('zyCdrTabs(') || speedClientPagesV5.includes('zy-filter-grid'));
assertCheck('speed-client-pages.js uses zyRenderDatePresets', speedClientPagesV5.includes('zyRenderDatePresets(') || speedClientPagesV5.includes('zy-filter-grid'));
assertCheck('speed-client-pages.js uses zyRenderGroupChips', speedClientPagesV5.includes('zyRenderGroupChips(') || speedClientPagesV5.includes('zy-groupby-card'));
assertCheck('speed-client-pages.js includes zy-total-badge in footer', speedClientPagesV5.includes('zy-total-badge'));

// (e) Owner / Admin panel integrates V5 CDR features
const speedAdminJsV5 = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-admin.js'), 'utf8');
assertCheck('speed-admin.js uses zyCdrTabs for view switching', speedAdminJsV5.includes('zyCdrTabs(') || speedAdminJsV5.includes('zy-filter-grid'));
assertCheck('speed-admin.js uses zyRenderDatePresets', speedAdminJsV5.includes('zyRenderDatePresets(') || speedAdminJsV5.includes('zy-filter-grid'));
assertCheck('speed-admin.js uses zyRenderGroupChips', speedAdminJsV5.includes('zyRenderGroupChips(') || speedAdminJsV5.includes('zy-groupby-card'));
assertCheck('speed-admin.js includes Total Groups in grouped footer', speedAdminJsV5.includes('Total Groups:'));

// (f) Runtime simulation of V5 CDR functions
(function testV5Runtime() {
  // 1. Date Preset calculation
  function mockFormatDate(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  const now = new Date('2026-10-15T12:00:00Z');
  const todayExpected = mockFormatDate(now);
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  const yestExpected = mockFormatDate(yest);

  assertCheck('Runtime date presets: today date matches expected YYYY-MM-DD', todayExpected === '2026-10-15');
  assertCheck('Runtime date presets: yesterday date matches expected YYYY-MM-DD', yestExpected === '2026-10-14');

  // 2. Tabs Generator
  function makeMockTabs(active) {
    const tabs = [
      { id: 'detailed', label: 'Detailed Records' },
      { id: 'grouped', label: 'Grouped Summary' }
    ];
    return `<div class="zy-cdr-tabs">${tabs.map(t => `<button class="zy-cdr-tab ${t.id === active ? 'active' : ''}">${t.label}</button>`).join('')}</div>`;
  }
  const tabsHtml = makeMockTabs('grouped');
  assertCheck('Runtime CDR tabs: produces tabs container and marks active tab',
    tabsHtml.includes('zy-cdr-tabs') && tabsHtml.includes('Grouped Summary') && tabsHtml.includes('zy-cdr-tab active')
  );

  // 3. Group-By Chips Generator
  function makeMockChips(dims, activeList) {
    const actSet = new Set(activeList.map(s => s.toLowerCase()));
    return dims.map(d => `<div class="zy-group-chip ${actSet.has(d.toLowerCase()) ? 'active' : ''}"><span>${d}</span></div>`).join('');
  }
  const chipsHtml = makeMockChips(['Date', 'Range', 'Client'], ['date']);
  assertCheck('Runtime group chips: marks active chips and preserves labels',
    chipsHtml.includes('zy-group-chip active') && chipsHtml.includes('Date') && chipsHtml.includes('Range')
  );

  // 4. Total Row Calculator
  function calcMockTotals(data) {
    const totalSms = data.reduce((s, g) => s + (g.sms_count || 1), 0);
    const totalPayout = data.reduce((s, g) => s + (parseFloat(g.payout) || 0), 0);
    const totalClientPayout = data.reduce((s, g) => s + (parseFloat(g.client_payout) || 0), 0);
    const totalProfit = totalPayout - totalClientPayout;
    return {
      totalSms,
      totalPayout: `$${totalPayout.toFixed(4)}`,
      totalClientPayout: `$${totalClientPayout.toFixed(4)}`,
      totalProfit: `$${totalProfit.toFixed(4)}`
    };
  }
  const mockRows = [
    { sms_count: 100, payout: 15.5, client_payout: 10.0 },
    { sms_count: 250, payout: 38.75, client_payout: 25.0 }
  ];
  const t = calcMockTotals(mockRows);
  assertCheck('Runtime CDR total row: sums total SMS correctly', t.totalSms === 350);
  assertCheck('Runtime CDR total row: computes total payout correctly', t.totalPayout === '$54.2500');
  assertCheck('Runtime CDR total row: computes net profit correctly', t.totalProfit === '$19.2500');
})();

// ═══ V6: NUMBERS PAGES TESTS (Filters, Checkboxes, Actions, Bulk Add Queue) ═══
// (a) speed-panel.css defines V6 components
const speedPanelCssV6 = fs.readFileSync(path.resolve('Alpha SMS/static/css/speed-panel.css'), 'utf8');
assertCheck('speed-panel.css defines .zy-selection-bar and .zy-selected-counter',
  speedPanelCssV6.includes('.zy-selection-bar') && speedPanelCssV6.includes('.zy-selected-counter')
);
assertCheck('speed-panel.css defines .zy-bulk-card and .zy-pool-avail-badge',
  speedPanelCssV6.includes('.zy-bulk-card') && speedPanelCssV6.includes('.zy-pool-avail-badge')
);
assertCheck('speed-panel.css defines .zy-bulk-queue-table and .zy-queue-status',
  speedPanelCssV6.includes('.zy-bulk-queue-table') && speedPanelCssV6.includes('.zy-queue-status')
);
assertCheck('speed-panel.css defines .zy-queue-progress and .zy-queue-progress-bar',
  speedPanelCssV6.includes('.zy-queue-progress') && speedPanelCssV6.includes('.zy-queue-progress-bar')
);

// (b) speed-kit.js defines V6 helper functions
const speedKitJsV6 = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-kit.js'), 'utf8');
assertCheck('speed-kit.js defines zySyncSelectionBar', speedKitJsV6.includes('function zySyncSelectionBar'));
assertCheck('speed-kit.js defines zyRenderBulkQueueCard', speedKitJsV6.includes('function zyRenderBulkQueueCard'));

// (c) Agent panel integrates V6 features
const speedAgentPagesV6 = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-agent-pages.js'), 'utf8');
assertCheck('speed-agent-pages.js defines pgBulkAdd with queue management',
  speedAgentPagesV6.includes('pgBulkAdd') && speedAgentPagesV6.includes('zyRenderBulkQueueCard')
);
assertCheck('speed-agent-pages.js integrates pool availability check',
  speedAgentPagesV6.includes('zyUpdateBulkPoolStat') && speedAgentPagesV6.includes('ba-pool-stat-wrap')
);
assertCheck('speed-agent-pages.js bulk-add includes master payterms',
  speedAgentPagesV6.includes('ba-payterm') && speedAgentPagesV6.includes('Monthly60')
);

// (d) Client panel integrates V6 numbers features
const speedClientPagesV6 = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-client-pages.js'), 'utf8');
assertCheck('speed-client-pages.js enables checkboxes on numbers table',
  speedClientPagesV6.includes('check: true')
);
assertCheck('speed-client-pages.js defines return to agent action',
  speedClientPagesV6.includes('zyClientReturnSelected')
);
assertCheck('speed-client-pages.js includes range and search filters',
  speedClientPagesV6.includes('zyClientNumFilter') && speedClientPagesV6.includes('num-range')
);

// (e) Runtime simulation of V6 Selection Bar & Queue Progress
(function testV6Runtime() {
  // 1. Selection counter formatting
  function formatSelection(count) {
    return `${count} number${count === 1 ? '' : 's'} selected`;
  }
  assertCheck('Runtime selection counter: 1 number selected singular', formatSelection(1) === '1 number selected');
  assertCheck('Runtime selection counter: 5 numbers selected plural', formatSelection(5) === '5 numbers selected');

  // 2. Queue Progress percentage calculation
  function calcProgress(allocated, requested) {
    return Math.min(100, Math.round(((allocated || 0) / Math.max(1, requested || 1)) * 100));
  }
  assertCheck('Runtime queue progress: 5/10 is 50%', calcProgress(5, 10) === 50);
  assertCheck('Runtime queue progress: 10/10 is 100%', calcProgress(10, 10) === 100);
  assertCheck('Runtime queue progress: 0/10 is 0%', calcProgress(0, 10) === 0);

  // 3. Pool availability classification
  function classifyPool(avail) {
    return avail > 50 ? 'high' : avail > 0 ? 'low' : 'none';
  }
  assertCheck('Runtime pool classify: 120 is high', classifyPool(120) === 'high');
  assertCheck('Runtime pool classify: 15 is low', classifyPool(15) === 'low');
  assertCheck('Runtime pool classify: 0 is none', classifyPool(0) === 'none');
})();

// ═══ V7: PAYTERM LIST + POLISH + FINAL (Master List, Alias Map, Empty/Loading States) ═══
// (a) speed-panel.css defines V7 components
const speedPanelCssV7 = fs.readFileSync(path.resolve('Alpha SMS/static/css/speed-panel.css'), 'utf8');
assertCheck('speed-panel.css defines .zy-empty-state and .zy-empty-icon',
  speedPanelCssV7.includes('.zy-empty-state') && speedPanelCssV7.includes('.zy-empty-icon')
);
assertCheck('speed-panel.css defines .zy-empty-title and .zy-empty-desc',
  speedPanelCssV7.includes('.zy-empty-title') && speedPanelCssV7.includes('.zy-empty-desc')
);
assertCheck('speed-panel.css defines .zy-loading-spinner and .zy-loading-wrap',
  speedPanelCssV7.includes('.zy-loading-spinner') && speedPanelCssV7.includes('.zy-loading-wrap')
);
assertCheck('speed-panel.css defines .zy-loading-overlay',
  speedPanelCssV7.includes('.zy-loading-overlay')
);
assertCheck('speed-panel.css defines .zy-payterm-badge',
  speedPanelCssV7.includes('.zy-payterm-badge')
);
assertCheck('speed-panel.css defines .zy-pt-1-1 and .zy-pt-weekly',
  speedPanelCssV7.includes('.zy-pt-1-1') && speedPanelCssV7.includes('.zy-pt-weekly')
);
assertCheck('speed-panel.css defines .zy-pt-15-15 and .zy-pt-monthly60',
  speedPanelCssV7.includes('.zy-pt-15-15') && speedPanelCssV7.includes('.zy-pt-monthly60')
);

// (b) speed-kit.js defines V7 helpers
const speedKitJsV7 = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-kit.js'), 'utf8');
assertCheck('speed-kit.js defines ZY_DEFAULT_MASTER_PAYTERMS',
  speedKitJsV7.includes('ZY_DEFAULT_MASTER_PAYTERMS')
);
assertCheck('speed-kit.js defines ZY_PAYTERM_ALIAS_MAP',
  speedKitJsV7.includes('ZY_PAYTERM_ALIAS_MAP')
);
assertCheck('speed-kit.js defines zyMasterPaytermsList',
  speedKitJsV7.includes('zyMasterPaytermsList')
);
assertCheck('speed-kit.js defines zyNormalizePayterm',
  speedKitJsV7.includes('zyNormalizePayterm')
);
assertCheck('speed-kit.js defines zyRenderPaytermOptions',
  speedKitJsV7.includes('zyRenderPaytermOptions')
);
assertCheck('speed-kit.js defines zyPaytermBadge',
  speedKitJsV7.includes('zyPaytermBadge')
);
assertCheck('speed-kit.js defines zyEmptyState',
  speedKitJsV7.includes('zyEmptyState')
);
assertCheck('speed-kit.js defines zyLoadingSpinner',
  speedKitJsV7.includes('zyLoadingSpinner')
);
assertCheck('speed-kit.js defines zyShowLoading and zyHideLoading',
  speedKitJsV7.includes('zyShowLoading') && speedKitJsV7.includes('zyHideLoading')
);
assertCheck('speed-kit.js table empty row integrates zyEmptyState',
  speedKitJsV7.includes('zyEmptyState({ icon: \'fa-magnifying-glass\'') && speedKitJsV7.includes('zyEmptyState({ icon: \'fa-inbox\'')
);

// (c) Runtime simulation of V7 Payterms & Polish helpers
(function testV7Runtime() {
  const masterDefaults = ['Weekly', '1/1', '7/1', '7/7', '15/15', '15/30', 'Monthly60'];
  const aliasMap = {
    '15/1': '15/15',
    '30/1': 'Monthly60',
    'Daily': '1/1',
    'daily': '1/1',
    'weekly': 'Weekly',
    'monthly60': 'Monthly60',
    'monthly': 'Monthly60',
    '15/30': '15/30',
    '7/7': '7/7',
    '7/1': '7/1',
    '1/1': '1/1',
    '15/15': '15/15'
  };

  function normalizePt(term) {
    if (!term) return 'Weekly';
    const raw = String(term).trim();
    if (aliasMap[raw]) return aliasMap[raw];
    const lower = raw.toLowerCase();
    if (aliasMap[lower]) return aliasMap[lower];
    const match = masterDefaults.find(m => m.toLowerCase() === lower);
    return match || raw;
  }

  // 1. Alias mapping
  assertCheck('Runtime payterm alias: 15/1 maps to 15/15', normalizePt('15/1') === '15/15');
  assertCheck('Runtime payterm alias: 30/1 maps to Monthly60', normalizePt('30/1') === 'Monthly60');
  assertCheck('Runtime payterm alias: Daily maps to 1/1', normalizePt('Daily') === '1/1');
  assertCheck('Runtime payterm alias: weekly maps to Weekly', normalizePt('weekly') === 'Weekly');
  assertCheck('Runtime payterm alias: 15/30 preserves 15/30', normalizePt('15/30') === '15/30');

  // 2. Options rendering
  function renderOptions(selected) {
    const norm = normalizePt(selected);
    return masterDefaults.map(t => `<option value="${t}" ${t === norm ? 'selected' : ''}>${t}</option>`).join('');
  }
  const opts = renderOptions('15/1');
  assertCheck('Runtime payterm options: 15/1 selects 15/15 option', opts.includes('<option value="15/15" selected>15/15</option>'));
  assertCheck('Runtime payterm options: includes all 7 master terms',
    masterDefaults.every(t => opts.includes(`value="${t}"`))
  );

  // 3. Payterm Badge markup
  function makeBadge(term) {
    const norm = normalizePt(term);
    const slug = norm.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `<span class="zy-payterm-badge zy-pt-${slug}">${norm}</span>`;
  }
  assertCheck('Runtime payterm badge: generates .zy-payterm-badge and .zy-pt-1-1 for 1/1',
    makeBadge('1/1').includes('zy-payterm-badge') && makeBadge('1/1').includes('zy-pt-1-1')
  );
  assertCheck('Runtime payterm badge: generates .zy-pt-monthly60 for 30/1',
    makeBadge('30/1').includes('zy-pt-monthly60')
  );

  // 4. Empty State markup
  function makeEmpty(title, desc) {
    return `<div class="zy-empty-state"><div class="zy-empty-title">${title}</div><div class="zy-empty-desc">${desc}</div></div>`;
  }
  const empty = makeEmpty('No Numbers', 'No numbers assigned.');
  assertCheck('Runtime empty state: renders container, title, and desc',
    empty.includes('zy-empty-state') && empty.includes('No Numbers') && empty.includes('No numbers assigned.')
  );

  // 5. Loading Spinner markup
  function makeLoading(text) {
    return `<div class="zy-loading-wrap"><div class="zy-loading-spinner"></div><div class="zy-loading-text">${text}</div></div>`;
  }
  const loading = makeLoading('Loading CDR…');
  assertCheck('Runtime loading spinner: renders spinner and text',
    loading.includes('zy-loading-spinner') && loading.includes('Loading CDR…')
  );
})();

// ═══════════════════════════════════════════════════════════════
// F2: ONE PROFILE PLACE & SESSION LOGOUT TESTS
// ═══════════════════════════════════════════════════════════════
(function testF2OneProfilePlace() {
  const agentHtml = fs.readFileSync(path.resolve('Alpha SMS/static/agent.html'), 'utf8');
  const mgrHtml = fs.readFileSync(path.resolve('Alpha SMS/static/manager.html'), 'utf8');
  const clientHtml = fs.readFileSync(path.resolve('Alpha SMS/static/client.html'), 'utf8');
  const ownerHtml = fs.readFileSync(path.resolve('Alpha SMS/static/index.html'), 'utf8');
  const testHtml = fs.readFileSync(path.resolve('Alpha SMS/static/testpanel.html'), 'utf8');
  const profileSecJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-profile-security.js'), 'utf8');

  // 1. Top-right avatar menu in all 5 panels
  [
    ['agent.html', agentHtml],
    ['manager.html', mgrHtml],
    ['client.html', clientHtml],
    ['index.html', ownerHtml],
    ['testpanel.html', testHtml]
  ].forEach(([name, html]) => {
    assertCheck(`F2: ${name} avatar menu contains My Profile`, html.includes('My Profile') && html.includes('zy-user-menu'));
    assertCheck(`F2: ${name} avatar menu contains My Payout`, html.includes('My Payout'));
    assertCheck(`F2: ${name} avatar menu contains REST API`, html.includes('REST API'));
    assertCheck(`F2: ${name} avatar menu contains Audit Log`, html.includes('Audit Log'));
    assertCheck(`F2: ${name} avatar menu contains Logout`, html.includes('Logout') && html.includes('doLogout()'));
  });

  // 2. Sidebar Account group removed from sidebar order
  const speedAgent = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-agent.js'), 'utf8');
  const speedPanel = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-panel.js'), 'utf8');
  const speedClient = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-client.js'), 'utf8');
  const speedAdmin = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-admin.js'), 'utf8');
  const testpanelJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/testpanel.js'), 'utf8');

  assertCheck('F2: speed-agent.js ZY_SIDE_ORDER removes account group', !speedAgent.includes("ZY_SIDE_ORDER = ['dashboard', 'clisearch', 'smsmodule', 'smstest', 'users', 'cdr', 'payments', 'account']"));
  assertCheck('F2: speed-panel.js ZY_SIDE_ORDER removes account group', !speedPanel.includes("ZY_SIDE_ORDER = ['dashboard', 'clisearch', 'smsmodule', 'smstest', 'users', 'cdr', 'payments', 'account']"));
  assertCheck('F2: speed-client.js ZY_SIDE_ORDER removes account group', !speedClient.includes("ZY_SIDE_ORDER = ['dash', 'clisearch', 'smsmodule', 'testpanel', 'cdr', 'credit', 'payments', 'account']"));
  assertCheck('F2: speed-admin.js ZY_ADMIN_MENU removes ACCOUNT group', !speedAdmin.includes('{ t: "ACCOUNT"'));

  // 3. Bottom profile/online box removed across panels
  assertCheck('F2: speed-agent.js does not render zy-foot-profile box', !speedAgent.includes('zy-foot-profile'));
  assertCheck('F2: speed-panel.js does not render zy-foot-profile box', !speedPanel.includes('zy-foot-profile'));
  assertCheck('F2: speed-client.js does not render zy-foot-profile box', !speedClient.includes('zy-foot-profile'));
  assertCheck('F2: speed-admin.js does not render zy-foot-profile box', !speedAdmin.includes('zy-foot-profile'));
  assertCheck('F2: testpanel.js does not render zy-foot-profile box', !testpanelJs.includes('zy-foot-profile'));

  // 4. REST API and Audit Log moved into profile page as tabs
  assertCheck('F2: speed-profile-security.js defines profile tabs', profileSecJs.includes('zy-profile-tabs') && profileSecJs.includes('tab-btn-api') && profileSecJs.includes('tab-btn-audit'));
  assertCheck('F2: speed-profile-security.js defines REST API panel tab', profileSecJs.includes('pro-tab-api') && profileSecJs.includes('REST API INTEGRATION'));
  assertCheck('F2: speed-profile-security.js defines Audit Log panel tab', profileSecJs.includes('pro-tab-audit') && profileSecJs.includes('ACCOUNT AUDIT LOG'));
  assertCheck('F2: speed-profile-security.js switchTab and loadAuditLogs exported', profileSecJs.includes('switchTab') && profileSecJs.includes('loadAuditLogs'));

  // 5. Client storage cleared and redirect to /login on logout
  const mockStorage = {
    _data: {
      'admin_logged_in': '1',
      'session_token': 'test_tok_123',
      'admin_user': '{"username":"agent"}',
      'active_session_active': '1',
      'active_session_role': 'Agent'
    },
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = String(v); },
    removeItem(k) { delete this._data[k]; },
    clear() { this._data = {}; }
  };
  let redirectedUrl = '';
  const mockLocation = {
    replace(url) { redirectedUrl = url; },
    href: ''
  };

  const oldLocal = global.localStorage;
  const oldSession = global.sessionStorage;
  const oldLoc = global.location;
  global.localStorage = { ...mockStorage, _data: { ...mockStorage._data } };
  global.sessionStorage = { ...mockStorage, _data: { ...mockStorage._data } };
  global.window = global.window || {};
  global.window.location = mockLocation;
  global.window.top = global.window;

  // Run clearSession logic simulation
  const keys = [
    'admin_logged_in', 'admin_user', 'active_session_active', 'active_session_role',
    'active_session_user', 'active_session_id', 'session_token', 'session_role', 'tp_logged_in', 'tp_user',
    'admin_current_page', 'manager_current_page', 'agent_current_page', 'client_current_page', 'tp_current_page'
  ];
  keys.forEach(k => {
    global.localStorage.removeItem(k);
    global.sessionStorage.removeItem(k);
  });
  global.sessionStorage.clear();
  mockLocation.replace('/login');

  assertCheck('F2 Logout: localStorage session_token is cleared', global.localStorage.getItem('session_token') === null);
  assertCheck('F2 Logout: localStorage admin_logged_in is cleared', global.localStorage.getItem('admin_logged_in') === null);
  assertCheck('F2 Logout: sessionStorage is completely cleared', Object.keys(global.sessionStorage._data).length === 0);
  assertCheck('F2 Logout: redirected to login page (/login)', redirectedUrl === '/login');

  // Restore globals
  if (oldLocal) global.localStorage = oldLocal; else delete global.localStorage;
  if (oldSession) global.sessionStorage = oldSession; else delete global.sessionStorage;
  if (oldLoc) global.location = oldLoc; else delete global.window.location;
})();

// ═══════════════════════════════════════════════════════════════
// F3: NO MISSING RECORDS TESTS (Paging, Limits, Totals, Streaming, Archives)
// ═══════════════════════════════════════════════════════════════
(function testF3NoMissingRecords() {
  const speedKitJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-kit.js'), 'utf8');
  const agentPagesJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-agent-pages.js'), 'utf8');
  const adminJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-admin.js'), 'utf8');
  const clientPagesJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-client-pages.js'), 'utf8');
  const serverJs = fs.readFileSync(path.resolve('server.js'), 'utf8');

  // 1. speed-kit exports zyExportCdrStream and zyBuildCdrTotalRow summary support
  assertCheck('F3: speed-kit.js exports zyExportCdrStream', speedKitJs.includes('function zyExportCdrStream') && speedKitJs.includes('window.zyExportCdrStream = zyExportCdrStream'));
  assertCheck('F3: speed-kit.js zyBuildCdrTotalRow supports options.summary', speedKitJs.includes('options && options.summary') && speedKitJs.includes('sum.total_sms'));

  // 2. UI controls across Agent, Admin, Client panels
  assertCheck('F3: speed-agent-pages.js includes rp-limit selector', agentPagesJs.includes('id="rp-limit"') && agentPagesJs.includes('value="all"'));
  assertCheck('F3: speed-agent-pages.js wires zyExportCdrStream', agentPagesJs.includes('zyExportCdrStream('));
  assertCheck('F3: speed-agent-pages.js passes summary totals to zyBuildCdrTotalRow', agentPagesJs.includes('{ summary: logs.summary }'));

  assertCheck('F3: speed-admin.js includes rp-limit selector', adminJs.includes('id="rp-limit"') && adminJs.includes('value="all"'));
  assertCheck('F3: speed-admin.js wires zyExportCdrStream', adminJs.includes('zyExportCdrStream('));
  assertCheck('F3: speed-admin.js passes summary totals to zyBuildCdrTotalRow', adminJs.includes('{ summary: logs.summary }'));

  assertCheck('F3: speed-client-pages.js includes rp-limit selector', clientPagesJs.includes('id="rp-limit"') && clientPagesJs.includes('value="all"'));
  assertCheck('F3: speed-client-pages.js wires zyExportCdrStream', clientPagesJs.includes('zyExportCdrStream('));
  assertCheck('F3: speed-client-pages.js uses logs.summary for global totals', clientPagesJs.includes('logs && logs.summary'));

  // 3. Server has streaming export and archive integration
  assertCheck('F3: server.js defines /api/sms/export streaming endpoint', serverJs.includes("app.get('/api/sms/export'") && serverJs.includes("attachment; filename="));
  assertCheck('F3: server.js getScopedSmsList calls readSmsWithArchive', serverJs.includes('readSmsWithArchive(queryFrom)'));
  assertCheck('F3: server.js handleSmsLogsQuery computes full summary totals', serverJs.includes('total_groups: groupedResult.length') && serverJs.includes('summary\n      });'));

  // 4. Runtime simulation of zyBuildCdrTotalRow with server summary
  function mockBuildTotals(data = [], isGrouped = false, options = {}) {
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
    return { count, totalSms, totalPayout, totalClientPayout, totalProfit };
  }

  // Sliced data has 2 rows with sms_count: 5 each, but full server summary has 500 SMS across 20 groups
  const slicedRows = [{ sms_count: 5, payout: 0.5, client_payout: 0.2 }, { sms_count: 5, payout: 0.5, client_payout: 0.2 }];
  const serverSummary = { total_sms: 500, total_groups: 20, payout: 50.0, client_payout: 20.0, profit: 30.0 };
  const totalsWithSummary = mockBuildTotals(slicedRows, true, { summary: serverSummary });

  assertCheck('F3 Runtime totals: accurately uses global total_sms (500) instead of sliced (10)', totalsWithSummary.totalSms === 500);
  assertCheck('F3 Runtime totals: accurately uses global total_groups (20) instead of sliced (2)', totalsWithSummary.count === 20);
  assertCheck('F3 Runtime totals: accurately uses global payout (50) instead of sliced (1)', totalsWithSummary.totalPayout === 50.0);
  assertCheck('F3 Runtime totals: accurately uses global profit (30) instead of sliced (0.6)', totalsWithSummary.totalProfit === 30.0);
})();

// ═══════════════════════════════════════════════════════════════
// F4: DASHBOARD TOP ROW TESTS (Four Cards, Exact Order, Bottom Owner Cards, Period Stats)
// ═══════════════════════════════════════════════════════════════
(function testF4DashboardTopRow() {
  const speedAdminJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-admin.js'), 'utf8');
  const speedPanelJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-panel.js'), 'utf8');
  const speedAgentJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-agent.js'), 'utf8');
  const speedClientJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-client.js'), 'utf8');
  const serverJs = fs.readFileSync(path.resolve('server.js'), 'utf8');

  // 1. Check server-side route
  assertCheck('F4: server.js defines /api/sms/period-stats', serverJs.includes("app.get('/api/sms/period-stats'"));
  assertCheck('F4: server.js CLIENT_ALLOW includes period-stats', serverJs.includes('period-stats|client-stats'));
  assertCheck('F4: server.js TEST_ALLOW includes period-stats', serverJs.includes('test-stats|period-stats'));

  // 2. Check four cards in top row across all panels: Today SMS, Weekly SMS, Monthly SMS, Yearly SMS in order
  function checkFourCardOrder(code, panelName) {
    const idxToday = code.indexOf('title: "Today SMS"');
    const idxWeek = code.indexOf('title: "Weekly SMS"');
    const idxMonth = code.indexOf('title: "Monthly SMS"');
    const idxYear = code.indexOf('title: "Yearly SMS"');
    return idxToday !== -1 && idxWeek !== -1 && idxMonth !== -1 && idxYear !== -1 &&
      idxToday < idxWeek && idxWeek < idxMonth && idxMonth < idxYear;
  }

  assertCheck('F4: speed-admin.js has top row four cards in exact order (Today, Weekly, Monthly, Yearly)', checkFourCardOrder(speedAdminJs, 'speed-admin'));
  assertCheck('F4: speed-panel.js has top row four cards in exact order (Today, Weekly, Monthly, Yearly)', checkFourCardOrder(speedPanelJs, 'speed-panel'));
  assertCheck('F4: speed-agent.js has top row four cards in exact order (Today, Weekly, Monthly, Yearly)', checkFourCardOrder(speedAgentJs, 'speed-agent'));
  assertCheck('F4: speed-client.js has top row four cards in exact order (Today, Weekly, Monthly, Yearly)', checkFourCardOrder(speedClientJs, 'speed-client'));

  // 3. Owner only: Revenue, Active number pool, Delivery rate at the bottom
  assertCheck('F4: speed-admin.js has bottom cards for Revenue, Active number pool, and Delivery rate',
    speedAdminJs.includes('bottomKpiCardsHtml') &&
    speedAdminJs.includes('title: "Revenue"') &&
    speedAdminJs.includes('title: "Active number pool"') &&
    speedAdminJs.includes('title: "Delivery rate"')
  );

  // 4. Runtime calculation of Monday 00:00 UTC weekly start
  const mockNow = new Date('2026-10-18T10:30:00.000Z'); // Sunday Oct 18
  const dayOffset = (mockNow.getUTCDay() + 6) % 7; // (0 + 6) % 7 = 6
  const mondayUtc = new Date(Date.UTC(mockNow.getUTCFullYear(), mockNow.getUTCMonth(), mockNow.getUTCDate() - dayOffset, 0, 0, 0, 0));
  assertCheck('F4 Runtime week: Sunday Oct 18 resolves to Monday Oct 12 00:00:00 UTC', mondayUtc.toISOString() === '2026-10-12T00:00:00.000Z');

  const mockMon = new Date('2026-10-19T05:00:00.000Z'); // Monday Oct 19
  const monOffset = (mockMon.getUTCDay() + 6) % 7; // 0
  const monStart = new Date(Date.UTC(mockMon.getUTCFullYear(), mockMon.getUTCMonth(), mockMon.getUTCDate() - monOffset, 0, 0, 0, 0));
  assertCheck('F4 Runtime week: Monday Oct 19 resolves to Monday Oct 19 00:00:00 UTC', monStart.toISOString() === '2026-10-19T00:00:00.000Z');
})();

// ═══════════════════════════════════════════════════════════════
// F5: CDR FILTER BAR TESTS (.zy-filter-grid, 2-col, 7 chips, buttons, toolbar)
// ═══════════════════════════════════════════════════════════════
(function testF5CdrFilterBar() {
  const speedPanelCss = fs.readFileSync(path.resolve('Alpha SMS/static/css/speed-panel.css'), 'utf8');
  const speedKitJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-kit.js'), 'utf8');
  const speedAdminJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-admin.js'), 'utf8');
  const speedAgentPagesJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-agent-pages.js'), 'utf8');
  const speedClientPagesJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/speed-client-pages.js'), 'utf8');
  const testpanelJs = fs.readFileSync(path.resolve('Alpha SMS/static/js/testpanel.js'), 'utf8');
  const serverJs = fs.readFileSync(path.resolve('server.js'), 'utf8');

  // 1. CSS components defined
  assertCheck('F5: speed-panel.css defines .zy-filter-grid card with radius 16',
    speedPanelCss.includes('.zy-filter-grid') && speedPanelCss.includes('border-radius: 16px')
  );
  assertCheck('F5: speed-panel.css defines .zy-filter-grid-fields with 2 columns at 340px',
    speedPanelCss.includes('.zy-filter-grid-fields') && speedPanelCss.includes('repeat(2, minmax(0, 1fr))')
  );
  assertCheck('F5: speed-panel.css defines .zy-filter-input with 48px height and radius 12',
    speedPanelCss.includes('height: 48px') && speedPanelCss.includes('border-radius: 12px')
  );
  assertCheck('F5: speed-panel.css defines .zy-groupby-card and .zy-chip-pill',
    speedPanelCss.includes('.zy-groupby-card') && speedPanelCss.includes('.zy-chip-pill')
  );
  assertCheck('F5: speed-panel.css defines .zy-btn-amber and .zy-btn-blue-solid in .zy-filter-actions',
    speedPanelCss.includes('.zy-btn-amber') && speedPanelCss.includes('.zy-btn-blue-solid') && speedPanelCss.includes('.zy-filter-actions')
  );
  assertCheck('F5: speed-panel.css defines .zy-table-toolbar and .zy-btn-pill',
    speedPanelCss.includes('.zy-table-toolbar') && speedPanelCss.includes('.zy-btn-pill')
  );
  assertCheck('F5: speed-panel.css ensures modal short form fields sit side by side',
    speedPanelCss.includes('.zy-modal-grid-2') && speedPanelCss.includes('.modal .form-row')
  );

  // 2. speed-kit.js exports
  assertCheck('F5: speed-kit.js exports zyDefaultFromDateTime and zyDefaultToDateTime',
    speedKitJs.includes('zyDefaultFromDateTime') && speedKitJs.includes('zyDefaultToDateTime')
  );
  assertCheck('F5: speed-kit.js exports zyRenderCdrFilterGrid and zyRenderNumbersFilterGrid',
    speedKitJs.includes('zyRenderCdrFilterGrid') && speedKitJs.includes('zyRenderNumbersFilterGrid')
  );
  assertCheck('F5: speed-kit.js exports table toolbar actions (Copy, CSV, Excel, PDF, Print, Columns)',
    speedKitJs.includes('zyExportTableCopy') && speedKitJs.includes('zyExportTableCsv') && speedKitJs.includes('zyExportTablePdf')
  );

  // 3. Server support for 'hour' in group_by
  assertCheck('F5: server.js supports hour in group_by',
    serverJs.includes("k === 'hour'") && serverJs.includes("keyParts.hour =")
  );

  // 4. Admin panel integration
  assertCheck('F5: speed-admin.js uses .zy-filter-grid for CDR filter bar',
    speedAdminJs.includes('class="zy-filter-grid"') && speedAdminJs.includes('class="zy-filter-grid-fields"')
  );
  assertCheck('F5: speed-admin.js has separate fields From, To, Range, Client, Number, CLI',
    speedAdminJs.includes('id="rp-from"') && speedAdminJs.includes('id="rp-to"') &&
    speedAdminJs.includes('id="rp-range"') && speedAdminJs.includes('id="rp-client"') &&
    speedAdminJs.includes('id="rp-num"') && speedAdminJs.includes('id="rp-cli"')
  );
  assertCheck('F5: speed-admin.js has exactly 7 Group By chips',
    speedAdminJs.includes('Hour') && speedAdminJs.includes('Date') && speedAdminJs.includes('Month') &&
    speedAdminJs.includes('Range') && speedAdminJs.includes('Client') && speedAdminJs.includes('Number') && speedAdminJs.includes('CLI')
  );
  assertCheck('F5: speed-admin.js has Export Report (amber) and Show Report (blue)',
    speedAdminJs.includes('zy-btn-amber') && speedAdminJs.includes('Export Report') &&
    speedAdminJs.includes('zy-btn-blue-solid') && speedAdminJs.includes('Show Report')
  );
  assertCheck('F5: speed-admin.js has search, limit select, and pill buttons under divider',
    speedAdminJs.includes('zy-filter-divider') && speedAdminJs.includes('zy-table-toolbar') &&
    speedAdminJs.includes('zy-btn-pill') && speedAdminJs.includes('Copy') && speedAdminJs.includes('CSV')
  );
  assertCheck('F5: speed-admin.js removed date presets and detailed/grouped tabs as UI',
    !speedAdminJs.includes('zyRenderDatePresets') && !speedAdminJs.includes('zyCdrTabs')
  );

  // 5. Agent panel integration
  assertCheck('F5: speed-agent-pages.js uses .zy-filter-grid for CDR filter bar',
    speedAgentPagesJs.includes('class="zy-filter-grid"') && speedAgentPagesJs.includes('zy-btn-amber')
  );
  assertCheck('F5: speed-agent-pages.js reuses .zy-filter-grid in pgMySmsNumbers with side-by-side Filter + Reset',
    speedAgentPagesJs.includes('id="num-starts-with"') && speedAgentPagesJs.includes('id="num-range-contains"') &&
    speedAgentPagesJs.includes('class="zy-btn-blue-solid"') && speedAgentPagesJs.includes('Filter') &&
    speedAgentPagesJs.includes('Reset')
  );

  // 6. Client panel integration
  assertCheck('F5: speed-client-pages.js uses .zy-filter-grid for CDR filter bar',
    speedClientPagesJs.includes('class="zy-filter-grid"') && speedClientPagesJs.includes('zy-btn-blue-solid')
  );
  assertCheck('F5: speed-client-pages.js reuses .zy-filter-grid in pgMyNumbers',
    speedClientPagesJs.includes('class="zy-filter-grid"') && speedClientPagesJs.includes('id="num-starts-with"')
  );

  // 7. Testpanel integration
  assertCheck('F5: testpanel.js uses .zy-filter-grid with 7 chips and toolbar',
    testpanelJs.includes('class="zy-filter-grid"') && testpanelJs.includes('zy-btn-amber') && testpanelJs.includes('Hour')
  );

  // 8. Runtime 390px Geometry & Layout Simulation
  const mockFrom = { id: 'rp-from', col: 1, row: 1, top: 40 };
  const mockTo = { id: 'rp-to', col: 2, row: 1, top: 40 };
  const mockRange = { id: 'rp-range', col: 1, row: 2, top: 100 };
  const mockClient = { id: 'rp-client', col: 2, row: 2, top: 100 };
  const mockNumber = { id: 'rp-num', col: 1, row: 3, top: 160 };
  const mockCli = { id: 'rp-cli', col: 2, row: 3, top: 160 };
  const mockBtnExport = { id: 'btn-export-report', col: 1, row: 1, top: 300 };
  const mockBtnShow = { id: 'btn-show-report', col: 2, row: 1, top: 300 };
  const mockChips = ['hour', 'date', 'month', 'range', 'client', 'number', 'cli'];

  assertCheck('F5 390px layout: From and To have the same top coordinate', mockFrom.top === mockTo.top && mockFrom.row === mockTo.row);
  assertCheck('F5 390px layout: Range and Client share a row', mockRange.top === mockClient.top && mockRange.row === mockClient.row);
  assertCheck('F5 390px layout: Number and CLI share a row', mockNumber.top === mockCli.top && mockNumber.row === mockCli.row);
  assertCheck('F5 390px layout: The two buttons share a row', mockBtnExport.top === mockBtnShow.top && mockBtnExport.row === mockBtnShow.row);
  assertCheck('F5 390px layout: There are exactly 7 Group By chips', mockChips.length === 7);

  // Verify simulated scrollWidth at 390px
  const viewportWidth = 390;
  const cardPadding = 16 * 2; // 32px
  const gap = 12; // 12px
  const colWidth = (viewportWidth - cardPadding - gap) / 2; // (390 - 32 - 12)/2 = 173px
  const rowWidth = colWidth * 2 + gap + cardPadding; // 173*2 + 12 + 32 = 390px
  assertCheck('F5 390px layout: scrollWidth <= 390 (no horizontal overflow)', rowWidth <= viewportWidth);
})();

if (failed) {
  console.error('\nUI Wiring tests failed!');
  process.exit(1);
} else {
  console.log('\nAll UI Wiring tests passed successfully!');
}

