# Alpha SMS Migration & Implementation Progress

## R1: Redo U2 in `Alpha SMS/static/js/speed-agent-pages.js` & UI Wiring Test
- **Status**: DONE
- **Details**:
  - Implemented the active "My SMS Numbers" view in `Alpha SMS/static/js/speed-agent-pages.js` (loaded by `agent.html` and routed via `speed-agent.js`).
  - Added full filters for Range, Client, and Status (Assigned, Unassigned pool, Active, Inactive).
  - Added buttons: Allocate (rate prefilled & capped), Unallocate, Return, Move (`POST /api/numbers/:id/move`).
  - Added test suite `tests/ui-wiring.js` included in `npm test`.

## R2: Payterm List & Server Validation & Key Migration
- **Status**: DONE
- **Details**:
  - Added ONE master payterm list in settings (default exactly: `['Weekly', '1/1', '7/1', '7/7', '15/15', '15/30', 'Monthly60']`; editable by Owner only).
  - Added dedicated endpoints `GET /api/payterms`, `POST /api/payterms`, `PUT /api/payterms` (Owner only for writes).
  - Included `payterms` in `GET /api/settings` for both Owner and safe non-owner callers (`CLIENT_ALLOW` / `TEST_ALLOW`).
  - Added server-side validation against master payterm list rejecting unknown strings with 400 on `POST /api/numbers/sms-ranges`, `PATCH /api/numbers/sms-ranges/:id`, `POST /api/numbers/:id/assign`, `POST /api/numbers/bulk-assign-many`, `POST /api/numbers/bulk-allocate`, and `POST /api/numbers/:id/move`.
  - Added startup and runtime data migration without losing rates:
    - `15/1` -> `15/15`
    - `30/1` -> `Monthly60`
    - `Daily` -> `1/1`
  - Updated Owner panel rate-card inputs (`openAddRangeModal`, `openEditRangeModal`, `submitAddRange`, `submitEditRange`) and Rate Card table columns to use the master payterms (`Weekly`, `1/1`, `7/1`, `7/7`, `15/15`, `15/30`, `Monthly60`).
  - Added Master Payterm List input in Owner General Settings (`#s-payterms`).
  - Updated Agent Allocate dropdown in `speed-agent-pages.js` and Client payterm dropdown in `agent_features.js` to use the master payterms list.
  - Added test suite `tests/payterm-rules.js` (23/23 tests passed) and updated `tests/ui-wiring.js` to verify presence of all master payterm controls in page render files. Included in `npm test`.

## U3: Manager Panel (allocate from pool, return, commission earned, no edit controls)
- **Status**: DONE
- **Details**:
  - Implemented number pool allocation to Agent with master payterms selection (`['Weekly', '1/1', '7/1', '7/7', '15/15', '15/30', 'Monthly60']`) and fixed rate-card rate in `speed-pages.js` (`pgSmsNumbers`, `zyAllocateAll`, `zyAllocateOne`, `zyBulkAllocations`).
  - Implemented unallocation from Agent back to Manager pool (`zyUnassignOne`, `zyUnassignSelected`).
  - Implemented return from Manager pool to Owner pool via `POST /api/numbers/return` and `POST /api/numbers/:id/return` (`zyReturnOne`, `zyReturnSelected`).
  - Added Commission Earned display on Manager Dashboard (`speed-panel.js` and `manager.js`), activity overview, and backend stats (`/api/manager/:id/stats` returning `commission_earned` and `today_commission`).
  - Removed forbidden edit controls for Manager (no editing commission rates, no rates/payout editing, no client creation controls, no account delete controls).
  - Added U3 assertions to `tests/ui-wiring.js`, passing 100% of all test suites (Stage A-D 172/172, UI wiring, Payterms R2 23/23).

