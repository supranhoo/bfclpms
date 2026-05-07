## Problem

When an admin assigns a Quarterly (or any multi-month) KPI from the "Assign New KRA" dialog, only **one** row is inserted into `kpis` — at the cycle's **terminal month** (e.g. June for the Apr–Jun quarter). Result:

- Employee opens April / May and sees "no KPI mapped" → believes mapping is incomplete.
- Final score / weightage calculations for April and May exclude this KPI, distorting the monthly view until June is approved.
- This conflicts with how Copy-from-Last-Period and the rollover engine already behave (they create rows for every cycle month).

Root cause: `AdminKpiCreateDialog.handleSubmit` calls `getActiveMonthForCycle(...)` and inserts a single row at `resolvedPeriod`. There is no sibling expansion on insert — only on approval, where `percolate_multimonth_score` writes back to siblings (which therefore must already exist).

## Decision

For multi-month frequencies (`Bi-Monthly`, `Quarterly`, `Half-Yearly`, `Yearly`):

1. Create one **terminal** row (workflow-bearing) at the cycle's last month, exactly as today.
2. Additionally create **placeholder sibling rows** for every other cycle month that is:
   - **>= the assigned `Effective Month`** (skip months earlier than what the admin selected — past months stay untouched), AND
   - **not locked** by `review_period_locks` for that employee's company/year.
3. Siblings carry identical KPI definition (kra/kpi/uom/criteria/thresholds/weightage/frequency/cycle_start/etc.), `status = 'kra_set'`, and reference the same `source_template_id`. They are functionally placeholders awaiting terminal approval to percolate scores.

## Scope of changes

### 1. New shared helper — `src/lib/multimonthAssignment.ts`
- `buildSiblingPeriods({ frequency, frequencyCycleStart, assignedMonth, reviewYear, terminalMonth }) → Array<{ period: string; year: number }>`
  - Uses existing `buildCycleScopeLabel` / `getCycleOptionsForFrequency` to enumerate cycle months.
  - Filters: drop terminal, drop months before `assignedMonth` (calendar order within the cycle, handling Dec→Jan wrap via the array order).
- Returns terminal + non-terminal list separately so caller can insert terminal first (workflow target) and siblings second.

### 2. `useCreateKpi` (src/hooks/useKpis.ts)
- After inserting the terminal row, if frequency is multi-month:
  1. Fetch open `review_period_locks` for `(employee_id's company, year, period IN siblingPeriods)`.
  2. Filter out locked months.
  3. Bulk-insert siblings via `supabase.from('kpis').insert([...])` with `status: 'kra_set'`.
  4. Swallow per-row unique-constraint errors (a sibling could already exist from a prior assignment / rollover) but surface other errors as a non-blocking warning toast — terminal succeeded, siblings partial.
- Invalidate the existing query keys (already done).

### 3. `AdminKpiCreateDialog.tsx`
- No logic change to `resolvedPeriod` (terminal stays terminal).
- Update the existing orange "Quarterly cycle covers …" info banner to clarify behavior:
  > "Sibling placeholder rows will be created for {forward open months}. Approval in {terminal} will auto-apply the score to all months in the cycle. Past or locked months are skipped."
- Pass `assignedMonth` (the user-selected `reviewPeriod`) to the hook so it can compute "from-this-month-forward".

### 4. Bulk path (`Issue KRAs — Confirmation` flow)
- The same dialog underpins single-assign. Confirm `useCreateKpi` is the only insertion point — if the bulk "Confirm & Issue KRAs" path uses a different mutation (`useBulkAssignKpis` / similar), apply the same sibling expansion there. Will verify in implementation phase.

### 5. Tests — `src/test/multimonthAssignment.test.ts`
- Quarterly assigned in May 2026 (Apr–Jun cycle) → terminal=June, siblings=[May]. April skipped (past).
- Quarterly assigned in April → terminal=June, siblings=[April, May].
- Half-Yearly assigned in March (Jan–Jun cycle) → terminal=June, siblings=[March, April, May]. Jan/Feb skipped.
- Yearly Apr–Mar assigned in October → terminal=March, siblings=[Oct, Nov, Dec, Jan, Feb] across year wrap.
- Lock filter: simulated lock on May → siblings=[April] only.
- Monthly / Daily / Weekly → no siblings (early return).

### 6. Documentation & memory
- Append a new Version History entry in `DOCUMENTATION.md` under "Multi-month KPI assignment".
- Update `mem://architecture/pms/multimonth-percolation` to note: **siblings are now created at assignment time (not just by historical rollover)**, scoped from `assignedMonth` forward and skipping locked months.

## Risk & impact

| Area | Impact | Mitigation |
|---|---|---|
| Data integrity | Multiple new rows per assignment | Unique constraint `(employee_id, kra_name, kpi_name, review_period, review_year)` already prevents duplicates; per-row error swallow |
| Existing percolation trigger | Now has guaranteed sibling targets at approval | No change needed — already idempotent (force-copy on approve) |
| Locked period governance | Could violate locks if we inserted into locked months | Explicit lock filter before insert |
| Score calculations (month view) | Apr/May now show a `kra_set` (unscored) sibling — weighted average already excludes unscored KPIs (per Core memory) | No regression; the KPI just becomes visible as "pending" rather than missing |
| Rollover engine | Already creates the same shape of rows | Behavior now consistent across both entry points |
| Send-back / data-entry | Sibling editing is blocked by `enforce_frequency_lock_on_submission` for non-admins | Existing guard remains in force |

## Out of scope

- No DB migration / trigger change — purely client-side expansion.
- No retroactive backfill for already-assigned multi-month KPIs missing siblings (can be a follow-up repair script if needed).
- No change to terminal-month workflow, percolation, or scoring logic.
