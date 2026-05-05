## Multi-Month Development Roadmap & Changelog — February → May 2026

### Deliverable

A new `**CHANGELOG_2026.md**` at the repo root (linked from `DOCUMENTATION.md` Version History). One executive-ready Markdown table, **grouped by Month → Week**, covering February through the current week of May 2026. Future ships append to the current week's row in place.

### Source-of-truth basis

Reconstructed from `DOCUMENTATION.md` Version History, `supabase/migrations/`, and `mem/*` indices. Earlier Feb entries are sparse in the running log — I'll mine them from migration filenames + commit-style ADR records and explicitly mark any week with thin records as **🟡 Iterating / partial reconstruction** so it's transparent.

---

### Proposed table (skeleton; see notes below for population strategy)

```markdown
# 📅 BFCL PMS — Development Roadmap & Changelog
> Coverage: February 2026 → present. Living document — append new ships under the current week.

---

## 🌱 February 2026
| 🗓 Week | 🧩 Module | 🛠 Highlights | 📌 Status | 🚀 Impact |
|---|---|---|---|---|
| W1 (Feb 1–7) | _Reconstruction_ | Pulled from migrations dated 202602* | 🟡 Iterating | — |
| W2 (Feb 8–14) | … | … | 🟡 | — |
| W3 (Feb 15–21) | … | … | 🟡 | — |
| W4 (Feb 22–28) | … | … | 🟡 | — |

## 🌿 March 2026
| 🗓 Week | 🧩 Module | 🛠 Highlights | 📌 Status | 🚀 Impact |
|---|---|---|---|---|
| W4 (Mar 22–28) | 📊 Reports & Scoring Engine | Team vs Manager Score query fix (v2.6.7); workflow-aware final_score sync (v2.7.0); admin data entry no longer auto-approves out-of-workflow KPIs (v2.8.0); KPI Detail report column filtering (v2.10.0); 100750 Jan data repair (v2.9.0) | 🟢 | Score integrity restored across reviewer panels |
| W5 (Mar 29–31) | 🩺 Scoring Health Check + 🔁 Rollback + 💰 Incentive | Description/threshold mismatch detection (v2.13.4/.6/.1); cycle-aware reconciliation (v2.12.0); rollback cascade clears downstream reviewers (v2.11.0/v2.15.2); atomic final_score on approval (v2.13.7); Org KPI propagation fixes (v2.13.8/.9, v2.14.0–.2); N/A blast-radius fix (v2.15.8); Incentive vessel rates port + DB-driven slabs + multi-select mapping (v2.15.10–.13); KPI Scorecard Detail report (v2.15.7); sortable headers (v2.15.4) | 🟢 | Hard-fought stability week — closed dozens of scoring + Org KPI edge cases |

## 🌳 April 2026
| 🗓 Week | 🧩 Module | 🛠 Highlights | 📌 Status | 🚀 Impact |
|---|---|---|---|---|
| W2 (Apr 8–14) | 📈 Scorecard + 🛡 Compliance + 📧 Auth | Multi-Period (YTD/QTD/Custom) scorecard (v2.36.0); target & level-wise actuals in export (v2.35.0); Multi-factor Compliance KPI data entry + all-level visibility (v2.33.8); Self-Review Compliance Penalty (v2.33.7); Password Rollout / Reset / Update Email 401 fixes (v2.34.0–v2.35.0); observation deep-link fix (v2.36.0) | 🟢 | Reviewers gain period-over-period view; auth flows finally stable |
| W3 (Apr 15–21) | 📋 Custom Reports + 👥 Reviewer Grids + 🏢 Org KPI | Configurable SLA target + 0%/100% fix (v2.37.0); Incentive Report pagination & Select-All (v2.38.0); sticky table headers (v2.39.0); Custom Report Builder (v2.63.0); reviewer panel: Smart Period auto-switch disclosure, flicker fix, pagination, panel-typing teleport fix, denominator tooltips (v2.64.0–.11); Atomic Org KPI propagation RPC + preview + Request-Revision + late-joiner auto-pull + scope cascade (v2.66.0–.6) | 🟢 | Massive scale-out for 2,500-employee reviewer ops; Org KPI now atomic + auditable |
| W4 (Apr 22–28) | 🩹 Bug-Bounty Sprint + 📤 KPI Journey | Profiles query paging policy (v2.66.7.9); manager Approve enum-typo crash (v2.66.7.19); KPI Mapping Matrix coverage truncation BUG-043 (v2.66.7.45); reviewer dashboard "all zeros" regression (v2.66.7.21); roster score-signature seed BUG-022 (v2.66.7.24); Org KPI Self column tooltipped dash BUG-023; KPI Journey Excel — Assigned Workflow Chain column + "Month" column fix BUG-028 + audit-table/vocabulary fix BUG-031; TNI splits skill-gaps vs compliance BUG-025; TNI multi-period filter; Org KPI ↔ Normal KPI scope toggle BUG-027 | 🟢 | Closed BUG-022 → BUG-043 cluster; KPI Journey export now production-grade |
| W5 (Apr 29–30) | 🔐 Identity & Access Console (IAC) + 🦺 Safety + ⚡ Cache Policy | Profile cache invalidation contract (v2.66.7.51); Safety Manual-Fetch & Pagination policy (v2.66.7.52); IAC Phase 1 (capability-based RBAC at /admin/iac); IAC Phase 2 (compat shims, leaver flow, expiry cron); IAC Bulk download/upload round-trip with per-row error CSV (v2.66.7.50–.52) | 🟢 | Per-module role enums replaced by hub-level capability model; admins can bulk-edit access |

## 🌟 May 2026
| 🗓 Week | 🧩 Module | 🛠 Highlights | 📌 Status | 🚀 Impact |
|---|---|---|---|---|
| W1 (May 1–7) | 🏷 KPI Standardization & Canonical Registry (§KPI_STANDARD) | Phase 2a–2c resolver, soft enforcement (May 2026+), health & coverage; Phase 3a–3c registry visibility, canonical-aware lookup, read-only Browser; Phase 4a–4c auto-merge + transactional merge engine + audit; Phase 5/5b definition split, History & Undo tab, inline canonical edit; idempotent Approve as Canonical (no 23505 crash) | 🟢 | One canonical name per KPI concept across months — clean cross-month dashboards |
| W1 (May 1–7) | 📊 KPI Weightage Dashboard | Server-side employee pagination (25/50/100); decoupled variance summary; debounced 300 ms search; v5.1.1 — list filtered to **only mapped employees** (~2,533 → ~mapped count) | 🟢 | Fast cold-load at scale; admins see real KRA-mapping progress |
| W1 (May 1–7) | 🔁 Multi-Month Percolation (POLICY §54 v5) | `MultimonthWorkflowDriftCard` + `repair_multimonth_workflow_drift_v5` RPC (dry-run); sibling chain renders terminal-month workflow (no phantom HR PMS cards); Atul "Accuracy in MIS data" Jan reconciled; **hotfix:** percolate trigger phantom `resolve_employee_workflow` swapped to canonical `get_employee_workflow_info` with EXCEPTION guard + regression test | 🟢 | Unblocks every Auditor / Mgmt terminal submission on Bi-Monthly / Quarterly / Half-Yearly / Yearly |
| W1 (May 1–7) | 🔐 IAC Bulk + 📝 HR Review Notes + ⚡ Lean-Load (POLICY §120) | IAC bulk download/upload round-trip + per-row error CSV; HR Review Notes inline edit (subject locked, applicable_from snapped to 1st of month); shared `useDebouncedValue` hook; `SLIM_KPI_SELECT` codified | 🟢 | Snappier filters on 2.5k-row lists; HR can correct notes without delete-recreate |
| W2 (May 8–14) | _TBD_ | _Append entries here as work ships._ | 🔵 | — |
| W3 (May 15–21) | _TBD_ | _Append entries here as work ships._ | 🔵 | — |
| W4 (May 22–28) | _TBD_ | _Append entries here as work ships._ | 🔵 | — |
```

