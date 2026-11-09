# HUMEX SMS — Architecture Rebranding & Rename Map

**Official Product Name:** HUMEX SMS  
**Official Slug:** `humex-sms` (underscore form: `humex_sms`)  
**PM2 Process Name:** `humex-sms`  
**Execution Date:** 2026-11-09  

---

## 1. Directory Structure

| Original Path | Renamed Path | Rationale / Strategy |
| :--- | :--- | :--- |
| `Alpha SMS/` | `humex-sms/` | Removed space and legacy name. Resolved dynamically in `server.js` with fallback: `fs.existsSync(path.join(__dirname, 'humex-sms')) ? 'humex-sms' : 'Alpha SMS'`. |

---

## 2. Brand Images (`humex-sms/static/img/`)

| Original Filename | Renamed Filename | Rationale / Status |
| :--- | :--- | :--- |
| `humax-sms-logo.png` | `humex-sms-logo.png` | Renamed to official brand logo. Legacy path supported via alias middleware. |
| `humex-sms-dp.jpg` | `humex-sms-dp.jpg` | **Untouched** — Already matches official brand slug. |
| `humex-sms-logo.svg` | `humex-sms-logo.svg` | **Untouched** — Embeds `/static/img/humex-sms-logo.png`. |
| `alphasms-circle-logo.svg` | `humex-sms-circle-logo.svg` | Standardized to official slug; embeds `/static/img/humex-sms-logo.png`. |
| `alphasms-icon.svg` | `humex-sms-icon.svg` | Standardized to official slug; embeds `/static/img/humex-sms-logo.png`. |
| `alphasms-logo.svg` | *(Removed / Merged)* | Byte-for-byte duplicate of `humex-sms-logo.svg`. Served via alias middleware. |
| `custom-logo.png` | `custom-logo.png` | **Untouched** — Dynamic upload target for user-defined logos. |
| `custom-logo.svg` | `custom-logo.svg` | **Untouched** — Dynamic SVG wrapper for custom logos. |

---

## 3. Stylesheets (`humex-sms/static/css/`)

| Original Filename | Renamed Filename | Rationale / Notes |
| :--- | :--- | :--- |
| `speed-panel.css` | `humex-panel.css` | Core panel stylesheet. Internal classes (`.zy-*`, `.sp-*`, `.apx-*`) preserved. |
| `speed-admin-skin.css` | `humex-admin-skin.css` | Owner/admin specific overrides and table skins. |
| `apx-telecom.css` | `humex-telecom.css` | Telecom sub-stylesheet. Updated `@import "./humex-telecom.css";` in `humex-panel.css`. |
| `style.css` | `humex-global.css` | Base stylesheet. Renamed to eliminate generic collision. |
| `cropper.min.css` | `cropper.min.css` | **Untouched** — Third-party library. |

---

## 4. JavaScript Modules (`humex-sms/static/js/`)

| Original Filename | Renamed Filename | Role / Purpose |
| :--- | :--- | :--- |
| `app.js` | `owner-engine.js` | Owner panel data tables, management logic & state |
| `speed-admin.js` | `owner-shell.js` | Owner UI shell, menus, and topbar cards |
| `new_features.js` | `owner-features.js` | Owner auxiliary features and rate card tools |
| `manager.js` | `manager-engine.js` | Manager core business, users & routing logic |
| `speed-panel.js` | `manager-shell.js` | Manager UI shell & navigation |
| `speed-pages.js` | `manager-pages.js` | Manager page renderers & CDR tables |
| `manager_features.js` | `manager-features.js` | Manager extensions |
| `agent.js` | `agent-engine.js` | Agent core business & routing logic |
| `speed-agent.js` | `agent-shell.js` | Agent UI shell & navigation |
| `speed-agent-pages.js` | `agent-pages.js` | Agent page renderers & CDR tables |
| `agent_features.js` | `agent-features.js` | Agent extensions |
| `client.js` | `client-engine.js` | Client core logic & stats |
| `speed-client.js` | `client-shell.js` | Client UI shell & navigation |
| `speed-client-pages.js` | `client-pages.js` | Client page renderers & CDR tables |
| `speed-test.js` | `testpanel-shell.js` | Test panel UI shell & navigation |
| `speed-test-pages.js` | `testpanel-pages.js` | Test panel page renderers |
| `speed-kit.js` | `shared-ui-kit.js` | Shared UI components, payterms, badges, filters |
| `brand-theme.js` | `shared-brand-theme.js` | Universal theme, font, and animated header engine |
| `speed-auth-guard.js` | `shared-auth-guard.js` | Client-side role enforcement & tab watcher |
| `speed-profile-security.js` | `shared-profile-security.js` | Profile modal, 2FA, API token manager |
| `speed-url.js` | `shared-url-router.js` | Hash router & tab state manager |
| `speed-flash.js` | `shared-flash.js` | Toast alerts & notification banners |
| `speed-loginpanel.js` | `shared-login-modal.js` | Multi-panel quick-switch login modal |
| `apx-grid.js` | `shared-grid.js` | Data table column layout & sorting utility |
| `testpanel.js` | `testpanel.js` | **Untouched** — Dead in browser, kept for test runner assertions. |
| `cropper.min.js` | `cropper.min.js` | **Untouched** — Third-party library. |