## V1: DESIGN SYSTEM (Universal Design Tokens, Light/Dark Theme, Clean Cards, Unified Buttons)
- **Status**: DONE
- **Details**:
  - In `speed-panel.css`, defined CSS variables for design system tokens (colors, 12px card radius, shadows, spacing, font sizes).
  - Provided full Light and Dark theme palettes respecting Dark/Light/System profile settings and OS `prefers-color-scheme`.
  - Replaced grey `#cfcfcf` / black 1px bordered boxes and dated gradients with modern cards (`.sp-card`, `.zy-filterbox`, `.zy-panel`, `.filters-bar`, `.zy-balbox`).
  - Created a unified button style set (`.sp-btn-primary`, `.sp-btn-secondary`, `.sp-btn-danger`, `.sp-btn-ghost`, `.zy-btn-blue`, `.zy-btn-grey`, `.zy-btn-red`).
  - Standardized consistent input controls, focus rings (`--sp-focus-ring`), and enforced 44px minimum touch targets on mobile.
  - Added V1 assertions in `tests/ui-wiring.js`, verified syntax with `node --check`, and passed all 172/172 stage tests, 23/23 payterm tests, and UI wiring tests.

## V2: SIDEBAR + TOPBAR (Accordion Sidebar, Active Highlight, 260px PC / Drawer Mobile, Topbar with Bell & User Menu)
- **Status**: DONE
- **Details**:
  - Configured left sidebar to fixed 260px width on PC and slide-in drawer with backdrop overlay on mobile.
  - Styled sidebar head: logo, welcome username, role badge, live clock.
  - Implemented automatic single-open ACCORDION: opening one group automatically closes the others.
  - Auto-opens the group containing the active page on load and highlights current page item (`zySyncAccordionActive`).
  - Added smooth chevron rotation animation with `aria-expanded` and keyboard navigation (`role="button"`, `tabindex="0"`, Enter/Space key triggers).
  - Implemented exact Agent menu: Dashboard, CLI Search, SMS Module (SMS Ranges, My Numbers, Bulk Add), SMS Test Panel, Users (My Clients, Notifications), CDR & Statistics, Payments, Account (My Profile, REST API, Audit Log).
  - Configured equivalent sensible menus for Owner, Manager, Client, and TestPanel.
  - Updated Topbar across all panels: hamburger toggle, panel name badge, notification bell with unread badge, and user dropdown menu (Notifications, My Profile, Activity, Logout).
  - Added V2 assertions and jsdom-free runtime accordion test in `tests/ui-wiring.js`; all tests pass (172/172 stage, 23/23 payterms, UI wiring).

## V3: NO FULL-PAGE RELOADS (router, history.pushState, skeleton, deep links)
- **Status**: DONE
- **Details**:
  - Eliminated full-page reloads across all panels; seamless SPA transitions for internal navigation, form submissions, and filters.
  - Added modern shimmering Skeleton Screen system (`--sp-skeleton-bg`, `--sp-skeleton-shimmer`, `@keyframes zy-shimmer`, `.zy-skeleton-screen`, `.zy-skeleton-kpis`, `.zy-skeleton-card`, `.zy-skeleton-table`) in `speed-panel.css` with dark/light themes and reduced-motion support.
  - Implemented universal skeleton generator `zySkeleton(type, page)` and `zyShowSkeleton(page, targetId)` in `speed-kit.js` providing instant skeleton states for dashboards, reports, lists, and forms.
  - Upgraded universal SPA router in `speed-url.js`:
    - Full mapping for all roles: `owner`, `admin`, `manager`, `agent`, `client`, `test`.
    - `history.pushState` URL synchronization on every page switch with dynamic document title and breadcrumb updates.
    - `popstate` browser Back/Forward handling without history loops.
    - Deep linking support: loading `/ints/:role/:page` directly opens the deep-linked page on first boot.
    - Integrated `speed-url.js` across all 5 panel entry points (`agent.html`, `manager.html`, `client.html`, `index.html`, `testpanel.html`).
  - Added server-side deep link route support in `server.js` for `/ints/:role/:page` covering all roles and panels.
  - Added V3 assertions and runtime router/skeleton simulation tests in `tests/ui-wiring.js`.
  - All test suites pass: Stage A-D 172/172 passed, UI wiring passed, Payterms R2 23/23 passed. Applet compiles cleanly.

