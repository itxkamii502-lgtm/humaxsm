# Alpha SMS — UI Map & Design System

This document outlines the user interface architecture, shared component standards, CSS classes, and page map across all four role portals.

---

## 1. Universal Design System (`speed-panel.css`)

All pages across Owner, Manager, Agent, and Client portals adhere strictly to a single unified UI design language:

### 1.1 Structural Classes
- `.zy-panel`: Primary container card with rounded borders, crisp white surface, subtle box-shadow, and full width.
- `.zy-panel-head`: Card header with high contrast typography and uppercase styling. Hosts title and action buttons.
- `.zy-panel-body`: Main content area wrapping tables, forms, or metric cards.
- `.zy-intro`: Top intro banner explaining page purpose with neutral text.

### 1.2 Standardized Filter Grid (`.zy-filter-grid`)
Used on all reporting, CDR, and inventory pages:
```html
<div class="zy-filter-grid">
  <div class="zy-filter-grid-fields">
    <div class="zy-filter-field">
      <label class="zy-filter-label" for="id">Label</label>
      <input type="text" id="id" class="zy-filter-input" placeholder="...">
    </div>
    <!-- Additional filter fields -->
  </div>

  <!-- Group By Card -->
  <div class="zy-groupby-card">
    <div class="zy-groupby-title"><i class="fas fa-layer-group"></i> Group By :</div>
    <div class="zy-groupby-chips">
      <label class="zy-chip-pill">
        <input type="checkbox" class="grp-chk" value="hour"> Hour
      </label>
      <!-- Date, Month, Range, Client, Number, CLI chips -->
    </div>
  </div>

  <!-- Filter Action Buttons -->
  <div class="zy-filter-actions">
    <button class="zy-btn-amber" id="btn-export-report"><i class="fas fa-file-export"></i> Export Report</button>
    <button class="zy-btn-blue-solid" id="btn-show-report"><i class="fas fa-chart-column"></i> Show Report</button>
  </div>

  <hr class="zy-filter-divider">

  <!-- Table Toolbar -->
  <div class="zy-table-toolbar">
    <div class="zy-toolbar-left">
      <div class="zy-search-wrap">
        <i class="fas fa-search"></i>
        <input type="text" class="zy-toolbar-search" placeholder="Search...">
      </div>
      <div class="zy-toolbar-select-wrap">
        <label class="zy-toolbar-label">Show Records</label>
        <select class="zy-toolbar-select"><option value="25">25</option>...</select>
      </div>
    </div>
    <div class="zy-toolbar-right">
      <div class="zy-toolbar-pills">
        <button class="zy-btn-pill"><i class="fas fa-copy"></i> Copy</button>
        <button class="zy-btn-pill"><i class="fas fa-file-csv"></i> CSV</button>
        <button class="zy-btn-pill"><i class="fas fa-file-excel"></i> Excel</button>
        <button class="zy-btn-pill"><i class="fas fa-file-pdf"></i> PDF</button>
        <button class="zy-btn-pill"><i class="fas fa-print"></i> Print</button>
        <button class="zy-btn-pill"><i class="fas fa-columns"></i> Columns</button>
      </div>
    </div>
  </div>
</div>
```

### 1.3 Action Buttons Palette
- 🟠 `.zy-btn-amber`: High-visibility amber button (`#f59e0b`) dedicated to **Export Report**.
- 🔵 `.zy-btn-blue-solid`: Primary brand blue button (`#2563eb`) dedicated to **Show Report** and primary submissions.
- ⚪ `.zy-btn-pill`: Minimal pill buttons (`border-radius: 9999px`) for table toolbars (Copy, CSV, Excel, PDF, Print, Columns).
- 🔴 `.zy-act-red`: Warning or destructive actions (Delete, Return to pool, Trash).

---

## 2. Page Inventory by Portal

### 2.1 Owner / Admin Portal (`Alpha SMS/static/index.html` + `app.js`)

| Page Route | Function Handler | Core Features |
|---|---|---|
| `dashboard` | `renderDashboard()` | Revenue, SMS traffic charts, SMPP status, number pool summary |
| `my-numbers` | `renderMyNumbers()` | Phase 1 Core: Single-tier action bar, filter grid, modal allocations |
| `sms-test-panel` | `renderSmsTestPanel()` | Phase 1 Core: Dual stacked panels (Test Numbers + Recent Test Feed) |
| `my-sms` | `renderMySms()` | Phase 1 Core: CDR reports, group-by chips, Export/Show, grand totals |
| `sms-ranges` | `renderSmsRanges()` | Termination ranges, carrier rates, payterms, and CLI lists |
| `test-panel-numbers`| `renderTestPanelNumbers()`| Dedicated CRUD management for test panel numbers |
| `smpp-accounts` | `renderSmppAccounts()` | SMPP client credentials, max_mps rate limits |
| `smpp-sessions` | `renderSmppSessions()` | Real-time live connected SMPP socket connections |
| `users` | `renderUsers()` | Manager account management & role assignments |
| `agents` | `renderAgents()` | View all downline agents across all managers |
| `clients` | `renderClients()` | View all downline clients across all agents |
| `settings` | `renderSettings()` | Global branding: site name, logo, colors, font family |

### 2.2 Manager Portal (`Alpha SMS/static/manager.html` + `speed-pages.js`)

| Page Route | Function Handler | Core Features |
|---|---|---|
| `sms-overview` | `pgSmsRanges()` | View termination ranges and manager payouts |
| `my-numbers` | `pgSmsNumbers()` | Manager pool numbers, allocate to agents, unallocate, return |
| `assign-numbers` | `pgBulkAllocations()` | Bulk allocate numbers to downline agents by quantity & payterm |
| `agents` | `pgAgentsList()` | Manage downline agents, generate API tokens, inspect details |
| `clients` | `pgClientsList()` | View downline clients created by agents |
| `reports` | `pgSmsReports()` | Manager CDR reports with agent rates and manager profits |
| `sms-test-panel` | `pgTestPanel()` | Stacked test numbers and live test SMS feed |
| `payout-requests`| `pgPaymentRequests()` | Payment requests submitted by agents |
| `my-earnings` | `pgCreditNotes()` | Credit notes and payable balances |

### 2.3 Agent Portal (`Alpha SMS/static/agent.html` + `speed-agent-pages.js`)

| Page Route | Function Handler | Core Features |
|---|---|---|
| `dashboard` | `pgDashboard()` | Agent metrics: Total SMS, balance, daily traffic |
| `my-sms-numbers` | `pgMySmsNumbers()` | Agent pool numbers, allocate/move between clients |
| `bulk-add` | `pgBulkAdd()` | Interactive queued bulk allocations with live pool stats |
| `my-clients` | `pgMyClients()` | Create and manage downline client accounts |
| `detailed-sms` | `zyCdrPage(false)` | Detailed CDR records with masked CLI and client margins |
| `summary-sms` | `zyCdrPage(true)` | Grouped CDR summary metrics |
| `sms-test-panel` | `pgSmsTestPanel()` | Agent view of test numbers and incoming test traffic |
| `payment-requests`| `pgPaymentRequests()`| Request payouts from manager |

### 2.4 Client Portal (`Alpha SMS/static/client.html` + `speed-client-pages.js`)

| Page Route | Core Features |
|---|---|
| `dashboard` | Client SMS traffic metrics and delivered OTP count |
| `my-numbers` | List of numbers assigned to this client |
| `live-feed` | Real-time live incoming OTP feed for client's assigned numbers |
| `reports` | Historical traffic reports and client payout earnings |
