# Group definition edit: apply to current + future months (ADR-291)

## Confirmed by inspection
- `GroupDefinitionEditDialog.tsx` has no period-span control. It sends exactly one period.
- `useBuConsole.ts` → `callGroupEdit` passes a single `p_period` / `p_year` to `bu_console_group_edit_definition`, so a group edit only ever touches the rows of the month currently selected in the console scope.
- The same one-month limitation applies to the per-employee "Tune" path (`bu_console_row_override`) and to bulk tuning.
- Precedent already exists elsewhere: the weightage cell editor supports `this / forward / all` with calendar-time gating (`computeTargetKpiIds`), and `src/lib/rolloverTargets.ts` is the existing SSOT for enumerating a month list across the July–June fiscal cycle.

So: the option is genuinely missing, not hidden.

## What to add

A **"Apply to"** control in the edit dialog, directly under the scope line:

- `This month only` (current behaviour, default — no silent change of meaning)
- `This and all future months` (selected month → June of its fiscal year)
- `Next N months` (2–12 stepper)

Rules:
- Past months are never touched, whatever the choice. If the console is parked on a past month, only "This month only" is offered, with a short note explaining why.
- The month list is resolved with `resolveRolloutTargets` from `src/lib/rolloverTargets.ts` (reused, not re-implemented) and shown as chips: "Aug, Sep, Oct, Nov 2026 — 4 periods" before any preview runs.

## Preview and commit

- **Preview** runs the existing dry-run once per target month and shows a per-month summary table: rows to write, rows skipped (with reasons), weightage deviations, cycle-anchor conflicts. Grand totals on top. Months with nothing to write are marked "no matching rows".
- **Commit** runs the months sequentially through the same RPC, one `bu_console_edit_runs` row per month, all tagged with a shared `span_id` so the whole rollout can be undone as one unit. It stops on the first hard error and reports which months already committed.
- Progress indicator while running; the dialog cannot be closed mid-run.

## Guardrails
- Hard cap of 12 periods per run (`MAX_ROLLOUT_PERIODS`).
- Multi-month choice on a structural change (KRA / category move, frequency + cycle anchor) requires the existing typed confirmation, with the period count named in the confirmation text.
- Locked / approved rows keep being skipped per month — POLICY §88 immutability is unchanged.
- Cycle-anchor conflict pre-check runs per month; conflicting months are reported, never silently skipped.
- Per-employee overrides keep their exemption unless "reset overrides" is ticked — same semantics, applied per month.

## Technical notes
- Frontend only for phase 1: an orchestration layer over the existing `bu_console_group_edit_definition` RPC, so no schema change and no RLS change. Rollback = revert the UI and the runs are undoable individually.
- New pure module `src/components/admin/bu-console/groupEditSpan.ts`: resolve the mode into targets, gate out past months, build the chip label, aggregate per-month dry-run results.
- `useBuConsole.ts`: add `useGroupEditSpanPreview` / `useGroupEditSpanCommit` wrapping the existing single-period mutations; existing single-month hooks stay untouched.
- Server change deferred to phase 2 only if sequential calls prove slow: a `p_periods jsonb` variant of the RPC that loops server-side in one transaction.
- Same "Apply to" control is added to the bulk row-tuning dialog in a follow-up once the group path is proven.

## Tests
- `groupEditSpan.test.ts` — mode resolution incl. fiscal-year wrap (Nov 2026 → Jun 2027), past-month gating, 12-period cap, aggregation of per-month results.
- Extend `groupEditModel.test.ts` — change set unchanged across months; cycle validation still applies per month.

## Docs
DOCUMENTATION.md (Performance Console → group edit), POLICY.md §CONSOLE-GROUP-EDIT-SPAN, `docs/adr/ADR-291.md`, version history entry.

## Risk
- Data: no schema change; writes are the same per-month writes as today, repeated. Worst case is a wider-than-intended edit — mitigated by the mandatory per-month preview and the undoable runs.
- Regression: low. Default stays "This month only", so existing behaviour is byte-identical unless the admin opts in.
- Scalability: N sequential RPC calls, N ≤ 12, each already paged and capped.