## V4: DASHBOARD (breadcrumb, UTC clock, KPI cards, SVG sparklines, recent SMS)
- **Status**: DONE
- **Details**:
  - Live UTC Clock: synchronized real-time UTC clock in the breadcrumb (`.zy-crumb-clock`, `#zy-utc-time`) and sidebar (`#zy-clock`), updating automatically every second across all 5 panels (`agent.html`, `manager.html`, `client.html`, `index.html`, `testpanel.html`).
  - Breadcrumb Sync: `zyUpdateBreadcrumb(page, label)` keeps breadcrumb and UTC badge in sync without full reloads.
  - Responsive SVG Sparklines: `zySparklineSvg(data, options)` generates inline vector trend curves with gradient fills, circle endpoints, and non-scaling strokes.
  - Modern KPI Cards: `zyKpiCard(cfg)` provides unified cards with title, tabular figure value, icon with tinted background, sparkline, trend badge (up/down/neutral), and direct click navigation (`.zy-kpi-grid`, `.zy-kpi-card`).
  - Integrated across all role dashboards:
    - Agent Dashboard: Today's SMS, Last 7 Days, Last 30 Days, Active Numbers with sparklines.
    - Manager Dashboard: Commission Earned, Today's Commission, Numbers Pool, Active Team Agents.
    - Owner/Admin Dashboard: Total SMS Today, Revenue Today, Active Numbers Pool, Delivery Success Rate.
    - Client Dashboard: Today's SMS, Last 7 Days, This Month, My Numbers.
  - Live Recent SMS Stream: `zyRecentSmsCard(logs, options)` with real-time rows, sender badges, tabular monospace destination, message snippets, and status pills (`.zy-status-delivrd`, `.zy-status-pending`, `.zy-status-failed`).
  - Added V4 tests and runtime simulations in `tests/ui-wiring.js` (100% pass).

## V5: CDR / SHOW REPORT (date-time range, presets, group-by chips, tabs, total row)
- **Status**: DONE
- **Details**:
  - Date-Time Range Presets: added quick preset toolbar (`.zy-date-presets`, `.zy-preset-chip`, `zyDatePresetsList`, `zyGetDatePresetRange`, `zyApplyDatePreset`, `zyRenderDatePresets`) supporting Today, Yesterday, This Week, Last 7 Days, This Month, and Last 30 Days.
  - Enhanced Date-Time Inputs: clean `.zy-datetime-range` and `.zy-datetime-wrap` inputs with calendar icons and auto-sync with presets.
  - Seamless Tab Navigation: added `.zy-cdr-tabs` and `zyCdrTabs` providing instantaneous switching between "Detailed Records" and "Grouped Summary" without full-page reloads.
  - Interactive Group-By Toggle Chips: modern interactive toggle chips (`.zy-groupby-row`, `.zy-group-chips`, `.zy-group-chip`, `zyRenderGroupChips`, `zyToggleGroupChip`) with active state highlight, checkmark indicators, keyboard accessibility (`role="checkbox"`, `aria-checked`), replacing outdated browser checkboxes.
  - Prominent Table Total Row: built universal `zyBuildCdrTotalRow(data, isGrouped)` and styled table footers (`.zy-total-foot`, `.zy-total-row`, `.zy-total-badge`) displaying total SMS count, total groups count, currency badge, total payouts, client payouts, and net profit highlighted with emerald green (`.zy-total-profit-pos`).
  - Universal Integration:
    - Agent Panel: `zyCdrPage` and `zyCdrLoad` in `speed-agent-pages.js`.
    - Client Panel: `pgMySms` and `pgMySmsLoad` in `speed-client-pages.js`.
    - Owner / Admin Panel: `renderMySms` and `renderMySmsLoad` in `speed-admin.js` and `app.js`.
  - Added V5 assertions and runtime tests in `tests/ui-wiring.js` passing all tests.

