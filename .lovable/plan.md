## RCA: why the same KPI shows 3 different counts

**Observed from the screenshot:**
- Card badge: **50 employees**
- Expanded section: **55 Employees (0 / 55 entered)**
- Impact sheet: **Total Affected 50** and **Affected Employees (50)**

**Database check for the visible KPI text (`Completion of Mandated Training Hours`, `Training & Development`) shows a period mismatch:**
- **April 2026:** 50 active mapped employee KPI rows
- **May 2026:** 55 active mapped employee KPI rows
- Gap is not inactive users; it is a genuine mapping difference between months.
- The 5/6 employee delta between April and May is caused by employees added/removed between monthly KPI mappings.

**Primary root cause:**
The page is mixing **different period snapshots** for one rendered card:
1. **Card badge / Impact sheet** are tied to the current `useOrgLevelKpisWithEmployees(selectedPeriod, selectedYear)` mapping snapshot, which in the screenshot is resolving to **50**.
2. **Expanded employee section** is rendered from `OrgKpiEntryCard` internal `scopedValues` state, which can remain at **55** from the previous card/period snapshot because the component sync effect only depends on KPI identity and does **not** include `data.scopedRows`. When the same KPI name exists across periods, React keeps the same card instance while `data.scopedRows` changes; the local table state does not fully reset.
3. **Impact sheet** directly re-queries `kpis` by period and also receives expected IDs from the parent; it is correctly showing the same **50** as the parent mapping snapshot, but it still highlights that the expanded section is stale.

**Secondary issue:**
The current fix accidentally changed the card badge to `scopedRows.length`. That hides RLS/visibility gaps instead of preserving the canonical mapped count. ADR-060 already says the UI should show a visibility-mismatch banner when visible rows are fewer than mapped rows. Therefore:
- **Canonical mapped count** should come from `mappedEmpIdsByKey` / `employeeCountMap`.
- **Visible/rendered row count** should come from `scopedRows.length` / table rows.
- They should not be treated as the same metric.

## Risk & Impact Report

**Data impact:** No schema change planned. Read-only UI/state correction only.

**Workflow impact:** No permission or propagation workflow changes. The fix only corrects displayed counts and state synchronization.

**UI/UX impact:** Counts will become consistent and explicit: mapped total vs visible rows. If visibility differs, the existing amber warning will explain it.

**Regression risk:** Moderate, because Org KPI cards are stateful and auto-save sensitive. Mitigation: only reset scoped table state when the upstream row identity/count changes and no user edit is dirty.

**Mitigation:** Add unit tests for count derivation and state-reset key behavior; update POLICY/DOCUMENTATION/ADR as required.

## Implementation Plan

1. **Create a single count contract**
   - Add a small pure helper, e.g. `src/lib/orgKpiCounts.ts`, defining:
     - `mappedCount`: canonical mapped employees for this KPI/period.
     - `visibleCount`: rows the current user can actually see/render.
     - `enteredCount`: rows with achieved value or N/A.
     - `hiddenCount`: `mappedCount - visibleCount`, never below 0.
   - This prevents card, table, pending report, and impact sheet from each inventing its own count rule.

2. **Fix stale expanded section state**
   - In `OrgKpiEntryCard`, include a stable `scopedRowsKey` / row-signature in the reset effect.
   - When `data.scopedRows` changes from 55 rows to 50 rows for the same KPI identity, reset `scopedValues` to the new rows if the user is not actively editing.
   - Keep the existing dirty-state merge behavior so active user edits are not overwritten.

3. **Restore canonical card badge behavior**
   - Change `OrgKpiDataEntry.buildCardData` so `employeeCount` is again the canonical mapped count (`employeeCountMap` / `mappedEmpIdsByKey.length`), not `scopedRows.length`.
   - Keep `scopedRows.length` as the visible table count.
   - This aligns with ADR-060: if mapped count > visible count, show the amber visibility warning instead of silently reducing the mapped count.

4. **Make the expanded table label explicit**
   - Update `OrgKpiScopedEntryTable` to support optional `totalCount` / `hiddenCount` props.
   - Header should display the same canonical total as the badge, while still rendering only visible rows.
   - Example when no hidden rows: `50 Employees (0 / 50 entered)`.
   - Example when hidden rows exist: `50 Employees (0 / 45 visible entered)` plus existing amber banner.

5. **Keep Impact sheet anchored to the same canonical IDs**
   - Keep `expectedEmployeeIds` passed from the card mapping.
   - Ensure the sheet’s `Total Affected`, department badges, and table header all use the same canonical count contract.
   - If some expected employees cannot be rendered because of access policy, show the existing hidden-count note.

6. **Add regression tests**
   - Test that a same-KPI/same-component `scopedRows` change from 55 to 50 resets the table count when not dirty.
   - Test mapped vs visible count derivation.
   - Update the existing Org KPI parity tests so they enforce the correct contract: mapped total is canonical; visible rows are separately tracked.

7. **Update documentation and policy**
   - Add an ADR-064 addendum clarifying the distinction between mapped count and visible count.
   - Update `DOCUMENTATION.md` and `POLICY.md` version history with the count contract.

## Expected result after fix

For the screenshot KPI, all three count surfaces will stop conflicting:
- If viewing **April 2026**, all surfaces should show **50**.
- If viewing **May 2026**, all surfaces should show **55**.
- If a role cannot see all mapped employees, the UI will show the canonical mapped total plus an explicit hidden-by-access explanation, instead of showing unexplained different numbers.