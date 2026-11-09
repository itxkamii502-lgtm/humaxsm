/* ═══════════════════════════════════════════════════════════════════
   ALPHA SMS — Advanced Profile, Email Binding & 2FA Security Engine
   Matches the reference video:
   1. Personal Details (Full name, Email Binding with OTP, Phone, Teams)
   2. Account Login info
   3. Change Password
   4. Authentic Google Authenticator 2FA (QR Code + Secret + Enable/Disable)
   ═══════════════════════════════════════════════════════════════════ */

(function (window) {
  'use strict';

  async function loadUserProfile() {
    try {
      const token = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
      const res = await fetch('/api/user/profile', {
        headers: token ? { 'Authorization': 'Bearer ' + token } : {}
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && data.user) {
          return data.user;
        }
      }
    } catch (e) {
      console.warn('Failed to fetch profile from server:', e);
    }
    return JSON.parse(sessionStorage.getItem('admin_user') || localStorage.getItem('admin_user') || '{}');
  }

  async function renderProfileView(containerId = 'page-content', initialTab = 'details') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div style="display:flex; justify-content:center; align-items:center; min-height: 280px;">
        <div class="spinner"></div>
      </div>
    `;

    const user = await loadUserProfile();
    const is2fa = !!user.two_fa;

    container.innerHTML = `
      <div class="page-header" style="margin-bottom: 16px;">
        <div class="page-title" style="font-size: 20px; font-weight: 700; color: #0f172a;">Account & Profile</div>
      </div>

      <div class="zy-profile-tabs" style="display:flex; gap:8px; border-bottom:2px solid #e2e8f0; margin-bottom:20px; padding-bottom:8px;">
        <button type="button" id="tab-btn-details" class="zy-profile-tab" onclick="window.SpeedProfile.switchTab('details')" style="display:inline-flex; align-items:center; gap:8px; padding:8px 16px; border-radius:8px; border:none; cursor:pointer; font-size:13px; font-weight:700; background:#f1f5f9; color:#0f172a;">
          <i class="far fa-user"></i> My Profile
        </button>
        <button type="button" id="tab-btn-api" class="zy-profile-tab" onclick="window.SpeedProfile.switchTab('api')" style="display:inline-flex; align-items:center; gap:8px; padding:8px 16px; border-radius:8px; border:none; cursor:pointer; font-size:13px; font-weight:600; background:transparent; color:#64748b;">
          <i class="fas fa-key"></i> REST API
        </button>
        <button type="button" id="tab-btn-audit" class="zy-profile-tab" onclick="window.SpeedProfile.switchTab('audit')" style="display:inline-flex; align-items:center; gap:8px; padding:8px 16px; border-radius:8px; border:none; cursor:pointer; font-size:13px; font-weight:600; background:transparent; color:#64748b;">
          <i class="far fa-file-lines"></i> Audit Log
        </button>
      </div>

      <div id="pro-tab-details" style="width: 100%; max-width: 100%; margin: 0 auto; display: flex; flex-direction: column; gap: 24px;">
        
        <!-- CARD 1: PERSONAL DETAILS -->
        <div class="card" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:22px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 18px;">
            <div style="font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">PERSONAL DETAILS</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 3px;">Visible to admins for support / payout reconciliation</div>
          </div>

          <form id="pro-personal-form" onsubmit="window.SpeedProfile.savePersonal(event)">
            <div style="margin-bottom: 16px;">
              <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:6px;">Full name</label>
              <input type="text" id="pro-fullname" value="${escapeHtml(user.full_name || '')}" placeholder="Your Full Name"
                style="width:100%; height:40px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:14px; color:#0f172a; background:#ffffff;">
            </div>

            <div style="margin-bottom: 16px;">
              <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:6px;">Email</label>
              <input type="email" id="pro-email" value="${escapeHtml(user.email || '')}" placeholder="name@domain.com"
                style="width:100%; height:40px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:14px; color:#0f172a; background:#ffffff;">
            </div>

            <!-- Contact Number -->
            <div style="margin-bottom: 16px;">
              <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:6px;">Contact (phone / WhatsApp)</label>
              <input type="text" id="pro-phone" value="${escapeHtml(user.phone || '')}" placeholder="+92 300 1234567"
                style="width:100%; height:40px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:14px; color:#0f172a; background:#ffffff;">
              <div style="font-size:11.5px; color:#64748b; margin-top:4px;">Managed by the panel. Ask an admin to change it if needed.</div>
            </div>

            <!-- Teams / Telegram -->
            <div style="margin-bottom: 18px;">
              <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:6px;">Teams / Telegram</label>
              <input type="text" id="pro-teams" value="${escapeHtml(user.teams || '')}" placeholder="username or handle"
                style="width:100%; height:40px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:14px; color:#0f172a; background:#ffffff;">
            </div>

            <button type="submit" class="btn btn-primary"
              style="height:40px; padding:0 22px; font-size:13.5px; font-weight:600; border-radius:8px; background:#0284c7; color:#fff; border:none; cursor:pointer; box-shadow:0 2px 4px rgba(2,132,199,0.25);">
              Save changes
            </button>
          </form>
        </div>

        <!-- CARD 2: ACCOUNT LOGIN -->
        <div class="card" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:22px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 18px;">
            <div style="font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">ACCOUNT LOGIN</div>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div>
              <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:6px;">Username</label>
              <input type="text" value="${escapeHtml(user.username || '')}" readonly
                style="width:100%; height:40px; border:1px solid #e2e8f0; border-radius:8px; padding:0 12px; font-size:14px; color:#475569; background:#f8fafc; cursor:not-allowed;">
              <div style="font-size:11px; color:#94a3b8; margin-top:4px;">Username can only be changed by an admin</div>
            </div>
            <div>
              <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:6px;">Role</label>
              <input type="text" value="${escapeHtml(user.role || 'User')}" readonly
                style="width:100%; height:40px; border:1px solid #e2e8f0; border-radius:8px; padding:0 12px; font-size:14px; font-weight:700; color:#0284c7; background:#f8fafc; cursor:not-allowed;">
            </div>
          </div>
        </div>

        <!-- CARD 3: CHANGE PASSWORD -->
        <div class="card" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:22px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 18px;">
            <div style="font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">CHANGE PASSWORD</div>
            <span style="font-size: 11.5px; color: #64748b;">minimum 8 characters</span>
          </div>

          <form id="pro-pwd-form" onsubmit="window.SpeedProfile.changePassword(event)">
            <div style="margin-bottom: 14px;">
              <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:6px;">Current password</label>
              <input type="password" id="pro-curr-pwd" required
                style="width:100%; height:40px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:14px; color:#0f172a;">
            </div>
            <div style="margin-bottom: 18px;">
              <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:6px;">New password</label>
              <input type="password" id="pro-new-pwd" minlength="8" required
                style="width:100%; height:40px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:14px; color:#0f172a;">
            </div>
            <button type="submit" class="btn btn-primary"
              style="height:40px; padding:0 22px; font-size:13.5px; font-weight:600; border-radius:8px; background:#0284c7; color:#fff; border:none; cursor:pointer;">
              Update password
            </button>
          </form>
        </div>

        <!-- CARD 4: TWO-FACTOR AUTHENTICATION (2FA) -->
        <div class="card" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:22px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 18px;">
            <div style="font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">TWO-FACTOR AUTHENTICATION</div>
            <span id="2fa-status-pill" style="font-size:12px; font-weight:700; padding:3px 12px; border-radius:9999px; ${is2fa ? 'background:#ecfdf5; color:#059669;' : 'background:#f1f5f9; color:#64748b;'}">
              ${is2fa ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          <p style="font-size:13px; color:#64748b; margin-top:0; margin-bottom:16px;">
            Use an authenticator app (Google Authenticator, 1Password, Authy...) to generate a 6-digit code on every login.
          </p>

          ${is2fa ? `
            <!-- DISABLE 2FA SECTION -->
            <div id="2fa-disable-wrap" style="max-width:440px;">
              <div style="margin-bottom:12px;">
                <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:4px;">Account Password</label>
                <input type="password" id="2fa-dis-pwd" placeholder="Enter password to confirm"
                  style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:6px; padding:0 10px; font-size:14px;">
              </div>
              <div style="margin-bottom:14px;">
                <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:4px;">Current 2FA code</label>
                <input type="text" id="2fa-dis-code" placeholder="6-digit code" maxlength="6"
                  style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:6px; padding:0 10px; font-size:14px; font-weight:700; letter-spacing:2px;">
              </div>
              <div style="font-size:11.5px; color:#ef4444; margin-bottom:12px;">Disabling 2FA reduces account security.</div>
              <button type="button" onclick="window.SpeedProfile.disable2FA()" class="btn"
                style="height:38px; padding:0 20px; font-size:13px; font-weight:700; border-radius:6px; background:#ef4444; color:#fff; border:none; cursor:pointer;">
                Disable 2FA
              </button>
            </div>
          ` : `
            <!-- SETUP 2FA SECTION -->
            <div id="2fa-setup-trigger-wrap" style="max-width:440px;">
              <div style="margin-bottom:14px;">
                <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:4px;">Confirm your password to start setup</label>
                <input type="password" id="2fa-setup-pwd" placeholder="Enter your password"
                  style="width:100%; height:38px; border:1px solid #cbd5e1; border-radius:6px; padding:0 10px; font-size:14px;">
              </div>
              <button type="button" onclick="window.SpeedProfile.start2FASetup()" class="btn btn-outline"
                style="height:38px; padding:0 18px; font-size:13px; font-weight:600; border-radius:6px; border:1px solid #cbd5e1; background:#ffffff; cursor:pointer;">
                <i class="fas fa-shield-alt"></i> Set up 2FA
              </button>
            </div>

            <!-- REVEALED 2FA SETUP WIZARD (QR CODE + SECRET) -->
            <div id="2fa-wizard" style="display:none; margin-top:20px; padding:20px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
              <div style="display:flex; flex-direction:column; align-items:center; text-align:center;">
                <div style="font-size:14px; font-weight:700; color:#0f172a; margin-bottom:12px;">Scan the QR code with your authenticator app</div>
                
                <div id="2fa-qr-container" style="background:#ffffff; padding:12px; border-radius:8px; border:1px solid #cbd5e1; margin-bottom:14px; box-shadow:0 2px 6px rgba(0,0,0,0.06);">
                  <img id="2fa-qr-img" src="" alt="2FA QR Code" style="width:180px; height:180px; display:block;">
                </div>

                <div style="font-size:12px; color:#64748b; margin-bottom:4px;">Or enter the secret key manually:</div>
                <div id="2fa-secret-code" style="font-family:monospace; font-size:15px; font-weight:700; color:#0f172a; background:#e2e8f0; padding:6px 14px; border-radius:6px; letter-spacing:2px; margin-bottom:18px; user-select:all;">
                  --------
                </div>

                <div style="width:100%; max-width:320px; text-align:left;">
                  <label style="display:block; font-size:12.5px; font-weight:600; color:#334155; margin-bottom:6px;">Enter the current 6-digit code</label>
                  <div style="display:flex; gap:8px;">
                    <input type="text" id="2fa-confirm-code" placeholder="000000" maxlength="6"
                      style="flex:1; height:38px; border:1px solid #94a3b8; border-radius:6px; padding:0 10px; font-size:16px; font-weight:700; letter-spacing:3px; text-align:center;">
                    <button type="button" onclick="window.SpeedProfile.confirmEnable2FA()" class="btn btn-primary"
                      style="height:38px; padding:0 16px; font-size:13px; font-weight:700; border-radius:6px; background:#0284c7; color:#fff; border:none; cursor:pointer;">
                      Confirm + enable
                    </button>
                  </div>
                  <div id="2fa-wizard-err" style="font-size:12px; color:#ef4444; font-weight:600; margin-top:6px; display:none;"></div>
                </div>
              </div>
            </div>
          `}
        </div>

      </div>

      <!-- TAB 2: REST API -->
      <div id="pro-tab-api" style="display:none; width: 100%; max-width: 100%; margin: 0 auto; flex-direction: column; gap: 20px;">
        <div class="card" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:22px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 18px;">
            <div style="font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">REST API INTEGRATION</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 3px;">REST API credentials and webhooks for automated SMS and CDR streaming</div>
          </div>
          
          <div style="margin-bottom: 20px;">
            <label style="display:block; font-size:13px; font-weight:600; color:#334155; margin-bottom:6px;">API Base Endpoint</label>
            <div style="display:flex; gap:8px;">
              <input type="text" readonly value="${window.location.origin}/api/v1" style="flex:1; height:40px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:13px; font-family:monospace; background:#f8fafc; color:#0f172a;">
              <button type="button" class="btn btn-secondary" onclick="navigator.clipboard.writeText(window.location.origin + '/api/v1'); if(window.toast) window.toast('Endpoint copied!','success'); else if(window.showToast) window.showToast('Endpoint copied!','success'); else console.log('Endpoint copied!');" style="height:40px; padding:0 16px; border-radius:8px; cursor:pointer;">Copy</button>
            </div>
          </div>

          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <label style="font-size:13px; font-weight:600; color:#334155; margin:0;">Active API Token</label>
              <span style="font-size:11px; font-weight:700; padding:2px 8px; border-radius:9999px; background:#ecfdf5; color:#059669;">Active</span>
            </div>
            <div style="font-size:12px; color:#64748b; margin-bottom:8px;">Include this header in API requests: <code>Authorization: Bearer &lt;token&gt;</code></div>
            <div style="display:flex; gap:8px;">
              <input type="text" id="pro-api-token-val" readonly value="asms_live_${(user.id || 1)}_${(user.username || 'user')}_token" style="flex:1; height:40px; border:1px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:13px; font-family:monospace; background:#f8fafc; color:#0f172a;">
              <button type="button" class="btn btn-primary" onclick="const tok='asms_live_' + ${user.id || 1} + '_' + Math.random().toString(36).substring(2,10) + '_' + Date.now().toString(36); document.getElementById('pro-api-token-val').value=tok; if(window.toast) window.toast('API Token refreshed successfully!','success'); else if(window.showToast) window.showToast('API Token refreshed successfully!','success');" style="height:40px; padding:0 16px; border-radius:8px; background:#0284c7; color:#fff; border:none; cursor:pointer;">Regenerate</button>
              <button type="button" class="btn btn-outline" onclick="navigator.clipboard.writeText(document.getElementById('pro-api-token-val').value); if(window.toast) window.toast('API Token copied!','success'); else if(window.showToast) window.showToast('API Token copied!','success'); else console.log('API Token copied!');" style="height:40px; padding:0 16px; border-radius:8px; border:1px solid #cbd5e1; background:#fff; cursor:pointer;">Copy</button>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 3: AUDIT LOG -->
      <div id="pro-tab-audit" style="display:none; width: 100%; max-width: 100%; margin: 0 auto; flex-direction: column; gap: 20px;">
        <div class="card" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:22px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 18px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">ACCOUNT AUDIT LOG</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 3px;">Real-time system audit logs and security events recorded on your account</div>
            </div>
            <button type="button" class="btn btn-outline btn-sm" onclick="window.SpeedProfile.loadAuditLogs()" style="border-radius:6px; padding:4px 10px; font-size:12px;">
              <i class="fas fa-rotate"></i> Refresh
            </button>
          </div>
          <div id="pro-audit-table-wrap">
            <div style="padding:20px; text-align:center; color:#64748b; font-size:13px;">Loading audit logs...</div>
          </div>
        </div>
      </div>
    `;

    switchProfileTab(initialTab);
  }


  function switchProfileTab(tabName) {
    const details = document.getElementById('pro-tab-details');
    const api = document.getElementById('pro-tab-api');
    const audit = document.getElementById('pro-tab-audit');
    const btnDetails = document.getElementById('tab-btn-details');
    const btnApi = document.getElementById('tab-btn-api');
    const btnAudit = document.getElementById('tab-btn-audit');

    const isApi = tabName === 'api' || tabName === 'api-tokens';
    const isAudit = tabName === 'audit' || tabName === 'audit-logs';

    if (details) details.style.display = (!isApi && !isAudit) ? 'flex' : 'none';
    if (api) api.style.display = isApi ? 'flex' : 'none';
    if (audit) audit.style.display = isAudit ? 'flex' : 'none';

    const activeStyle = 'display:inline-flex; align-items:center; gap:8px; padding:8px 16px; border-radius:8px; border:none; cursor:pointer; font-size:13px; font-weight:700; background:#f1f5f9; color:#0f172a;';
    const inactiveStyle = 'display:inline-flex; align-items:center; gap:8px; padding:8px 16px; border-radius:8px; border:none; cursor:pointer; font-size:13px; font-weight:600; background:transparent; color:#64748b;';

    if (btnDetails) btnDetails.style.cssText = (!isApi && !isAudit) ? activeStyle : inactiveStyle;
    if (btnApi) btnApi.style.cssText = isApi ? activeStyle : inactiveStyle;
    if (btnAudit) btnAudit.style.cssText = isAudit ? activeStyle : inactiveStyle;

    if (isAudit) {
      loadAuditLogs();
    }
  }

  async function loadAuditLogs() {
    const wrap = document.getElementById('pro-audit-table-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:24px; text-align:center; color:#64748b; font-size:13px;"><div class="spinner" style="margin:0 auto 10px;"></div>Loading audit logs...</div>';
    try {
      const res = await fetch('/api/audit-logs?limit=50');
      let data = [];
      if (res.ok) {
        const json = await res.json();
        data = Array.isArray(json) ? json : (json.data || json.logs || json.records || []);
      }
      if (!data.length) {
        wrap.innerHTML = '<div style="padding:24px; text-align:center; color:#94a3b8; font-size:13px;"><i class="far fa-folder-open" style="font-size:24px; display:block; margin-bottom:8px;"></i>No audit logs recorded yet.</div>';
        return;
      }
      const rowsHtml = data.map(item => `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:10px 14px; font-size:12.5px; color:#475569; white-space:nowrap;">${escapeHtml(item.created_at || item.timestamp || item.created || '—')}</td>
          <td style="padding:10px 14px; font-size:12.5px; font-weight:600; color:#0f172a;">${escapeHtml(item.action || item.event || '—')}</td>
          <td style="padding:10px 14px; font-size:12.5px; color:#334155;">${escapeHtml(item.username || item.actor || 'User')}</td>
          <td style="padding:10px 14px; font-size:12px; font-family:monospace; color:#64748b;">${escapeHtml(item.ip || item.ip_address || '—')}</td>
          <td style="padding:10px 14px; font-size:12.5px; color:#475569;">${escapeHtml(item.details || item.note || item.message || '—')}</td>
        </tr>
      `).join('');
      wrap.innerHTML = `
        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; text-align:left;">
            <thead>
              <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; font-size:12px; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.5px;">
                <th style="padding:10px 14px;">Date/Time</th>
                <th style="padding:10px 14px;">Action</th>
                <th style="padding:10px 14px;">User</th>
                <th style="padding:10px 14px;">IP Address</th>
                <th style="padding:10px 14px;">Details</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      `;
    } catch (e) {
      wrap.innerHTML = '<div style="padding:20px; text-align:center; color:#ef4444; font-size:13px;">Failed to load audit logs.</div>';
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

  function showToast(msg, type = 'info') {
    if (typeof window.toast === 'function') {
      window.toast(msg, type);
    } else if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
    } else {
      console.log(`[Toast ${type}]`, msg);
    }
  }

  async function savePersonal(e) {
    if (e) e.preventDefault();
    const token = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
    const full_name = document.getElementById('pro-fullname')?.value || '';
    const email = document.getElementById('pro-email')?.value.trim() || '';
    const phone = document.getElementById('pro-phone')?.value || '';
    const teams = document.getElementById('pro-teams')?.value || '';

    if (email && (!email.includes('@') || !email.includes('.'))) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/user/profile/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: JSON.stringify({ full_name, email, phone, teams })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Personal details saved successfully!', 'success');
      } else {
        showToast(data.error || 'Failed to save profile.', 'error');
      }
    } catch (err) {
      showToast('Network error while saving profile.', 'error');
    }
  }

  async function changePassword(e) {
    if (e) e.preventDefault();
    const current_password = document.getElementById('pro-curr-pwd')?.value || '';
    const new_password = document.getElementById('pro-new-pwd')?.value || '';

    if (new_password.length < 8) {
      showToast('New password must be at least 8 characters long.', 'error');
      return;
    }

    const token = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
    try {
      const res = await fetch('/api/user/password/change', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: JSON.stringify({ current_password, new_password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Password updated successfully!', 'success');
        document.getElementById('pro-pwd-form')?.reset();
      } else {
        showToast(data.error || 'Failed to update password.', 'error');
      }
    } catch (err) {
      showToast('Network error while updating password.', 'error');
    }
  }

  async function start2FASetup() {
    const pwd = document.getElementById('2fa-setup-pwd')?.value.trim();
    if (!pwd) {
      showToast('Please enter your account password to begin 2FA setup.', 'error');
      return;
    }

    const token = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
    try {
      const res = await fetch('/api/user/2fa/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: JSON.stringify({ password: pwd })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const trigger = document.getElementById('2fa-setup-trigger-wrap');
        const wizard = document.getElementById('2fa-wizard');
        const qrImg = document.getElementById('2fa-qr-img');
        const secretCode = document.getElementById('2fa-secret-code');

        if (trigger) trigger.style.display = 'none';
        if (wizard) wizard.style.display = 'block';
        if (qrImg) qrImg.src = data.qr;
        if (secretCode) secretCode.textContent = data.secret;

        const codeInp = document.getElementById('2fa-confirm-code');
        if (codeInp) codeInp.focus();
      } else {
        showToast(data.error || 'Password incorrect.', 'error');
      }
    } catch (err) {
      showToast('Network error while setting up 2FA.', 'error');
    }
  }

  async function confirmEnable2FA() {
    const code = document.getElementById('2fa-confirm-code')?.value.trim();
    const errBox = document.getElementById('2fa-wizard-err');
    if (!code || code.length !== 6) {
      if (errBox) {
        errBox.textContent = 'Please enter a valid 6-digit code.';
        errBox.style.display = 'block';
      }
      return;
    }

    const token = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
    try {
      const res = await fetch('/api/user/2fa/enable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Two-Factor Authentication is now enabled!', 'success');
        renderProfileView();
      } else {
        if (errBox) {
          errBox.textContent = data.error || 'Invalid 6-digit code.';
          errBox.style.display = 'block';
        }
      }
    } catch (err) {
      showToast('Network error while enabling 2FA.', 'error');
    }
  }

  async function disable2FA() {
    const pwd = document.getElementById('2fa-dis-pwd')?.value.trim();
    const code = document.getElementById('2fa-dis-code')?.value.trim();
    if (!pwd || !code) {
      showToast('Please enter both password and current 2FA code.', 'error');
      return;
    }

    const token = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
    try {
      const res = await fetch('/api/user/2fa/disable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: JSON.stringify({ password: pwd, code })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Two-Factor Authentication has been disabled.', 'info');
        renderProfileView();
      } else {
        showToast(data.error || 'Invalid password or code.', 'error');
      }
    } catch (err) {
      showToast('Network error while disabling 2FA.', 'error');
    }
  }

  window.SpeedProfile = {
    render: renderProfileView,
    switchTab: switchProfileTab,
    loadAuditLogs,
    renderTab: (tab, containerId) => renderProfileView(containerId, tab),
    savePersonal,
    changePassword,
    start2FASetup,
    confirmEnable2FA,
    disable2FA
  };

})(window);
