## Goal

Keep the existing (correct) behavior — multi-month KPIs (Bi-Monthly, Quarterly, Half-Yearly, Yearly) anchor on the cycle's terminal month, and scores auto-percolate back to sibling months — but make the UI **clearly explain why** so admins don't perceive it as a bug.

## Background (no behavior change)

Per `mem://architecture/pms/multimonth-percolation` and POLICY §54 v3:
- Only the terminal month of a cycle is reviewed (workflow runs once).
- The `percolate_multimonth_score` DB trigger copies the approved score to all sibling months.
- This prevents triple-reviewing the same Quarterly KPI and keeps scores consistent.

The current banner only says *"will be assigned to June 2026 (cycle end month)"* — accurate, but doesn't explain the *why*, which causes confusion.

## Changes

### 1. `src/components/admin/AdminKpiCreateDialog.tsx` (~line 820)

Replace the single-line banner with a richer info block that:
- Lists **all months in the cycle** (e.g., "covers April, May, June 2026").
- States the **review month** ("reviewed once in June 2026").
- Adds a small `Info` icon with a tooltip: *"Multi-month KPIs are scored once at cycle end. The approved score automatically applies to every month in the cycle. This avoids duplicate reviews and ensures consistency."*
- Uses existing `getCycleMonths()` helper from `src/lib/frequencyUtils.ts` to compute the cycle months dynamically (respects `frequency_cycle_start` overrides).

Visual: keep amber/info styling, add a 2-line layout — line 1 = cycle scope, line 2 = review anchor + tooltip.

### 2. `src/components/admin/AdminKpiEditorForm.tsx` (if it has the same banner)

Apply the same enhanced banner for edit-mode parity. Verify first via `code--view`.

### 3. `mem/features/admin/multi-month-kpi-cycle-ux.md` (new memory)

Document the UX contract: any future dialog that creates/edits a multi-month KPI must surface (a) the full cycle months and (b) the review anchor month. Cross-link POLICY §54 v3.

### 4. `mem/index.md`

Add reference to the new memory file.

### 5. `DOCUMENTATION.md` + `POLICY.md`

- DOCUMENTATION.md: add a short "Admin UX — Multi-month KPI assignment banner" subsection under the KPI Management section explaining the displayed cycle scope.
- POLICY.md §54 v3: append a UX clause: *"All admin-facing creation/edit dialogs MUST display the full cycle month range and the review anchor month for any KPI with frequency ∈ {Bi-Monthly, Quarterly, Half-Yearly, Yearly}."*

### 6. Tests

- `src/test/multiMonthBannerCopy.test.ts` (new): unit-test a small pure helper `buildCycleScopeLabel(frequency, period, year, cycleStart)` that returns `{ cycleMonths: string[], anchorMonth: string }`. Covers:
  - Quarterly Apr 2026 → cycle [Apr, May, Jun], anchor Jun.
  - Bi-Monthly Mar 2026 with default cycle start → correct pair.
  - Yearly Sep 2026 with fiscal cycle start Jul → cycle Jul–Jun, anchor Jun.
  - Year-wrap case: Quarterly Nov 2026 → cycle [Nov, Dec, Jan], anchor Jan 2027.
- Extract `buildCycleScopeLabel` into `src/lib/frequencyUtils.ts` (alongside `getActiveMonthForCycle`) so both UI and tests share one source of truth.

## What we are NOT changing

- `getActiveMonthForCycle()` logic.
- `percolate_multimonth_score` trigger.
- `enforce_frequency_lock_on_submission`.
- The KPI insert payload (`review_period: resolvedPeriod`) — stays as-is.
- Any DB schema, RLS, or workflow behavior.

## Risk & Impact

- **Data Impact:** None. Pure UI + copy + helper extraction.
- **Workflow Impact:** None.
- **UI/UX Impact:** Banner becomes more informative; same color/placement.
- **Regression Risk:** Low. The new helper is pure and unit-tested; the banner is a leaf component.
- **Mitigation:** New unit tests cover edge cases (year-wrap, fiscal cycle start, all multi-month frequencies).

## Deliverables checklist

- [ ] `buildCycleScopeLabel()` added to `src/lib/frequencyUtils.ts`.
- [ ] `AdminKpiCreateDialog.tsx` banner updated.
- [ ] `AdminKpiEditorForm.tsx` banner updated (if applicable).
- [ ] `src/test/multiMonthBannerCopy.test.ts` added (4+ cases).
- [ ] `mem/features/admin/multi-month-kpi-cycle-ux.md` created and indexed.
- [ ] `DOCUMENTATION.md` and `POLICY.md` §54 v3 updated.
- [ ] Full test suite green.
