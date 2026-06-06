# RCA + CAPA — May 2026 KRA Rollover Misses (4 Employees)

## 1. Assumptions
- "May rollover" = bulk cron that creates May-2026 KPIs from April-2026 source KPIs.
- "Worked" = an April→May KPI row was created in `public.kpis` for the employee.

## 2. Findings (evidence)

| Emp Code | Name | April KPIs | May KPIs | April KPI `created_at` |
|---|---|---|---|---|
| 100018 | Ashish Das Gupta | 15 | **0** | 2026-05-01 **11:26:50 UTC** |
| 100234 | Ajay Prasad Choudhary | 9 | **0** | 2026-05-01 **11:56:37 UTC** |
| 100393 | Sanjay Gope | 6 | **0** | 2026-05-01 **11:38:58 UTC** |
| 100749 | Ashish Rajwar | 8 | **0** | 2026-05-01 **12:19:34 UTC** |

Bulk May rollover output is visible in `public.kpis`:
- First May-2026 row created **2026-05-01 00:00:05 UTC** (cron fired at midnight).
- 131 employees / 1,969 KPIs produced in that single batch.

Cross-check: a 5th employee (100406 Anil Rajwar) has the same symptom and is also missing May KPIs — same root cause class.

## 3. WHY-WHY

1. **Why no May KPIs for these 4?** Bulk rollover did not find any April source KPIs for them at run-time.
2. **Why no April source?** Their April KPIs were inserted **11–12 hours AFTER** the rollover finished (cron ran 00:00:05; KRAs assigned 11:26–12:19).
3. **Why assigned so late?** Manager (Atul Kumar Khaitan, in 4 of 5 cases) created April KRAs on 1-May — same calendar day the cron ran, but after the cron window.
4. **Why didn't the system catch up?** Rollover is a **one-shot cron at month start** with no retry/backfill for KRAs assigned later in the source month.
5. **Why was no alert raised?** Secondary finding: the **2026-05-01 cron run wrote NO row to `kra_rollover_logs`** (zero rows between 2026-04-29 and 2026-05-04), so the run is invisible to admins, and the "X employees skipped due to no source" delta is not surfaced.

## 4. Root Cause (RCA)

- **Primary RC (operational/timing):** Source April KPIs did not exist at the instant the May rollover cron executed. Rollover behaved correctly per spec — there was nothing to clone.
- **Secondary RC (observability gap):** The bulk cron run did not produce a `kra_rollover_logs` entry, so the skip was undetectable without a manual query.
- **Tertiary RC (process):** No automatic backfill when source KPIs are inserted in the source month after the rollover cron.

This is NOT an RLS issue, not a duplicate-key trigger issue (ADR-045), and not a frequency-cycle issue (ADR §128) — verified against existing logs.

## 5. Risk & Impact

| Dimension | Impact |
|---|---|
| Data | 5 employees missing May review records; no data corruption |
| Workflow | Self-review / manager review for May blocked for these employees |
| UI/UX | Empty scorecards on /dashboard for May |
| Regression | Same class of miss will recur every month for late KRA assignments |
| Scalability | Manual reruns are O(missed employees); acceptable |

## 6. CAPA — Plan

### Corrective (one-time, fixes the 5 affected employees)
**C1.** Run a **scoped** `auto-rollover-kpis` (April → May 2026) for `employee_ids = [100018, 100234, 100393, 100406, 100749]` via the existing RolloverDialog → scoped mode (proven path; see `scopedRolloverDialog.test.ts`). Dry-run first; then execute.

### Preventive (CAPA — code + ops)

**P1. Close the observability gap (high priority).**
Ensure the cron path in `supabase/functions/auto-rollover-kpis/index.ts` always writes a `kra_rollover_logs` row — including when `employees_affected = 0` or when employees are skipped because they had no source KPIs. Capture per-employee `skipped` reasons in `details` (today only "duplicates_skipped" / "rolled_over" buckets exist). Add a regression test that asserts a log row is written when source set is empty.

**P2. Self-healing backfill sweep.**
Add a lightweight nightly sweep (or post-KRA-assignment hook): for any employee with source-month KPIs whose `created_at > <last rollover run timestamp for target_month>`, automatically enqueue a scoped rollover for the next month. Idempotent via existing `idx_kpis_no_duplicates`.

**P3. Admin-visible "rollover health" widget.**
On the Admin → Rollover screen, surface the delta `employees_with_source_month_kpis − employees_with_target_month_kpis` for the current target month, with a one-click "Backfill missing" action that calls the scoped path from P1.

**P4. Policy update (POLICY.md §Rollover).**
Document: rollover cron is a snapshot at T0 of source month; any KPI inserted after T0 requires a scoped rollover OR will be picked up automatically by P2. Update DOCUMENTATION.md → Rollover section accordingly.

### Sequence
```
Step 1  Corrective rerun (C1) ............... verify: 5 emps now have May KPIs
Step 2  P1 logging fix + unit test ........... verify: forced empty-source run writes a log row
Step 3  P2 self-healing sweep + test ......... verify: insert late April KPI → next sweep creates May
Step 4  P3 admin widget ...................... verify: widget shows 0 missing after sweep
Step 5  P4 docs/policy update ................ verify: docs/policy diff
```

## 7. UI Changes
- **P3 only.** New "Rollover Health" card on the existing Admin → KRA Rollover page (no new route). Card shows: target month dropdown, "Employees with source / with target / missing" counts, and a "Backfill missing (N)" button that opens the existing `RolloverDialog` pre-populated with the missing employee IDs. Mobile: collapses to a single column; CTA full-width.

## 8. Tests
- `kraRolloverLogging.test.ts` — empty-source cron MUST write a `kra_rollover_logs` row with `status='completed'`, `employees_affected=0`.
- `kraRolloverBackfillSweep.test.ts` — late-inserted source KPI is detected and scoped-rollover is invoked exactly once.
- `rolloverHealthWidget.test.tsx` — widget renders correct counts from a mocked RPC.

## 9. Out of scope / will NOT change
- Trigger `enforce_frequency_lock_on_submission` (ADR-045) — unrelated.
- Duplicate-key dedup logic in rollover — unrelated.
- April source data itself — correct as-is.

## 10. Rollback
- P1/P2/P3 are additive (new logging rows, new sweep function, new UI card). Disable via feature flag `rollover_self_heal_enabled` if regression observed; no schema destructive changes.
