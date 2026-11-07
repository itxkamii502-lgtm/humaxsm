/* ═══════════════════════════════════════════════════════════════
   ALPHA SMS — Universal SPA Router, Deep Links & History Sync (V3)
   - Zero full-page reloads
   - history.pushState & popstate Back/Forward sync
   - Canonical deep linking /ints/:role/:Page
   - Automatic skeleton rendering on page transition
   - Synchronizes accordion active state and document title
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const MAPS = {
    owner: {
      'dashboard': 'SMSDashboard',
      'my-numbers': 'SMSNumbers',
      'bulk-allocation': 'SMSBulkAllocations',
      'allocation-history': 'AllocationHistory',
      'sms-ranges': 'SMSRanges',
      'sms-rate-card': 'SMSRateCard',
      'search-access': 'SearchAccess',
      'live-access': 'LiveAccess',
      'upload-numbers': 'UploadNumbers',
      'blacklist-management': 'Blacklist',
      'revoke-numbers': 'RevokeNumbers',
      'transfer-numbers': 'TransferNumbers',
      'number-transfers-log': 'TransferHistory',
      'test-numbers': 'TestNumbers',
      'sms-test-panel': 'SMSTestPanel',
      'test-panel-numbers': 'TestPanelNumbers',
      'test-panel-accounts': 'TestPanelAccounts',
      'my-sms': 'SMSReports',
      'profit-stats': 'ProfitStats',
      'live-otp-feed': 'LiveOtpFeed',
      'sms-analytics': 'SMSAnalytics',
      'search-sms': 'SearchSMS',
      'delivery-logs': 'DeliveryLogs',
      'failed-sms': 'FailedSMS',
      'live-traffic': 'LiveTraffic',
      'smpp-dashboard': 'SMPPDashboard',
      'smpp-accounts': 'SMPPAccounts',
      'login-panels': 'LoginPanels',
      'cr-api-panels': 'CRAPIPanels',
      'smpp-sessions': 'SMPPSessions',
      'connected-clients': 'ConnectedClients',
      'dlr-monitor': 'DLRMonitor',
      'throughput-monitor': 'ThroughputMonitor',
      'smpp-security': 'SMPPSecurity',
      'connection-logs': 'ConnectionLogs',
      'registration-requests': 'RegistrationRequests',
      'payout-requests': 'PaymentRequests',
      'users': 'Users',
      'managers': 'Managers',
      'agents': 'Agents',
      'clients': 'Clients',
      'hierarchy': 'Hierarchy',
      'account-balances': 'AccountBalances',
      'audit-logs': 'AuditLogs',
      'login-activity': 'LoginActivity',
      'business-reports': 'BusinessReports',
      'permissions': 'Permissions',
      'http-overview': 'HTTPOverview',
      'standard-webhook': 'StandardWebhook',
      'custom-postback': 'CustomPostback',
      'field-mapping': 'FieldMapping',
      'test-endpoint': 'TestEndpoint',
      'api-tokens': 'ApiTokens',
      'api-playground': 'APIPlayground',
      'live-test': 'LiveTest',
      'webhook-config': 'WebhookConfig',
      'documentation': 'Documentation',
      'profile': 'Profile',
      'my-profile': 'Profile',
      'general-settings': 'GeneralSettings',
      'system-health': 'SystemHealth'
    },
    manager: {
      'dashboard': 'SMSDashboard',
      'sms-overview': 'SMSRanges',
      'my-numbers': 'SMSNumbers',
      'my-sms-numbers': 'SMSNumbers',
      'payout-rates-view': 'SMSRateCard',
      'assign-numbers': 'SMSBulkAllocations',
      'agents': 'Agents',
      'add-agent': 'AddAgent',
      'clients': 'Clients',
      'add-client': 'AddClient',
      'reports': 'SMSReports',
      'my-earnings': 'AgentCreditNotes',
      'payout-requests': 'PaymentRequests',
      'usd-statements': 'USDStatements',
      'eur-statements': 'EURStatements',
      'gbp-statements': 'GBPStatements',
      'sms-test-panel': 'SMSTestPanel',
      'news': 'NewsForClients',
      'notifications': 'NewsForClients',
      'profile': 'Profile',
      'agent-performance': 'AgentPerformance',
      'client-balances': 'ClientBalances',
      'client-limits': 'Limits',
      'traffic': 'LiveTraffic',
      'api-tokens': 'ApiTokens'
    },
    client: {
      'dashboard': 'SMSDashboard',
      'my-numbers': 'MySMSNumbers',
      'my-sms': 'SMSCDRStats',
      'sms-test-panel': 'SMSTestPanel',
      'my-profile': 'Profile',
      'profile': 'Profile',
      'news': 'Notifications',
      'notifications': 'Notifications',
      'my-balance': 'MyBalance',
      'my-earnings': 'MyEarnings'
    },
    agent: {
      'dashboard': 'SMSDashboard',
      'sms-ranges': 'SMSRanges',
      'my-sms-numbers': 'MySMSNumbers',
      'bulk-add': 'BulkAdd',
      'sms-ratecard': 'SMSRateCard',
      'access-search': 'AccessSearch',
      'news-clients': 'NewsMaster',
      'notifications': 'Notifications',
      'my-clients': 'Clients',
      'detailed-sms': 'DetailedSMSReports',
      'summary-sms': 'SummarySMSReports',
      'client-sms-stats': 'ClientSMSStats',
      'sms-range-stats': 'SMSRangeStats',
      'sms-number-stats': 'SMSNumberStats',
      'credit-notes': 'MyCreditNotes',
      'payment-requests': 'PaymentRequests',
      'bank-accounts': 'BankAccounts',
      'usd-statements': 'USDStatements',
      'eur-statements': 'EURStatements',
      'gbp-statements': 'GBPStatements',
      'voice-test-panel': 'VoiceTestPanel',
      'sms-test-panel': 'SMSTestPanel',
      'profile': 'Profile',
      'api-tokens': 'ApiTokens',
      'audit-logs': 'AuditLogs'
    },
    test: {
      'dashboard': 'Dashboard',
      'test-numbers': 'SMSTestNumbers',
      'test-reports': 'TestSMSCDRStats'
    }
  };
  MAPS.admin = MAPS.owner;
  MAPS.testpanel = MAPS.test;

  const parts = location.pathname.split('/').filter(Boolean);
  let role = parts[0] === 'ints' ? parts[1] : null;
  if (!role) {
    const p = location.pathname.toLowerCase();
    if (p.includes('client')) role = 'client';
    else if (p.includes('agent')) role = 'agent';
    else if (p.includes('manager')) role = 'manager';
    else if (p.includes('test')) role = 'test';
    else if (p.includes('owner') || p.includes('admin') || p.includes('dashboard') || p === '/') role = 'owner';
    else role = 'owner';
  }
  if (role === 'admin') role = 'owner';
  const map = MAPS[role] || MAPS.owner;

  const reverse = {};
  Object.keys(map).forEach(k => {
    reverse[map[k].toLowerCase()] = k;
  });

  function urlFor(page) {
    const seg = map[page] || 'SMSDashboard';
    return `/ints/${role}/${seg}`;
  }

  function formatTitle(page) {
    const code = map[page] || page;
    const readable = code.replace(/([A-Z])/g, ' $1').trim();
    const roleTitle = role.charAt(0).toUpperCase() + role.slice(1);
    return `Alpha SMS — ${roleTitle} | ${readable}`;
  }

  function pageFromUrl() {
    const seg = (location.pathname.split('/').filter(Boolean)[2] || '').toLowerCase();
    return reverse[seg];
  }

  let isNavigatingHistory = false;
  let first = true;
  const prev = window.loadPage;

  if (typeof prev === 'function') {
    window.loadPage = function (page) {
      if (first) {
        first = false;
        const want = pageFromUrl();
        if (want && want !== page) page = want;
      }

      // 1. Show smooth skeleton state before async fetch starts
      if (typeof window.zyShowSkeleton === 'function') {
        window.zyShowSkeleton(page);
      }

      // 2. Delegate to real page renderer
      prev(page);

      // 3. Sync browser history without full page reload
      if (!isNavigatingHistory && map[page]) {
        try {
          history.pushState({ page, role }, '', urlFor(page));
          document.title = formatTitle(page);
        } catch (e) {}
      }

      // 4. Sync active accordion group & item in sidebar
      if (typeof window.zySyncAccordionActive === 'function') {
        window.zySyncAccordionActive(page);
      }
      if (typeof window.zyUpdateBreadcrumb === 'function') {
        window.zyUpdateBreadcrumb(page);
      }
    };
  }

  /* Browser back / forward buttons (popstate) */
  window.addEventListener('popstate', e => {
    const seg = (location.pathname.split('/').filter(Boolean)[2] || 'SMSDashboard').toLowerCase();
    const page = (e.state && e.state.page) || reverse[seg] || 'dashboard';
    if (page && typeof prev === 'function') {
      isNavigatingHistory = true;
      try {
        if (typeof window.zyShowSkeleton === 'function') {
          window.zyShowSkeleton(page);
        }
        prev(page);
        document.title = formatTitle(page);
        if (typeof window.zySyncAccordionActive === 'function') {
          window.zySyncAccordionActive(page);
        }
        if (typeof window.zyUpdateBreadcrumb === 'function') {
          window.zyUpdateBreadcrumb(page);
        }
      } finally {
        isNavigatingHistory = false;
      }
    }
  });

  /* Open the deep-linked page on initial load */
  window.addEventListener('load', () => {
    setTimeout(() => {
      const page = pageFromUrl();
      if (first && page && typeof window.loadPage === 'function') {
        window.loadPage(page);
      } else if (!page && typeof history.replaceState === 'function') {
        try {
          history.replaceState({ page: 'dashboard', role }, '', urlFor('dashboard'));
          document.title = formatTitle('dashboard');
        } catch (e) {}
      }
    }, 400);
  });
})();
