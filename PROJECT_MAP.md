# HUMEX SMS — Project Map

This document maps all core files, directory structures, entry points, and responsibilities across the HUMEX SMS application.

---

## 1. Directory Structure Overview

```
├── server.js                        # Main Express backend, SMPP server & WebSocket server
├── package.json                     # Node.js dependencies, npm scripts (dev, test, lint)
├── metadata.json                    # AI Studio applet metadata & capabilities
├── index.html                       # Entry HTML redirecting to HUMEX SMS portals
├── reset-owner-password.js          # CLI emergency tool to reset owner credentials
│
├── HUMEX SMS/                       # Core portal application
│   ├── AGENT_PANEL.md               # Agent portal specifications
│   ├── HIERARCHY.md                 # Role hierarchy documentation
│   │
│   ├── data/                        # JSON Database Store (atomic writes & crash journals)
│   │   ├── users.json               # Owner (Kamran_Bhatti) and Managers
│   │   ├── agents.json              # Downline Agents
│   │   ├── clients.json             # Downline Clients
│   │   ├── numbers.json             # Phone number inventory and allocations
│   │   ├── sms_ranges.json          # Termination ranges, payterms, payouts, carrier costs
│   │   ├── sms_log.json             # SMS Call Detail Records (CDR)
│   │   ├── sms_log.journal.ndjson   # Crash-safe SMS append log
│   │   ├── test_numbers.json        # Test panel numbers
│   │   ├── test_sms_logs.json       # Live test SMS log feed
│   │   ├── smpp_accounts.json       # Inbound SMPP client credentials & MPS limits
│   │   ├── smpp_logs.json           # SMPP bind/unbind/delivery audit logs
│   │   ├── smpp_sessions.json       # Active SMPP connection records
│   │   ├── api_tokens.json          # Bearer API tokens for programmatic access
│   │   ├── payout_requests.json     # Payout requests between hierarchy tiers
│   │   ├── number_transfers.json    # Allocation/move/return transfer audit logs
│   │   ├── number_requests.json     # Agent-to-manager number requests queue
│   │   ├── rate_card.json           # Ratecard export records
│   │   ├── services.json            # Supported OTP services (WhatsApp, Google, etc.)
│   │   ├── settings.json            # Global branding, site name, logo, theme configs
│   │   ├── permissions.json         # Role permissions matrix
│   │   └── archive/                 # Monthly archived CDR logs (sms_log_YYYY-MM.json)
│   │
│   └── static/                      # Web frontend assets
│       ├── login.html               # Universal authentication gate
│       ├── index.html               # Owner / Administrator dashboard container
│       ├── dashboard.html           # Alternate owner dashboard view
│       ├── manager.html             # Manager portal container
│       ├── agent.html               # Agent portal container
│       ├── client.html              # Client portal container
│       ├── testpanel.html           # Public / client test panel container
│       │
│       ├── css/
│       │   ├── humex-panel.css      # Core universal design system (.zy-panel, .zy-filter-grid)
│       │   ├── humex-admin-skin.css # Admin header gradients and skin overrides
│       │   ├── humex-global.css            # Legacy modal transitions & global resets
│       │   └── cropper.min.css      # Profile image cropping library CSS
│       │
│       ├── js/
│       │   ├── owner-engine.js               # Owner portal controller & page routers
│       │   ├── manager-engine.js           # Manager portal entry & session bootstrap
│       │   ├── manager-pages.js       # Manager portal page views (Ranges, Numbers, Reports, Test)
│       │   ├── agent-engine.js             # Agent portal entry & session bootstrap
│       │   ├── agent-pages.js # Agent portal page views (Numbers, Bulk Add, CDR, Test)
│       │   ├── client-engine.js            # Client portal entry & session bootstrap
│       │   ├── client-pages.js# Client portal page views (Traffic, Reports, Numbers)
│       │   ├── shared-ui-kit.js         # Universal UI kit: zyDT2 table engine, export pills, modals
│       │   ├── shared-brand-theme.js       # Dynamic brand colors, dark/light theme, custom logos
│       │   ├── shared-auth-guard.js  # Client-side session and role authentication validator
│       │   └── testpanel.js         # Standalone test panel logic
│       │
│       └── img/                     # SVGs, icons, and branding badges
│
└── tests/                           # System test suite
    ├── verify-rules.js              # Business logic & number pool invariant verifier
    ├── ui-wiring.js                 # UI endpoint wiring and button integrity test
    ├── payterm-rules.js             # Payout term format & math validator
    └── smpp-selftest.js             # SMPP protocol bind & message ingest test
```

---

## 2. Key File Responsibilities

| File Path | Primary Function | Directly Affected Roles |
|---|---|---|
| `/server.js` | Express API, auth sessions, SMPP server, WebSocket engine, JSON DB handlers | All roles (Owner, Manager, Agent, Client) |
| `/HUMEX SMS/static/js/shared-ui-kit.js` | DataTable engine (`zyDT2`), export buttons, modals, date presets, group chips | All portals (Shared UI foundation) |
| `/HUMEX SMS/static/css/humex-panel.css` | Universal CSS styles (`.zy-panel`, `.zy-filter-grid`, `.zy-table-toolbar`) | All portals |
| `/HUMEX SMS/static/js/owner-engine.js` | Owner portal logic: `renderMyNumbers`, `renderSmsTestPanel`, `renderMySms` | Owner (`Kamran_Bhatti`) |
| `/HUMEX SMS/static/js/manager-pages.js` | Manager portal views: `pgSmsNumbers`, `pgSmsReports`, `pgTestPanel` | Manager |
| `/HUMEX SMS/static/js/agent-pages.js`| Agent portal views: `pgMySmsNumbers`, `zyCdrPage`, `zyTestPanel`, `pgBulkAdd`| Agent |
| `/HUMEX SMS/static/js/client-pages.js`| Client portal views: live logs, assigned numbers, rates | Client |
| `/HUMEX SMS/static/login.html` | Universal login interface routing users to respective portal | All unauthenticated users |