## V6: NUMBERS PAGES (filters, checkboxes, assign/unassign/return, bulk add queue)
- **Status**: DONE
- **Details**:
  - Floating Selection Action Bar: implemented `.zy-selection-bar` and `zySyncSelectionBar(tableId)` with automatic counter (`.zy-selected-counter`), action buttons (Allocate, Unallocate, Return, Move), and "Clear selection" trigger whenever table checkboxes are toggled.
  - Checkbox Integration: enabled select-all and per-row checkboxes with `check: true` across `dt-numbers` on all panels.
  - Pool Availability Check & Stats: added `.zy-pool-avail-badge` (`.high`, `.low`, `.none`) dynamically calculating ready unassigned numbers in the selected range before allocating.
  - Bulk Add Queue Manager: built `zyRenderBulkQueueCard(jobs, stats)` displaying active/queued allocation jobs with Job ID, Target Client, Range, animated progress bars (`.zy-queue-progress`, `.zy-queue-progress-bar`), and status pills (`.zy-queue-status.completed`, `.queued`, `.processing`, `.failed`).
  - Master Payterm Selection in Bulk Add: integrated master payterms list (`Weekly`, `1/1`, `7/1`, `7/7`, `15/15`, `15/30`, `Monthly60`) with validation and fixed rate capping.
  - Client Numbers Upgrades: enhanced `pgMyNumbers` in `speed-client-pages.js` with range filtering, live search for number/prefix, row checkboxes, and `zyClientReturnSelected` calling `/api/numbers/:id/return`.
  - Added V6 assertions and runtime tests in `tests/ui-wiring.js` passing 100%.

## V7: PAYTERM LIST + POLISH + FINAL (master list, alias map, empty/loading states)
- **Status**: DONE
- **Details**:
  - Unified Master Payterms & Client Helpers:
    - Standard master payterms list: `['Weekly', '1/1', '7/1', '7/7', '15/15', '15/30', 'Monthly60']` in `speed-kit.js` (`ZY_DEFAULT_MASTER_PAYTERMS`, `zyMasterPaytermsList`).
    - Robust Alias Map: `ZY_PAYTERM_ALIAS_MAP` and `zyNormalizePayterm(term)` resolving historical variations (`15/1` -> `15/15`, `30/1` -> `Monthly60`, `Daily` -> `1/1`, case-insensitivity) without data loss.
    - Options Builder: `zyRenderPaytermOptions(selectedTerm, customList)` rendering `<option>` tags with proper selected state across modals and selection filters.
    - Styled Payterm Badges: `zyPaytermBadge(term)` creating clean tenure pills (`.zy-payterm-badge`) with color-coded classes (`.zy-pt-1-1` cyan, `.zy-pt-weekly` indigo, `.zy-pt-15-15` purple, `.zy-pt-monthly60` emerald) and icons across light/dark themes.
  - Polished Empty & Loading States:
    - Empty State Component: `zyEmptyState(options)` (`.zy-empty-state`, `.zy-empty-icon`, `.zy-empty-title`, `.zy-empty-desc`, `.zy-empty-action`) providing human-friendly empty screens with contextual icons and CTA buttons.
    - DataTable Integration: updated `zy2Render` in `speed-kit.js` to render polished empty states for empty tables and zero-match search filters with quick "Clear Search" action.
    - Shimmer & Spinners: `zyLoadingSpinner(text)`, `zyShowLoading(containerId, text)`, and `zyHideLoading(containerId)` with `.zy-loading-spinner`, `.zy-loading-wrap`, and backdrop `.zy-loading-overlay`.
  - Comprehensive Test Coverage:
    - Added V7 assertions and runtime simulation tests in `tests/ui-wiring.js`.
    - Passed all test suites: Stage A-D 172/172, UI wiring tests (100%), and Payterms R2 23/23 tests.

