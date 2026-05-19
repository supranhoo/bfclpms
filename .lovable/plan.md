## Problem

For a Half-Yearly KPI with **Cycle Start = Financial Year (Apr Start)** the cycles are:
- H1: Apr–Sep → today's `activeMonth = 9` (review in September, the last month of the cycle)
- H2: Oct–Mar → today's `activeMonth = 3` (review in March)

Business reality (e.g. stock-audit variance KPI): the review can only happen **after** the half closes — i.e. **April** (for H2 Oct–Mar) and **October** (for H1 Apr–Sep). The current rigid terminal-month rule blocks this:

> "Half-Yearly KPI cannot be reviewed for April. Only the terminal month of the cycle is reviewable."

Admins have no way to express "review one month after the cycle ends".

## Goal

Introduce a new selectable Half-Yearly cycle option **"Financial Year — Review in Apr & Oct"** that:
- Keeps the same H1 (Apr–Sep) / H2 (Oct–Mar) cycles
- Moves the review (terminal) month to **October** for H1 and **April** for H2
- Locks all other months of each cycle the same way

This is opt-in per KPI (existing per-KPI `frequency_cycle_start` override field — already wired through `resolveEffectiveCycleOption`) and also available as a global default in Frequency Cycle Settings.

## Risk & Impact Report

| Area | Impact | Mitigation |
|---|---|---|
| Data schema | None — reuses existing `frequency_cycle_start` text column and `frequency_config.sub_frequency` / `locked_months` / `active_month` | New value strings only; no migration of historical data |
| Workflow | Only affects KPIs whose admin explicitly selects the new option | Existing KPIs untouched (default option unchanged) |
| Multi-month percolation | `percolate_multimonth_score` resolves terminal via `get_cycle_months` + last-element-of-array rule. Need to confirm terminal resolution for a cycle whose "review month" sits **outside** the data-collection months works correctly | See "Open question" below — may require extending `get_cycle_months` or storing terminal explicitly |
| Frequency lock | `enforce_frequency_lock_on_submission` reads `locked_months` from `frequency_config`. New option provides correct locked-months map | Covered by config row |
| UI | Cycle Start dropdown gets one extra row in Admin KPI editor and Frequency Cycle Settings | Pure additive |
| Regression | Existing Apr-Sep option (`activeMonth: 9`) untouched | New option has different `value` key |

## Open question (needs your confirmation before build)

The current model assumes the **terminal/review month is one of the cycle's data months**. The new pattern says "review in the month **after** the cycle ends" (April reviews data from Oct–Mar; October reviews data from Apr–Sep). Two ways to model it:

**Option A — Shift the cycle boundary** (simplest, no engine changes)
- H1 = May–Oct (review month = Oct), H2 = Nov–Apr (review month = Apr)
- Pros: zero changes to `get_cycle_months` / percolation triggers
- Cons: the "cycle label" no longer matches the financial half exactly

**Option B — Keep Apr–Sep / Oct–Mar cycles, add explicit `review_month`** (cleanest semantically)
- Cycle months stay Apr–Sep and Oct–Mar (matches FY half)
- New `review_month` field tells the workflow engine "open the review in the month after the last data month"
- Requires: extending `frequency_config` with `review_month`, updating `get_cycle_months` / `getActiveMonthForCycle` / `enforce_frequency_lock_on_submission` / sibling-creation logic in `useCreateKpi`
- Higher blast radius — touches POLICY §54

I recommend **Option A** unless you specifically need the cycle label to read "Apr–Sep". It satisfies the business need (review happens in Apr & Oct) with zero engine risk.

## Plan (assuming Option A is approved)

### 1. `src/lib/frequencyCycleOptions.ts`
Add to `HALF_YEARLY_OPTIONS`:
```
{
  value: 'May-Oct',
  label: 'Financial Year — Review in Apr & Oct',
  description: 'H1: May–Oct (review in Oct), H2: Nov–Apr (review in Apr)',
  subFrequency: 'May-Oct,Nov-Apr',
  lockedMonths: { H1: [5,6,7,8,9], H2: [11,12,1,2,3] },
  activeMonth: 10,   // primary terminal; secondary terminal (Apr) handled by cycle array
}
```

### 2. DB seed — extend `frequency_config` choices
Migration to UPSERT the new sub_frequency entry into `frequency_config` so the dropdown in Frequency Cycle Settings can persist it globally. (No schema changes — data only.)

### 3. Verify `get_cycle_months` handles the wrap (Nov–Apr crosses year boundary)
Quick read-only check of the function; existing Dec→Jan wrap rule for Bi-Monthly `Dec-Jan` already covers this pattern, so behavior should be inherited.

### 4. UI surfaces
- `AdminKpiEditorForm` / KPI create dialog — Cycle Start dropdown auto-picks up new option from `HALF_YEARLY_OPTIONS`
- `FrequencyCycleSettings.tsx` — Half-Yearly section gets the third radio card automatically
- No component refactor needed; both already iterate `HALF_YEARLY_OPTIONS`

### 5. Tests
- `frequencyCycleOptions.test.ts` — assert the new option resolves correctly via `resolveEffectiveCycleOption`
- `frequencyUtils.test.ts` — terminal-month resolution for `May-Oct` returns October; for `Nov-Apr` returns April (handles year wrap)
- Mock KPI fixture with `frequency='Half-Yearly'`, `frequency_cycle_start='May-Oct'` — submitting in April for the Nov–Apr cycle passes the lock, submitting in March is blocked

### 6. Docs / policy
- `POLICY.md` §54 — add v5.1 note: "Half-Yearly supports an additional FY-aligned variant where review opens in the month following the data-collection half."
- New ADR-064: "Configurable Half-Yearly review-month for post-cycle audits"
- Update `mem/architecture/pms/multimonth-percolation` with the new option string

## Out of scope
- No changes to scoring math, score percolation behavior, or workflow stage engine
- No retroactive migration of existing Apr–Sep KPIs — admins migrate manually if desired
- No changes to Quarterly / Bi-Monthly / Yearly cycles (can be added later with the same pattern if needed)

---

**Please confirm:** Option A (shift cycles to May–Oct / Nov–Apr) or Option B (keep Apr–Sep / Oct–Mar and add a separate review-month engine field)?
