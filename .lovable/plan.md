## Problem

On the **View KPI Details** panel and dashboards, the **Self stage** shows `Value: —` for Org-KPI-Employee rows where:
- `review_submissions.self_achieved_value` is `NULL`, AND
- `achieved_value` was already overwritten by a downstream reviewer (`auditor_achieved_value`, `management_achieved_value`, …).

We already have:
1. A `self_achieved_value` column,
2. A one-time backfill (Jun-2026),
3. A `trg_enforce_self_snapshot_mirror` trigger (17-Jul-2026).

But we still see blanks because:

- The trigger **exempts** any UPDATE that also touches a reviewer `*_achieved_value` column. `propagate_org_kpi_value` (org owner re-entry after a rollback) and some admin data-entry paths update `achieved_value` **in the same UPDATE** as a reviewer stage, so the mirror never fires.
- Rollback flows preserve reviewer stage values while re-writing `achieved_value`, leaving `self_achieved_value` untouched.
- Historical rows still exist where `self_achieved_value IS NULL` and `achieved_value` no longer matches `self_score`; the client resolver falls through to reverse-derivation, and when the KPI scale is ambiguous (e.g. Compliance `r5=0, r2=1, r0=>1`), returns `unknown` → renders `—`.

## Risk & Impact Report

| Area | Impact | Mitigation |
|---|---|---|
| Data | Backfill `UPDATE` on `review_submissions.self_achieved_value` only where currently NULL. Reversible via audit log; `session_replication_role=replica` disables triggers so `enforce_self_snapshot_mirror` won't loop. Only writes when reverse-derivation is unambiguous → **no data loss, no over-write.** | Dry-run count + `RAISE NOTICE` per KPI; log every row into `kpi_audit_logs` with `action='SELF_SNAPSHOT_BACKFILL_V2'`. |
| Workflow | RPCs (`propagate_org_kpi_value`, admin data-entry, rollback) get a `self_achieved_value :=` write. No stage/score/rating changes. | Regression tests for each RPC. |
| UI/UX | `KpiJourneySection` / dashboard tile learn to use the **Org KPI value** as a "trusted fallback" when the resolver returns `unknown`. Rating stays untouched. | Snapshot test on the modal. |
| Regression | Trigger tightened, not broadened. Existing self-only writes remain covered. | Extend `enforce_self_snapshot_mirror` test suite; add a mixed-update case. |
| Scalability | Backfill is a single `UPDATE … WHERE self_achieved_value IS NULL`; expected O(10⁴) rows, well within Postgres. | Batched in `LIMIT 5000` loop. |

## Plan

### 1. DB — tighten the write contract (migration)

- **Rewrite `enforce_self_snapshot_mirror`** so it always mirrors `achieved_value` → `self_achieved_value` when `self_score IS NOT NULL` AND `NEW.self_achieved_value IS NULL`, regardless of whether a reviewer column was touched in the same UPDATE. (Reviewer columns only matter for deciding whether `achieved_value` is the *self* value; if `self_achieved_value` is still `NULL` we must not leave it that way.)
- **Update `propagate_org_kpi_value`** and every admin/rollback RPC that writes `achieved_value` or `self_score` to always co-write `self_achieved_value := <org value>`.
- **Backfill v2**: reverse-derive from thresholds + criteria + `uom_type` (mirrors the TS resolver). Write only when a single threshold value maps back to the frozen `self_score`; otherwise leave NULL. Audit every write.
- No schema change beyond function bodies.

### 2. Client — never render `—` when a trusted fallback exists

- Extend `resolveSelfAchievedValue` to accept an optional `orgAchievedValue` argument. When result would be `unknown`, use `orgAchievedValue` if it recomputes to `self_score`; if not, still return the org value tagged `source: 'org_owner'` so we display it with a tooltip "Latest value entered by the Data Owner".
- `KpiJourneySection` and `KpiReviewPanel` already receive `orgAchievedValue`; thread it into the resolver call.
- Dashboard "value" tile (`KpiLogicModal`, `KpiTimeline`, KPI cards on Employee/Manager dashboards) — when the KPI is an Org KPI and `self_achieved_value` is `NULL`, use the latest `org_kpi_values.achieved_value` for that period.

### 3. Regression tests (Vitest)

- `resolveSelfAchievedValue.test.ts`: add cases
  - reviewer overwrote AV + org value present → returns org value.
  - reviewer overwrote AV + ambiguous scale + no org value → `unknown` (unchanged).
- New `selfSnapshotMirrorTrigger.test.sql` executed via `pgTAP` script: mixed UPDATE (`achieved_value` + `auditor_achieved_value` in one statement) with `self_achieved_value NULL` → row is mirrored.
- `orgKpiPropagationSelfSnapshot.test.ts`: after propagation, `self_achieved_value` equals the org value.

### 4. Documentation

- **POLICY.md** — new section *Self Value Snapshot Contract (SSOT)*:
  1. Every writer that sets `self_score` or `achieved_value` on behalf of the employee MUST co-write `self_achieved_value`.
  2. Reviewer-stage writers MUST NOT touch `self_achieved_value`.
  3. UI displays: `self_achieved_value` → org KPI value → `—` (never `—` when either exists).
- **docs/adr/ADR-106.md** — append "17 Jul 2026 v3" documenting the trigger tightening and Org-KPI fallback.
- **DOCUMENTATION.md** — Version History entry.

### 5. Rollback plan

Every DB change is a function replacement — restoring the prior definition is a single migration. The backfill is idempotent; rows written can be reverted using `kpi_audit_logs` where `action='SELF_SNAPSHOT_BACKFILL_V2'`.

## What is explicitly out of scope

- Recomputing `final_score` or any rating — those remain frozen.
- Redesigning the `review_submissions` table (no new columns).
- Rewriting reviewer stage logic; only self-value plumbing changes.

## Verification

1. Query the sample KPI (Sindhu Raj Singh / June 2026): `self_achieved_value` becomes non-NULL where recoverable, else org value is displayed.
2. Reload the **View KPI Details** modal → Self card shows a real value (with tooltip "Latest Data Owner value" when it came from the org fallback).
3. Roll back → org owner re-enters value → panel and dashboard both immediately reflect the new value on the Self card.
4. Run migration lints + all Vitest suites.
