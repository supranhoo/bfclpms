
## Confirmed diagnosis

Sajid Raza's *"Achieve organization's production target"* (Bi-Monthly, anchor **Feb-Mar** → cycles Feb-Mar / Apr-May / Jun-Jul / Aug-Sep / Oct-Nov / Dec-Jan) shows the right anchor on Apr 2026 but drifted to **May-Jun** on May 2026 and Jun 2026.

Database evidence:

```text
April 2026  → frequency_cycle_start = Feb-Mar  (created 2026-04-01)
May   2026  → frequency_cycle_start = May-Jun  (created 2026-05-01)  ← DRIFT
June  2026  → frequency_cycle_start = May-Jun  (created 2026-06-01)  ← DRIFT
```

Same pattern across **42 tuples** (41 Bi-Monthly + 1 Half-Yearly) for 2026. All Sajid's 4 Bi-Monthly KPIs are affected; other employees include Bhoopendra Sinha, Gaurav Tiwari, Jitendra Dwivedi, Mayank Shukla, Jyoti Prakash, Abhas Luharuwalla, etc.

---

## RCA — Root Cause Analysis

**Primary cause.** `auto-rollover-kpis::buildNewKpi` (pre-ADR-088, ~Apr-Jun 2026) called `resolveCycleAnchorForPeriod(frequency, targetMonth)` first and only fell back to the source anchor when the resolver returned null. For multi-month frequencies the resolver always returned the Jan-anchored standard window (e.g. `May-Jun`, `Jul-Aug`), so offset anchors like `Feb-Mar` and `Apr-Sep` were silently overwritten on every monthly cron run.

**Why it survived undetected.** The 2-arg `public.resolve_cycle_anchor(frequency, month_idx)` had the same Jan-anchored math, and `repair_org_kpi_cycle_anchors` used it — so the "repair" tool was actively rewriting legitimate offset anchors back to the standard one rather than fixing drift.

**Why ADR-088 did not close the gap.** ADR-088 (2026-06-10) fixed the rollover function and added the 3-arg sticky `resolve_cycle_anchor` + `detect_org_kpi_cycle_anchor_drift`, but only repaired Prabhat's two rows as a scoped fix. Rows already mutated by the May 2026 and Jun 2026 cron runs (Sajid + 41 other tuples) were never back-corrected. ADR-087's client-side resolver also reads from `kpis.frequency_cycle_start`, so it correctly displays the *drifted* anchor — making the bug visually obvious but not raising any guardrail alarm.

**Contributing factors.**
- No DB-level uniqueness on `(employee_id, kpi_name, review_year, frequency_cycle_start)` to prevent intra-year anchor divergence.
- `detect_org_kpi_cycle_anchor_drift` was added but never wired into a UI banner or daily cron alert.
- Org KPI Data Entry filter (ADR-087) was patched to *hide* the symptom on non-terminal months, masking the underlying data corruption.

---

## FMEA — Failure Mode & Effects

| # | Failure mode | Effect on user | Sev | Occur | Detect | RPN |
|---|---|---|---|---|---|---|
| F1 | Rollover overwrites offset anchor with Jan-anchored value | KPI rendered on wrong cycle month; percolation triggers fire against wrong sibling set | 9 | 3 (closed by ADR-088 for future rolls) | 7 (visible only when user inspects) | **189** |
| F2 | Pre-existing drift rows persist after ADR-088 | Sajid-class bug stays visible; reviewer may submit against wrong cycle; final score percolates to wrong months | 9 | 8 (42 tuples live) | 4 (UI badge shows wrong anchor) | **288** |
| F3 | `repair_org_kpi_cycle_anchors` (2-arg path) actively corrupts good anchors if re-run | Silent regression of fixed rows | 9 | 2 (3-arg added but 2-arg still callable) | 8 | 144 |
| F4 | Admin manually edits KPI on May/June row → DB trigger blocks submission with cryptic message | Reviewer cannot submit terminal month; perceives system bug | 7 | 5 | 5 | 175 |
| F5 | Percolation writes terminal score back to non-cycle sibling | Sibling shows score from a cycle it does not belong to; audit log discrepancy | 8 | 3 | 9 (no detector firing) | 216 |
| F6 | No alert when `detect_org_kpi_cycle_anchor_drift` returns >0 | Future drift goes unnoticed for ≥1 fiscal cycle | 6 | 6 | 9 | 324 |

Highest RPN → **F6 (no alarm)** and **F2 (live drift not repaired)** are the must-fix items.

---

## CAPA — Corrective + Preventive

### Corrective (one-shot repair)

