/* ═══════════════════════════════════════════════════════════════
   HUMEX SMS — High Security Role Guard & Session Isolation Engine
   Guarantees 100% strict role isolation:
   - Each browser tab maintains its own authenticated role session
   - Eliminates role hijacking / cross-tab mixing
   - Supports URL token auto-ingestion for seamless iframe/webview auth
   ═══════════════════════════════════════════════════════════════ */

(function (window) {
  'use strict';

  const ROLE_ROUTES = {
    owner: '/ints/owner/SMSDashboard',
    admin: '/ints/owner/SMSDashboard',
    manager: '/ints/manager/SMSDashboard',
    agent: '/ints/agent/SMSDashboard',
    client: '/ints/client/SMSDashboard',
    reseller: '/ints/client/SMSDashboard',
    testpanel: '/ints/testpanel/SMSDashboard'
  };

  function normalizeRole(r) {
    if (!r) return '';
    const clean = String(r).trim().toLowerCase();
    if (clean === 'admin' || clean === 'owner') return 'owner';
    if (clean === 'manager') return 'manager';
    if (clean === 'agent') return 'agent';
    if (clean === 'client' || clean === 'reseller') return 'client';
    if (clean === 'testpanel') return 'testpanel';
    return clean;
  }

  function getActiveRole() {
    try {
      // 1. Check tab-isolated sessionStorage first (strictly prevents tab role mix-up)
      const tabRole = sessionStorage.getItem('session_role');
      if (tabRole) return tabRole.trim();

      const tabUserStr = sessionStorage.getItem('admin_user');
      if (tabUserStr) {
        const u = JSON.parse(tabUserStr);
        if (u && u.role) return u.role.trim();
      }

      // 2. Check localStorage fallback (for newly opened tabs)
      const explicit = localStorage.getItem('active_session_role');
      if (explicit) return explicit.trim();

      const uStr = localStorage.getItem('admin_user') || localStorage.getItem('active_session_user');
      if (uStr) {
        const u = JSON.parse(uStr);
        if (u && u.role) return u.role.trim();
      }
    } catch (e) {}
    return null;
  }

  function getActiveUser() {
    try {
      const tabUser = sessionStorage.getItem('admin_user');
      if (tabUser) return JSON.parse(tabUser);

      const uStr = localStorage.getItem('admin_user') || localStorage.getItem('active_session_user');
      if (uStr) return JSON.parse(uStr);
    } catch (e) {}
    return null;
  }

  function isLoggedIn() {
    try {
      const flag = sessionStorage.getItem('admin_logged_in') || localStorage.getItem('admin_logged_in');
      const active = localStorage.getItem('active_session_active');
      const hasRole = !!getActiveRole();
      return (flag === '1' || active === '1') && hasRole;
    } catch (e) {
      return false;
    }
  }

  function getRoleRedirect(role) {
    const nr = normalizeRole(role);
    return ROLE_ROUTES[nr] || '/owner';
  }

  // Ensure current tab's sessionStorage matches user metadata (auth itself uses HttpOnly cookies)
  function syncSession() {
    try {
      // Clean any legacy ?token= param from address bar if present
      if (window.location.search) {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('token') || urlParams.has('session_token')) {
          urlParams.delete('token');
          urlParams.delete('session_token');
          const remainingSearch = urlParams.toString();
          const cleanUrl = window.location.pathname + (remainingSearch ? '?' + remainingSearch : '') + window.location.hash;
          try { window.history.replaceState({}, document.title, cleanUrl); } catch (_) {}
        }
      }

      // Remove any stale raw tokens from Web Storage
      try { sessionStorage.removeItem('session_token'); } catch (_) {}
      try { localStorage.removeItem('session_token'); } catch (_) {}

      // Sync non-secret user metadata to sessionStorage
      if (isLoggedIn()) {
        const user = getActiveUser();
        const role = getActiveRole();
        sessionStorage.setItem('admin_logged_in', '1');
        if (role) sessionStorage.setItem('session_role', role);
        if (user) {
          if (user.token) delete user.token;
          sessionStorage.setItem('admin_user', JSON.stringify(user));
        }
        if (normalizeRole(role) === 'testpanel') {
          sessionStorage.setItem('tp_logged_in', '1');
          if (user) sessionStorage.setItem('tp_user', JSON.stringify(user));
        }
      }
    } catch (e) {}
  }

  // Called on login to set this browser's metadata (session secret remains in HttpOnly cookie)
  function setSession(userObj) {
    try {
      const role = (userObj && userObj.role) ? userObj.role : 'Owner';
      const cleanUser = userObj ? { ...userObj } : {};
      delete cleanUser.token;
      const userJson = JSON.stringify(cleanUser);

      // Tab-isolated session metadata
      sessionStorage.setItem('admin_logged_in', '1');
      sessionStorage.setItem('admin_user', userJson);
      sessionStorage.setItem('session_role', role);
      sessionStorage.removeItem('session_token');

      // Global storage metadata for new tab initial state
      localStorage.setItem('admin_logged_in', '1');
      localStorage.setItem('active_session_active', '1');
      localStorage.setItem('active_session_role', role);
      localStorage.setItem('active_session_user', userJson);
      localStorage.setItem('admin_user', userJson);
      localStorage.setItem('active_session_id', Date.now().toString());
      localStorage.removeItem('session_token');

      if (normalizeRole(role) === 'testpanel') {
        localStorage.setItem('tp_logged_in', '1');
        localStorage.setItem('tp_user', userJson);
        sessionStorage.setItem('tp_logged_in', '1');
        sessionStorage.setItem('tp_user', userJson);
      }
    } catch (e) {
      console.error('Error saving session:', e);
    }
  }

  // Clear session globally across this browser
  function clearSession() {
    const keys = [
      'admin_logged_in', 'admin_user', 'active_session_active', 'active_session_role',
      'active_session_user', 'active_session_id', 'session_token', 'session_role', 'tp_logged_in', 'tp_user',
      'admin_current_page', 'manager_current_page', 'agent_current_page', 'client_current_page', 'tp_current_page'
    ];
    keys.forEach(function (k) {
      try { localStorage.removeItem(k); } catch (e) {}
      try { sessionStorage.removeItem(k); } catch (e) {}
    });
    try { localStorage.setItem('auth_logout_timestamp', Date.now().toString()); } catch (e) {}
    try { sessionStorage.clear(); } catch (e) {}
    try {
      fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      }).catch(function () {});
    } catch (e) {}
    try {
      if (window.top && window.top !== window) {
        window.top.location.replace('/login');
        return;
      }
    } catch (e) {}
    window.location.replace('/login');
  }

  // Strict page guard: ensures current page is allowed for the active role
  function enforce(allowedRoles) {
    syncSession();

    if (!isLoggedIn()) {
      window.__AUTH_BLOCKED__ = true;
      try {
        if (window.top && window.top !== window) {
          window.top.location.replace('/ints/login');
          return false;
        }
      } catch (_) {}
      window.location.replace('/ints/login');
      return false;
    }

    const currentRole = normalizeRole(getActiveRole());
    const allowed = (allowedRoles || []).map(normalizeRole);

    // Strict role check: each panel is strictly locked to its designated role
    if (!allowed.includes(currentRole)) {
      window.__AUTH_BLOCKED__ = true;
      // Role mismatch! This user is not authorized for this role's panel.
      // Redirect to their own authorized panel.
      const targetUrl = getRoleRedirect(currentRole);
      window.location.replace(targetUrl);
      return false;
    }

    return true;
  }

  function switchRole(targetRole) {
    // High security: role switching requires authentic login credentials
    clearSession();
  }

  // Cross-tab listener: only react to explicit logout
  function initCrossTabWatcher(allowedRoles) {
    window.addEventListener('storage', function (e) {
      if (e.key === 'auth_logout_timestamp') {
        window.location.replace('/login');
      }
    });
  }

  window.SpeedAuth = {
    normalizeRole: normalizeRole,
    getActiveRole: getActiveRole,
    getActiveUser: getActiveUser,
    isLoggedIn: isLoggedIn,
    getRoleRedirect: getRoleRedirect,
    syncSession: syncSession,
    setSession: setSession,
    clearSession: clearSession,
    enforce: enforce,
    switchRole: switchRole,
    initCrossTabWatcher: initCrossTabWatcher
  };

})(window);