---

## 5. Active Rebranding Compatibility Aliases

The following mapping is registered in `server.js` before `app.use('/static', express.static(...))` to guarantee zero downtime and 100% backward compatibility for cached browsers and live database settings:

```javascript
const ASSET_RENAME_MAP = {
  // Brand Images
  'humax-sms-logo.png': 'humex-sms-logo.png',
  'alphasms-logo.svg': 'humex-sms-logo.svg',
  'alphasms-circle-logo.svg': 'humex-sms-circle-logo.svg',
  'alphasms-icon.svg': 'humex-sms-icon.svg',
  // Stylesheets
  'speed-panel.css': 'humex-panel.css',
  'speed-admin-skin.css': 'humex-admin-skin.css',
  'apx-telecom.css': 'humex-telecom.css',
  'style.css': 'humex-global.css',
  // JavaScript - Owner
  'app.js': 'owner-engine.js',
  'speed-admin.js': 'owner-shell.js',
  'new_features.js': 'owner-features.js',
  // JavaScript - Manager
  'manager.js': 'manager-engine.js',
  'speed-panel.js': 'manager-shell.js',
  'speed-pages.js': 'manager-pages.js',
  'manager_features.js': 'manager-features.js',
  // JavaScript - Agent
  'agent.js': 'agent-engine.js',
  'speed-agent.js': 'agent-shell.js',
  'speed-agent-pages.js': 'agent-pages.js',
  'agent_features.js': 'agent-features.js',
  // JavaScript - Client
  'client.js': 'client-engine.js',
  'speed-client.js': 'client-shell.js',
  'speed-client-pages.js': 'client-pages.js',
  // JavaScript - Test Panel
  'speed-test.js': 'testpanel-shell.js',
  'speed-test-pages.js': 'testpanel-pages.js',
  // JavaScript - Shared
  'speed-kit.js': 'shared-ui-kit.js',
  'brand-theme.js': 'shared-brand-theme.js',
  'speed-auth-guard.js': 'shared-auth-guard.js',
  'speed-profile-security.js': 'shared-profile-security.js',
  'speed-url.js': 'shared-url-router.js',
  'speed-flash.js': 'shared-flash.js',
  'speed-loginpanel.js': 'shared-login-modal.js',
  'apx-grid.js': 'shared-grid.js'
};
```

---

## 6. Items Intentionally Preserved & Untouched

1. **All `.html` Filenames:** `index.html`, `dashboard.html`, `manager.html`, `agent.html`, `client.html`, `testpanel.html`, `login.html`. Required by `DIRECT_HTML_ROLES`, role-gating middleware, and static page routers in `server.js`.
2. **`testpanel.js`:** Preserved for automated unit and contract tests (`tests/ui-wiring.js`).
3. **Live Data Directory (`humex-sms/data/*`):** Never touched by code edits. Checksum verified bit-for-bit against pre-rename backup.
4. **Third-Party Libraries:** `cropper.min.js`, `cropper.min.css`, `chart.js`, FontAwesome.
5. **Internal Code Tokens:** CSS classes (`.zy-*`, `.sp-*`, `.apx-*`), JS functions (`zy*`, `pg*`), API routes (`/api/*`), SMPP routes, and database schemas remain unchanged.
6. **Server Brand Replacement Regex:** `server.js:2404` (`WARRIOR SMS|...|HUMAX SMS|HUMEX SMS`) retained with all legacy brand variants so that old records in live databases are transparently replaced on first-paint.