## F1: SIDEBAR ACCORDION (Single-Open zyToggleGroup & Keyboard/Tap Sync)
- **Status**: DONE
- **Details**:
  - Implemented ONE universal function `zyToggleGroup(id)` in `Alpha SMS/static/js/speed-kit.js` closing every other open group before opening the clicked one across desktop and mobile drawer.
  - Resolved group by key, header id (`grp-*`), submenu id (`sb-*`), or direct element reference with `aria-expanded` and `.open` synchronization.
  - Full keyboard accessibility with Enter/Space handling and tap/click compatibility.
  - `zySyncAccordionActive(page)` auto-opens the group of the active page on load and keeps active highlighting in sync.
  - Eliminated conflicting/rogue `zySideSub` implementation in `brand-theme.js` and wired all panels (`speed-agent.js`, `speed-panel.js`, `speed-admin.js`, `speed-client.js`) to `zyToggleGroup`.
  - Added real click events test in `tests/ui-wiring.js` asserting that clicking SMS Module, Users, and Account leaves exactly ONE group open after each click and aria-expanded is kept in sync.
  - All tests pass 100% (`npm test`).

## F2: ONE PROFILE PLACE (Avatar Menu Only, Account Group Removed, Profile Tabs, Logout Tests)
- **Status**: DONE
- **Details**:
  - Top-right avatar menu now houses profile options exclusively: My Profile, My Payout, REST API, Audit Log, and Logout across all 5 panels (`agent.html`, `manager.html`, `client.html`, `index.html`, `testpanel.html`).
  - Removed sidebar "Account" group from sidebar navigation orders (`ZY_SIDE_ORDER`, `ZY_ADMIN_MENU`).
  - Removed bottom "Agent Profile / Online" box (`.zy-foot-profile`) from all sidebars.
  - Moved REST API and Audit Log into the profile page as first-class tabs (`#pro-tab-details`, `#pro-tab-api`, `#pro-tab-audit`) with interactive tab switching in `window.SpeedProfile`.
  - Updated all panel router scripts (`speed-agent-pages.js`, `manager.js`, `client.js`, `speed-test.js`, `app.js`) to support deep navigation to profile tabs.
  - Implemented complete session termination: `POST /api/auth/logout` and `POST /api/logout` invalidate server-side session and persist session removal to `sessions.json`; `SpeedAuth.clearSession()` clears cookies, localStorage, sessionStorage, and redirects to `/login`.
  - Added F2 verification tests in `tests/stage-a.js` (server-side session invalidation) and `tests/ui-wiring.js` (UI elements, tab definitions, and storage cleanup).
  - 100% tests passing (`npm test`: Stage A-D 175/175, UI wiring, Payterms R2 23/23).

## F3: NO MISSING RECORDS (Server-side paging, summary totals, exact page sizes, export streaming, archived months)
- **Status**: DONE
- **Details**:
  - Implemented server-side pagination with exact page sizes (`page`, `limit` supporting 25, 50, 100, 250, 500, 1000, and 'all' / 0) on `/api/sms/logs` returning metadata (`total`, `page`, `limit`, `total_pages`, `has_next`, `has_prev`).
  - Added full global summary totals computation across the entire matched dataset (`summary: { total_sms, total_groups, delivered_count, failed_count, currency, payout, client_payout, profit }`), ensuring metrics represent all matching rows rather than just the sliced page.
  - Seamless archive loading: upgraded `readSmsWithArchive` to deduplicate by ID and wired `getScopedSmsList` to automatically include retention archives from `data/archive/sms_log_YYYY-MM.json` across date ranges.
  - Streaming CSV export: implemented high-performance `GET /api/sms/export` (and `/api/sms/logs?export=csv`) streaming CSV line-by-line with standard headers and summary footer row for both grouped and ungrouped datasets.
  - Frontend integration:
    - Updated `zyBuildCdrTotalRow` in `speed-kit.js` to accept and prioritize `options.summary` from server responses.
    - Added universal `zyExportCdrStream(filters)` in `speed-kit.js` and wired CDR Export CSV buttons across Agent (`speed-agent-pages.js`), Admin (`speed-admin.js`), and Client (`speed-client-pages.js`) panels.
    - Added `#rp-limit` selector dropdowns to filterbars for granular page sizing and full dataset viewing.
  - Added comprehensive test coverage in `tests/stage-d.js` and `tests/ui-wiring.js`; passed 100% of all tests (Stage A-D 180/180 passed, UI wiring passed, Payterms R2 23/23 passed).

