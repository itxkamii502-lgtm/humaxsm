# HUMEX SMS — Architecture

This document describes the software architecture, data flow, protocols, storage layer, and runtime patterns of HUMEX SMS.

---

## 1. High-Level Architecture Overview

HUMEX SMS is a high-throughput, multi-tenant virtual number and SMS management platform for wholesale SMS routing, OTP verification services, and IPRN termination.

```
                  +-----------------------------------+
                  |     Inbound SMS Providers         |
                  |   (SMPP v3.4 Bind / HTTP Ingest)  |
                  +-----------------+-----------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|                             server.js                                 |
|                                                                       |
|  [SMPP Server :2775]   [Express REST API :3000]   [WebSocket Server]  |
|         |                        |                        |           |
|         +----------+             |             +----------+           |
|                    v             v             v                      |
|             +-----------------------------------------+               |
|             |        Core Message Routing Engine      |               |
|             |  - Number Matching & Limit Verification |               |
|             |  - Rate Card & Profit Calculation       |               |
|             |  - Scoped Access Control (RBAC)         |               |
|             +--------------------+--------------------+               |
|                                  |                                    |
|                                  v                                    |
|             +-----------------------------------------+               |
|             |   Storage Layer: Memory Cache + Disk    |               |
|             |   - JSON Database with MTIME checks     |               |
|             |   - NDJSON Crash-Safe SMS Journal       |               |
|             |   - Monthly CDR Partition Archiving     |               |
|             +-----------------------------------------+               |
+-----------------------------------------------------------------------+
                                   |
         +-------------------------+-------------------------+
         |                         |                         |
         v                         v                         v
+------------------+     +--------------------+     +------------------+
|   Owner Portal   |     |   Manager Portal   |     |   Agent Portal   |
|   (owner-engine.js)       |     |   (manager-pages.js) |     | (speed-agent-engine.js) |
+------------------+     +--------------------+     +------------------+
                                                             |
                                                             v
                                                    +------------------+
                                                    |  Client Portal   |
                                                    | (speed-client-engine.js)|
                                                    +------------------+
```

---

## 2. Component Layers

### 2.1 Backend Layer (`server.js`)
- **HTTP Server**: Express running on port 3000 (`node server.js --port 3000`).
- **SMPP v3.4 Server**: Built with `smpp` package, listening on `0.0.0.0:2775`. Handles `bind_transceiver`, `bind_receiver`, `submit_sm`, `enquire_link`, and enforces Message Per Second (`max_mps`) rate limiting per SMPP account with `ESME_RTHROTTLED`.
- **WebSocket Gateway**: Built with `ws` on the HTTP server, broadcasting new SMS arrivals, live OTP feeds, and agent allocation alerts to active browser sessions.
- **REST API Routing**: Over 60 REST endpoints handling Auth, Numbers, Ranges, CDR logs, Payouts, Audit logs, and Settings.

### 2.2 Storage Layer (`HUMEX SMS/data/`)
- **Memory Cache (`DB_CACHE`, `DB_MTIME`)**: Fast in-memory lookup. On read, file `mtime` is checked. If file has not changed on disk, cached object is returned immediately without parsing overhead.
- **Atomic File Writes (`writeDb`)**: Writes to a temporary `.tmp` file first, then synchronously renames (`fs.renameSync`) to prevent partial/corrupted reads.
- **Crash-Safe SMS Journaling (`SMS_JOURNAL`)**: Inbound messages are instantly appended to `sms_log.journal.ndjson`. If the server terminates unexpectedly, `recoverSmsJournal()` runs at boot to restore missing records.
- **Monthly Log Partitioning (`rotateSmsLog`)**: Records older than retention limit (default 90 days) are rotated into `data/archive/sms_log_YYYY-MM.json`. Historic queries access archives seamlessly via `readSmsWithArchive()`.

### 2.3 Frontend Presentation Layer (`HUMEX SMS/static/`)
- **Frameworkless Lightweight SPA**: Built with modular vanilla JavaScript, delivering high performance and instant page swaps without bundle bloat.
- **Unified Component Engine (`shared-ui-kit.js`)**:
  - `zyDT2`: High-speed virtualized DataTable with sorting, search filtering, column toggling, and pagination.
  - Export system: Native Copy, CSV stream, Excel, PDF, and Print.
  - `zyModal`: Non-blocking dialog manager with backdrop dismissal.
  - `zyRenderDatePresets` & `zyRenderGroupChips`: Standardized filtering toolbars.
- **Universal Design System (`humex-panel.css`)**:
  - CSS custom properties (`--sp-primary`, `--sp-bg-surface`, `--sp-border`).
  - Strict UI structure: `.zy-panel` -> `.zy-panel-head` -> `.zy-table-toolbar` -> `.zy-dt2`.
  - Contrast and typography guidelines for professional financial portals.

---

## 3. Communication & Protocols

| Protocol | Port | Direction | Usage |
|---|---|---|---|
| HTTP / JSON | 3000 | Inbound / Client | Web portals, management UI, REST APIs |
| SMPP v3.4 | 2775 | Inbound / Carrier | Carrier message ingest, high-speed SMS delivery |
| WebSockets | 3000 | Bidirectional | Real-time live OTP feed, instantaneous number allocation alerts |
| HTTP Webhook | Dynamic | Outbound | Downline agent / client HTTP POST delivery callback |
