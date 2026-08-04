# Multi-Month KRA Rollout + Auto-Rollover Guardrails (ADR-248)

## Assumptions
- "Full assessment period" = the fiscal cycle July–June (project standard).
- Multi-month rollout means: repeat the same source KRA set into several future months in one action, with the same dedup/preview safety the single-month rollover already has.
- Cron auto-rollover stays enabled; we change what it is allowed to touch, not whether it runs.

## What exists today (verified)
- `RolloverDialog` supports exactly one source month → one target month, with dry-run preview, conflict list, balance-only handling and auditor-mapping carry-forward.
- `auto-rollover-kpis` dedups per `(employee, review_period, kra_name, kpi_name)`. It has no notion of "this month was already issued deliberately".
- Consequence, confirmed in data: on 1 Jul 2026 the cron added **110 KPI rows to 11 employees who already had July KRAs issued manually in June**. 5 employees currently exceed 100 total weightage in July (7 in August, 3 in June).

## Part A — Multi-month rollout (safe to implement)

UI (`RolloverDialog`, config step): add a **Repeat for** control next to Target Period.
- `Single month` (current behaviour, default)
- `Next N months` (N = 2..12 stepper)
- `Rest of fiscal year` (target month → June)
- `Full assessment period` (July → June of the fiscal year containing the target)

Behaviour:
- The dialog resolves the control into an explicit ordered month list and shows it as chips ("Aug, Sep, Oct 2026 — 3 periods") before any call.
- Preview runs one dry-run per target month and shows a **per-month summary table** (new KPIs, already-present, conflicts) plus a grand total. Months with zero new KPIs are marked "nothing to create".
- Execute runs the months **sequentially**, always from the same source period, stopping on first hard error and reporting which months succeeded. Each month writes its own `kra_rollover_logs` row, so the existing audit trail and reporting stay intact.
- Multi-month KPIs (Quarterly/Half-Yearly/Yearly) are unchanged: the edge function already expands cycle months and dedups, so repeating across months creates no duplicates.
- Guardrails: max 12 target periods per run; "All Employees" + multi-month shows an explicit confirmation with the total row estimate; a running progress indicator during execution.

No edge-function change is required for Part A — it is an orchestration + presentation layer over the existing endpoint.

## Part B — Stop auto-rollover from re-adding deliberately removed KPIs

Root cause: absence of intent. The system cannot distinguish "July was never prepared" from "July was prepared and this KPI was deliberately dropped". Dedup only sees rows that exist.

Recommended long-term fix — **issuance state per employee-period**:
1. New table `kra_period_issuance (employee_id, review_period, review_year, status, issued_by, issued_at, note)` with `status in ('issued','open')`, RLS: admin/HR write, employee read own, service_role all; unique on (employee, period, year). Included automatically in backups (no denylist entry).
2. Any deliberate issuance marks the target period as **issued**: manual rollover run, Copy KRAs, Smart KRA assign, bulk template assign, and admin KPI create for a future period.
3. `auto-rollover-kpis` gains rule: when `triggered_by = 'system'` (cron), **skip every employee whose target period is already marked issued**, and additionally skip any employee who already has ≥1 KPI in the target period (belt-and-braces backstop for historical data with no issuance row). Manual/admin runs are unaffected and can still top-up.
4. Cron response and `kra_rollover_logs` record `employees_skipped_already_issued` so the skip is visible, not silent.
5. Weightage guard: after insert, if an employee's target-period total weightage exceeds 100, the run flags them in the result payload and raises an admin notification instead of silently leaving an inflated set.
6. Admin visibility: a "Period issuance" column/badge in the rollover preview showing `Issued (locked from cron)` vs `Open`, and an admin override to re-open a period.

Interim mitigation available immediately: the belt-and-braces rule in step 3 alone (skip employees who already have KPIs in the target period during cron runs) removes the reported problem without any new table — the issuance table adds the audit trail and the explicit override.

## Data repair (separate, opt-in)
A read-only diagnostic listing the 11 employees × 110 July rows added by the 1 Jul cron on top of pre-issued KRAs, plus all employees above 100 weightage in Jun/Jul/Aug. No deletions without your explicit sign-off per row batch.

## Risk & impact
- Data: Part A creates no new schema; Part B adds one additive table. No destructive change; rollback = drop the table and revert the cron rule.
- Workflow: cron becomes more conservative — the only behaviour change is that pre-issued periods are left alone.
- Regression risk: low-medium. Sequential per-month execution reuses the endpoint verbatim; the cron skip rule is gated on `triggered_by = 'system'`.
- Scalability: N months × existing paginated calls; capped at 12 periods and progress-reported.

## Tests
- `rolloverMultiMonthTargets.test.ts` — month-list resolution for next-N / rest-of-FY / full-FY incl. year wrap (Nov 2026 → Jun 2027).
- `autoRolloverIssuanceGuard.test.ts` — cron skips issued/already-populated employees; manual run still tops up.
- `rolloverWeightageGuard.test.ts` — >100 weightage detection and flagging.

## Docs
DOCUMENTATION.md (rollover section), POLICY.md new §KRA-PERIOD-ISSUANCE + §KRA-MULTI-MONTH-ROLLOUT, `docs/adr/ADR-248.md`, version history entry.