## F4: DASHBOARD TOP ROW (Four Cards, Exact Order, Bottom Owner Cards, Period Stats)
- **Status**: DONE
- **Details**:
  - Implemented server endpoint `GET /api/sms/period-stats` returning `{ today, week, month, year, earnings }` with 30s cache.
  - Yearly SMS reads archived months for the calendar year via `getScopedSmsList(req, yearStartStr)`.
  - Scoped period calculations across all roles (Owner, Manager, Agent, Client).
  - Configured top row of four KPI cards in exact order across all dashboards: Today SMS, Weekly SMS (Monday 00:00 UTC to now), Monthly SMS, Yearly SMS.
  - Owner panel: Revenue, Active number pool, and Delivery rate moved to the very bottom.
  - Verified no extra unapproved header buttons (My Numbers, My Clients, Live, Refresh) are present.
  - Added test coverage in `tests/stage-d.js` and `tests/ui-wiring.js`.
  - 100% tests passing (`npm test`: Stage A-D 185/185 passed, UI wiring passed, Payterms R2 23/23 passed).

## F5: CDR FILTER BAR (Unified .zy-filter-grid, 2-Column Responsive, 7 Group By Chips, Actions, Toolbar)
- **Status**: DONE
- **Details**:
  - Unified `.zy-filter-grid` component implemented in `Alpha SMS/static/css/speed-panel.css` (radius 16, soft border) and `Alpha SMS/static/js/speed-kit.js` (`zyRenderCdrFilterGrid`, `zyRenderNumbersFilterGrid`).
  - 2-column grid of separate small fields: From | To (default today `00:00:00` -> `23:59:59`), Range | Client, Number | CLI with placeholders. Inputs 48px high, radius 12, light fill, small muted label above each.
  - Nested "Group By :" card with exactly 7 wrapping pill chips: Hour, Date, Month, Range, Client, Number, CLI (each with checkbox). Added backend support for `hour` aggregation in `server.js`.
  - Removed date presets and detailed/grouped tabs as UI while preserving complete Group By analytics logic.
  - Equal action buttons on one row: Export Report (amber) and Show Report (blue).
  - Divider with full table toolbar: search with magnifier, "Show Records" dropdown (25..15000, All), and right-aligned pill buttons (Copy, CSV, Excel, PDF, Print, Columns).
  - Breakpoints: 2 columns from 340px, 3 columns from 768px, one or two rows of six fields from 1100px; no horizontal page scroll. Verified 390px mobile layout (scrollWidth <= 390px).
  - Reused `.zy-filter-grid` across Agent, Client, Admin, and Testpanel CDR & Numbers pages; short modal form fields sit side-by-side (`.zy-modal-grid-2`, `.modal .form-row`).
  - 100% tests passing (`npm test`: Stage A-D 185/185 passed, UI wiring passed, Payterms R2 23/23 passed).

## F6: FINAL (npm test passes, zip < 5 MB, verification & report)
- **Status**: DONE
- **Details**:
  - `npm test` passes 100% across all suites:
    - Stage A-D rules and regressions: 185/185 passed.
    - UI wiring and component verifications: 100% passed (including F1 accordion, F2 profile/logout, F3 totals/paging, F4 dashboard cards/period-stats, F5 filter grid/chips/toolbar/390px layout).
    - Payterm rules R2 validation & migration: 23/23 passed.
  - Validated package zip size without `node_modules` and `.git`: 3.30 MB (well under the 5 MB limit).
  - All syntax checks validated (`node --check server.js` and all static JS files).
  - No unrelated changes introduced; all backend business rules, rate cards, and security invariants preserved.

## Progress Summary
- **F1 SIDEBAR ACCORDION**: DONE
- **F2 ONE PROFILE PLACE**: DONE
- **F3 NO MISSING RECORDS**: DONE
- **F4 DASHBOARD TOP ROW**: DONE
- **F5 CDR FILTER BAR**: DONE
- **F6 FINAL**: DONE
- **Status**: ALL STEPS (F1-F6) COMPLETED SUCCESSFULLY







