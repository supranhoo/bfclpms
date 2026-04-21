# Org KPI — Sequenced Fix Roadmap

**Derived from:** `docs/specs/org-kpi-data-entry-spec.md` §9 + `docs/audits/org-kpi-data-entry-2026-04.md`
**Date:** 2026-04-21
**Principle:** Repair historical data **before** changing the behaviour that creates it, so cleanup runs against a stable target.

---

## Execution order at a glance

```
 Step 1 ──► Step 2 ──► Step 3 ──┐
                                ├──► Step 5
 Step 4 (independent)           │
 Step 6 (independent) ──────────┘
```

- **Steps 1 → 2 → 3** are sequentially dependent (clean data, then repair the new bug class, then change behaviour).
- **Step 4** (orphaned-ownership UI) and **Step 6** (unit labels) are independent and can ship anytime.
- **Step 5** (pre-flight preview) requires the patched RPC from Step 3.

---

## Step 1 — Run existing repair tools (Buckets B + C)

| Field | Value |
|---|---|
| **Goal** | Clear the 14 half-propagated + 6 status-stuck rows already detected by `scan` / `scan_stuck`. |
| **Code change** | None. |
| **Effort** | ~5 minutes admin click. |
| **Files touched** | None. |
| **Dependencies** | None. |
| **Trigger condition** | Admin opens System Settings → Data Repair → runs both scans, reviews, clicks Repair. |
| **Rollback plan** | Each repair writes `HALF_PROPAGATION_REPAIRED` / `STATUS_STUCK_REPAIRED` audit logs with `old_value`/`new_value`. To rollback, an admin can step back the affected `kpis.status` via the existing Step Back tool (`mem://features/admin/workflow-resilient-status-stepback`). |
| **Risk** | **Low.** Repair logic was shipped + tested in v2.65.6 / v2.65.8. |
| **Why first** | Subsequent steps (especially Step 2's bucket F repair) need a stable baseline. Repairing F against drifting B/C data risks miscounts. |
| **Done when** | Both scans return 0 rows. Pending Report and Scorecard Detail counts agree for the affected periods (Jan/Feb/Mar 2026). |

---

## Step 2 — Add Bucket F repair pass

| Field | Value |
|---|---|
| **Goal** | Detect and reset the 87 OKV rows where `status='propagated'` but zero employees advanced. |
| **Status** | **✅ Implemented (v2.65.9 — 2026-04-21).** Two new edge function modes (`scan_propagation_failures`, `repair_propagation_failures`) + new "Repair Propagation Failures (Bucket F)" section in `DataRepairTab.tsx`. |
| **Code change** | Edge function: 2 new actions in `repair-orphaned-propagations` (`scan_propagation_failures`, `repair_propagation_failures`). UI: 1 new section in `DataRepairTab.tsx`. |
| **Effort** | ~1 hour. |
| **Files touched** | `supabase/functions/repair-orphaned-propagations/index.ts`, `src/components/admin/DataRepairTab.tsx`, `docs/specs/org-kpi-data-entry-spec.md` (mark item 2 as Implemented), `DOCUMENTATION.md`. |
| **Dependencies** | Step 1 done (so we don't repair while B/C are still drifting). |
| **Detection signature** | `org_kpi_values.status='propagated'` AND `NOT EXISTS (SELECT 1 FROM kpis k WHERE k matches OKV natural key AND k.is_org_level=true AND k.status != 'kra_set')`. |
| **Repair action** | `UPDATE org_kpi_values SET status='draft', propagated_at=NULL WHERE id=…`; INSERT `kpi_audit_logs` action `PROPAGATION_FAILURE_RESET` with metadata `{detected_employees: N, advanced: 0}`. After reset, the Data Owner re-clicks Propagate, which (post-Step 3) will work correctly. Until Step 3 ships, re-propagation may re-trigger the bug — explicitly call this out in the Repair UI. |
| **Dry-run preview** | Required. Repair button disabled until admin reviews the affected rows list. |
| **Rollback plan** | Each reset writes an audit log with `old_value={status:'propagated'}`. To rollback, manually `UPDATE org_kpi_values SET status='propagated' WHERE id IN (…)`. |
| **Risk** | **Medium.** Touches OKV.status which downstream UIs read. Mitigation: dry-run preview, scoped to rows with provable zero-advance, audit log every reset. |
| **Done when** | Scan returns 0 rows; Pending Report no longer shows the 87 silently-propagated definitions as Propagated. |

---

## Step 3 — Patch `propagate_org_kpi_value` RPC (atomic + observable)

| Field | Value |
|---|---|
| **Goal** | Stop creating new B/C/F rows. Make the RPC self-reporting. |
| **Status** | **✅ Implemented (v2.66.0 — 2026-04-21).** Both 2-arg and 3-arg overloads patched: `ROW_COUNT`-guarded status advance, `skipped[]` return array, `PROPAGATION_PARTIAL` audit logs per skipped KPI, atomic via PL/pgSQL implicit transaction. Caller hook (`usePropagateOrgKpiValue.ts`) updated to surface `skippedCount` in toasts. |
| **Code change** | DB migration patching the 3-arg and 2-arg overloads of `propagate_org_kpi_value`. React caller updated to consume the new return shape. |
| **Effort** | ~2 hours including tests. |
| **Files touched** | New migration in `supabase/migrations/`, `src/hooks/useOrgKpiPropagation.ts` (or wherever the RPC is called), `docs/specs/org-kpi-data-entry-spec.md` §3 + §7, `DOCUMENTATION.md`, `mem://features/admin/org-kpi-management-suite`. |
| **Dependencies** | Steps 1 + 2 (start from a clean slate). |
| **Patch contract** | Inside the per-employee loop: (1) `UPDATE kpis SET status='self_review' WHERE id=… AND status='kra_set'`, (2) `GET DIAGNOSTICS v_row_count = ROW_COUNT;`, (3) If `v_row_count = 0`: append to `v_skipped` array `{kpi_id, employee_id, current_status, reason:'not_in_kra_set'}`, **do not** insert `review_submissions`, **do not** increment `v_propagated_count`. (4) If `v_row_count = 1`: INSERT submission + INSERT `kpi_audit_logs` action `ORG_KPI_PROPAGATED_TO_EMPLOYEE`. After loop: if `v_propagated_count = 0`, **do not** advance OKV.status; instead leave it `draft` and return `{propagated_count:0, skipped:[…], reason:'no_advance'}`. |
| **Rollback plan** | Migration is reversible: keep the old function bodies as `_v1` overloads, switch caller to new name; if issues, swap caller back. Drop `_v1` after one stable release. |
| **Risk** | **Medium-high.** RPC is on the hot path. Mitigation: keep `_v1` alongside, ship behind a feature flag (`app_settings.use_atomic_propagation` boolean), enable for admin-only first, then everyone. |
| **Done when** | New propagation runs that hit a non-`kra_set` employee return non-empty `skipped[]`, do not create stuck rows, and audit log a `PROPAGATION_PARTIAL` summary. Bucket C and F creation rate drops to zero in the daily census. |

---

## Step 4 — Orphaned-ownership UI (Bucket I)

| Field | Value |
|---|---|
| **Goal** | Surface the 44 `is_org_level=true` KPIs with no Data Owner, allow inline assignment. |
| **Code change** | New section on Org KPI Data Entry page (or new admin sub-page) that lists unowned KPIs grouped by category; inline owner picker reusing existing `useAssignOrgKpiOwner` mutation. |
| **Effort** | ~2 hours. |
| **Files touched** | `src/pages/admin/OrgKpiDataEntry.tsx` (new section) OR new file `src/components/admin/OrgKpiOrphanedOwnership.tsx`, `src/hooks/useOrgKpiDataOwner.ts` (add `useOrphanedOrgKpis` query), `docs/specs/org-kpi-data-entry-spec.md` §7 (mark Bucket I as covered), `mem://features/admin/org-kpi-management-suite`. |
| **Dependencies** | None — independent of Steps 1–3. |
| **Rollback plan** | UI-only addition. Hide section behind a feature flag during rollout. |
| **Risk** | **Low.** No DB writes beyond existing assignment mutation. |
| **Done when** | The 44 orphaned KPIs are listed, admin can assign owners in <2 clicks per row, count drops as assignments are made. |

---

## Step 5 — Pre-flight propagation preview

| Field | Value |
|---|---|
| **Goal** | Before committing a propagation, show the Data Owner a 3-line breakdown: "X employees will advance, Y already past, Z mismatched (will be skipped — see why)." |
| **Status** | **✅ Implemented (v2.66.1 — 2026-04-21).** New read-only RPC `preview_org_kpi_propagation(uuid[])`, hook `usePreviewOrgKpiPropagation`, and `PropagationPreviewDialog` component. Every Save & Propagate click on `OrgKpiEntryCard` now opens a confirmation modal showing total/will_advance/will_skip with per-employee breakdown before the live RPC runs. |
| **Code change** | New RPC `preview_org_kpi_propagation(p_definition_id)` that runs the same loop as the patched RPC but with read-only semantics; returns the same `{propagated_count, skipped:[…]}` shape. UI shows a confirmation modal. |
| **Effort** | ~1 hour. |
| **Files touched** | new migration for `preview_org_kpi_propagation`, `OrgKpiEntryCard.tsx`, `docs/specs/org-kpi-data-entry-spec.md` §4 (insert step 5.0 "Preview"). |
| **Dependencies** | Step 3 (preview must mirror the patched RPC's logic). |
| **Rollback plan** | UI-only modal; if removed, propagation reverts to one-click. |
| **Risk** | **Low.** Read-only; no state change. |
| **Done when** | Every Propagate click shows the preview; users report higher confidence; skipped[] reasons are surfaced inline. |

---

## Step 6 — Unit labels on remaining count tiles

| Field | Value |
|---|---|
| **Goal** | Eliminate ambiguous numeric tiles. Per spec §6, every count must declare its unit ("KPIs" vs "employee assignments"). |
| **Code change** | UI strings only. Pass through count + unit; no logic change. |
| **Effort** | ~1 hour. |
| **Files touched** | `src/pages/admin/OrgKpiDataEntry.tsx` (header "Y employees mapped"), `src/components/admin/OrgKpiPendingReport.tsx` (row count), Scorecard Detail "Pending: N", Repair tool scan result. |
| **Dependencies** | None — independent. |
| **Rollback plan** | Trivial revert; UI strings only. |
| **Risk** | **Negligible.** Pure presentation. |
| **Done when** | Every count tile across the 4 surfaces in spec §6 includes its unit. |

---

## Cross-cutting requirements (apply to every step)

1. **Atomic doc sync.** Every step's PR must update `docs/specs/org-kpi-data-entry-spec.md` (Version History entry + status table in §9) and `DOCUMENTATION.md` in the same commit.
2. **Audit log.** Every state change must emit a `kpi_audit_logs` row with the action codes listed in spec §2.6.
3. **Mock data + tests.** Per workspace rules: each step ships with a unit test covering the happy path + at least one regression test for the bug it addresses.
4. **Memory updates.** After Step 2 → update `mem://features/admin/data-repair-engine`. After Step 3 → update `mem://features/admin/org-kpi-management-suite`. After Step 4 → update `mem://features/admin/org-kpi-management-suite`. The current loop does NOT update memories — they are updated alongside the actual code change.
5. **Census re-run.** After Steps 1, 2, and 3 each individually, re-run the audit's Pass 1 census and append a delta row to `docs/audits/org-kpi-data-entry-2026-04.md` showing the bucket counts before/after.

---

## Recommended next action

**Click Step 1 now (zero code).** It takes 5 minutes, gives a clean baseline, and unblocks Steps 2 and 3.
After Step 1 returns 0/0, schedule Step 2 (the highest-impact code change — fixes 87 rows), then Step 3 (the root-cause patch that stops new bugs).
Steps 4 and 6 can be picked up in parallel by anyone available; they don't block the integrity-fix chain.