---

### Maintenance Protocol (baked into the file)

1. **SSOT rule:** every shipped change appends one row to the current week here in the same step that updates `DOCUMENTATION.md` Version History (per project Atomic Sync rule).
2. **Status legend:** 🟢 Completed · 🟡 Iterating / partial · 🔵 Planned · 🔴 Blocked.
3. **Week boundaries:** W1 = 1–7 · W2 = 8–14 · W3 = 15–21 · W4 = 22–28 · W5 = 29–end.
4. **Granularity:** group sub-fixes under the parent feature row (sub-bullets), don't multiply rows.
5. **Monthly rollover:** end-of-month, optionally split per-month sections into `docs/changelogs/2026-MM.md`.

### Files to create / edit

- **New:** `CHANGELOG_2026.md` (repo root, full table above with Feb→May rows fully populated from the version history)
- **Edit:** `DOCUMENTATION.md` — add a single Version-History pointer row to the changelog
- **New (memory):** `mem/preferences/changelog-protocol` — captures the append-to-current-week rule for future sessions

### Risk & Impact

- **Data:** None (doc-only). · **Workflow:** None. · **UI/UX:** None. · **Regression:** Zero — no code paths touched.
- **Mitigation:** Weeks with thin source data are explicitly marked 🟡 so they read as reconstructions, not authoritative.

### One open question before I generate

February has very little signal in the running Version History (the log effectively starts mid-March). I see two clean options:

- **Option A (faster, honest):** Generate Feb rows as 🟡 placeholders with a note "version-history coverage begins 2026-03-28; earlier ships are tracked in migrations only" and link the relevant migration prefixes.
- **Option B (deeper):** I additionally scan the `202602*` migration filenames + ADR-029→ADR-040 and synthesize Feb entries from those — slower, but yields a real Feb breakdown.

Tell me **A** or **B** when approving and I'll generate accordingly.

&nbsp;

Plan A