1. **Build authoritative anchor map** per `(employee_id, kpi_name, review_year)` tuple: anchor = `frequency_cycle_start` of the **oldest `created_at`** row in the tuple (that row pre-dates any cron rollover, so it carries the originator-set value). Validate against `is_valid_cycle_anchor(frequency, anchor)`; if invalid, fall back to the source `org_kpis` row's anchor.
2. **Idempotent migration** `repair_drifted_cycle_anchors_2026.sql`:
   - Computes the map in a CTE, updates only rows where `frequency_cycle_start <> authoritative`.
   - Writes one `kpi_audit_logs` row per change with `action = 'KPI_CYCLE_ANCHOR_REPAIRED'`, `metadata.policy = 'ADR-088 backfill'`, before/after values, and tuple key.
   - Wrapped in `BEGIN … COMMIT` with a guard: abort if affected row count > 200 (sanity ceiling; today's expected count is ≈90 rows across 42 tuples).
   - **Does not** touch `review_submissions`, `org_kpi_values`, scores, or status. Audit-trail and immutability invariants per POLICY §88 are preserved.
3. **Post-repair verify**: re-run `SELECT count(*) FROM detect_org_kpi_cycle_anchor_drift()` — must return 0.

### Preventive (lock the door)

4. **Daily drift detector cron** — new edge function `cycle-anchor-drift-monitor` (scheduled 02:30 UTC after `auto-rollover-kpis`):
   - Calls `detect_org_kpi_cycle_anchor_drift()`.
   - Writes a row to `system_alerts` (or existing audit channel) when count > 0; surfaces a red banner in Admin → Backups/Health page with the tuple list and a "Run Repair" button (admin-gated, dry-run preview first).
5. **Deprecate the 2-arg `resolve_cycle_anchor`** — re-route every internal caller to the 3-arg sticky overload, then `RAISE EXCEPTION` from the 2-arg signature with a clear "use 3-arg overload" message. Prevents F3 from ever firing.
6. **Add partial constraint** `kpi_cycle_anchor_consistency` — trigger on `kpis` insert/update that rejects any row whose `(employee_id, kpi_name, review_year, frequency)` already exists with a different `frequency_cycle_start`. Hard guarantee that intra-year divergence cannot recur.
7. **Regression tests**:
   - `src/test/cycleAnchorDriftDetection.test.ts` — seeds Sajid-class fixture, asserts detector finds it, repair clears it, and the constraint trigger blocks a re-introduction attempt.
   - Extend `autoRolloverAnchorStickiness.test.ts` with a Half-Yearly `Apr-Sep` case (Abhas Luharuwalla's pattern).
8. **POLICY.md §54 amendment**: add the "intra-year anchor uniqueness" invariant + drift-detector SLA (24h max time-to-detect).
9. **DOCUMENTATION.md**: new ADR-090 capturing the gap analysis, repair scope, and the new constraint trigger.
10. **Memory updates**:
    - `mem/architecture/pms/multimonth-percolation` — add intra-year-uniqueness invariant.
    - New `mem/infrastructure/database/cycle-anchor-drift-monitor` describing the daily cron + banner contract.

### Rollback strategy

- Repair migration is reversible: every change is in `kpi_audit_logs` with before/after; rollback script reads those rows and restores prior anchors.
- Constraint trigger can be dropped without data loss.
- Drift-monitor cron can be unscheduled; no side effects beyond alert rows.

---

## Files (planned)

**Created**
- `supabase/migrations/<ts>_repair_drifted_cycle_anchors_2026.sql`
- `supabase/migrations/<ts>_cycle_anchor_intra_year_constraint.sql`
- `supabase/migrations/<ts>_deprecate_resolve_cycle_anchor_2arg.sql`
- `supabase/functions/cycle-anchor-drift-monitor/index.ts`
- `src/test/cycleAnchorDriftDetection.test.ts`
- `docs/adr/ADR-090.md`
- `mem/infrastructure/database/cycle-anchor-drift-monitor`

**Edited**
- `src/components/admin/BackupRestoreTab.tsx` (or system-health page) — drift banner + "Run Repair" admin action.
- `src/test/autoRolloverAnchorStickiness.test.ts` — Half-Yearly offset case.
- `POLICY.md` §54 — intra-year uniqueness + SLA.
- `DOCUMENTATION.md` — ADR-090 entry + version history.
- `mem/architecture/pms/multimonth-percolation` — invariant.
- `mem/index.md` — new memory pointer.

---

## Risk & Impact

| Dimension | Assessment |
|---|---|
| Data | Repair UPDATEs only `kpis.frequency_cycle_start`. No score/submission/OKV mutation. Audit-trailed and reversible. |
| Workflow | Restores correct terminal-month behaviour. Sibling rows that were incorrectly shown as "reviewable" on the wrong month will now correctly hide (consistent with ADR-087). |
| UI | Drift banner is admin-only. Reviewer-facing pages improve (no more confusing `May-Jun` on a `Feb-Mar` cycle). |
| Regression | Constraint trigger could reject legitimate admin edits that change anchor mid-year — mitigated by checking the trigger fires only when *different* rows in the same year already disagree, and by exposing the new anchor via a "propagate to all sibling months" admin action (already exists per ADR-088 KRA library propagation). |
| Scalability | Detector is O(N) over `kpis` filtered to multi-month frequencies (~thousands of rows). Daily cost negligible. |
| Backup | All affected tables already covered by `get_backup_table_order()`; new alert table (if added) auto-included per backup-coverage memory. |

## Out of scope (explicitly)

- No change to `auto-rollover-kpis` itself (ADR-088 already correct).
- No score recomputation or re-percolation — anchors fix metadata only; existing approved scores remain immutable per POLICY §88.
- No UI change beyond the admin banner.

Awaiting approval to implement.
