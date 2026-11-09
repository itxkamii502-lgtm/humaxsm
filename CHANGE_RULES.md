# HUMEX SMS — Change Rules & Guidelines

This document establishes the strict operating protocols and change governance rules for all future engineering tasks on the HUMEX SMS codebase.

---

## 1. Golden Rules for Future Tasks

When implementing any future user request or change, you MUST strictly adhere to the following 10 rules:

1. **Read Documentation First**: Read the relevant project documentation first (`PROJECT_MAP.md`, `ARCHITECTURE.md`, `BUSINESS_LOGIC.md`, `UI_MAP.md`).
2. **Identify Exact Targets**: Identify the exact files related to the requested change before performing any edits.
3. **Targeted Inspection Only**: Inspect only those targeted files and their necessary dependencies.
4. **No Full-Project Rescans**: Do not scan, list, or reread the entire project for small, localized changes.
5. **No Unrelated File Regeneration**: Do not regenerate or rewrite unrelated files.
6. **Preserve Existing Architecture**: Preserve existing business logic, APIs, database schemas, and UI layout unless explicitly instructed otherwise.
7. **Inspect Shared Dependencies**: If a change affects shared functionality (e.g. `shared-ui-kit.js`, `humex-panel.css`, `server.js`), inspect all directly affected portal dependencies.
8. **Pre-Change Reporting**: Report which files need modification before making changes.
9. **Zero Unrelated Refactoring**: Never perform unsolicited cleanup, styling "fixes", or speculative refactoring outside the brief.
10. **Targeted Completion**: Stop immediately when the requested task and its relevant tests are complete.

---

## 2. File Editing Protocols

- **Read-Before-Write**: Always view the target line numbers first before editing to ensure contiguous character-exact matches.
- **Small Contiguous Blocks**: Prefer localized block replacements (`replace_file_content`) over whole-file rewrites. Never wipe a 500-line file to edit 10 lines.
- **Syntax Validation**: Always verify syntax via `node --check <file>` immediately after making code changes.
- **Compile Verification**: Execute `compile_applet` before concluding any turn that introduces functional changes.

---

## 3. Business & Data Integrity Guardrails

- **Zero Dummy Data**: Never introduce synthetic mock arrays when real endpoints and databases exist (`numbers.json`, `sms_ranges.json`, `sms_log.json`).
- **Hierarchy Invariants**: Never bypass the role chain: `Owner -> Manager -> Agent -> Client`.
- **Test Number Protection**: Never allow test panel numbers (`fixed_for_test: true` or `is_test_panel: true`) to be assigned to downline pools.
- **Margin Non-Negativity**: In every allocation or rate modification, enforce `agent_rate > client_rate` and `profit >= 0`.
- **CLI Masking Policy**: Maintain unmasked CLIs exclusively for Owner (`Kamran_Bhatti`); maintain privacy masking (`zyMaskCli()`) for Manager, Agent, and Client downlines.

---

## 4. UI Consistency Standards

- **Single Design Language**: Never mix styling systems or create separate CSS stylesheets. Always use `.zy-panel`, `.zy-filter-grid`, `.zy-table-toolbar`, and `zyDT2`.
- **Dual Buttons Rule**: Keep the standard dual buttons on filterbars:
  - 🟠 `.zy-btn-amber` for `Export Report`
  - 🔵 `.zy-btn-blue-solid` for `Show Report`
- **Stacked Layout Rule**: Dual data views (such as Test Numbers and Recent Test Feed) must be stacked vertically as full-width `.zy-panel` containers, never squeezed into narrow side-by-side columns.
