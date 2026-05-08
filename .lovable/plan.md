## Problem

In the Org KPI Data Entry screen, the header card shows a single status pill ("Value Entered" / "Propagated") for the whole KPI, but for **employee-scope** (and department-scope) KPIs each individual row has its **own** `org_kpi_values.status`. Today the per-employee table shows no per-row indicator, so an admin cannot tell which rows still need propagation.

Concrete case (Atul Kumar Khaitan, "Completion of Mandated Training Hours", April 2026):
- OKV row exists with `achieved_value = 100`, `status = 'entered'`.
- No `review_submissions` row, so Self/Manager/Auditor stay "Pending".
- Header still says "Value Entered" because the overall KPI has values, hiding the fact that this specific employee's row was never propagated.

## Goal

Make the per-row propagation state visible at a glance, both for employee-scope and department-scope tables, and let the admin act on it from the same row.

## Risk & Impact (read-only UI change)

- **Data:** none. No schema, RLS, or RPC change. We only surface `org_kpi_values.status` that already exists.
- **Workflow:** none. Existing Propagate / Bulk Propagate flows stay unchanged. We only expose the per-row Propagate button that's already wired through `onPropagateRow`.
- **UI/UX:** adds one small pill in the Employee cell and tweaks the header counter. No layout reshuffle.
- **Regression risk:** low — additive prop on `ScopedRow`; default `'pending'` keeps current rendering for callers that don't pass it.

## Plan

1. **Extend `ScopedRow` (and the data builder)**
   - Add `status?: 'pending' | 'entered' | 'propagated' | 'approved'` to `ScopedRow` in `src/components/admin/OrgKpiScopedEntryTable.tsx`.
   - In `src/pages/admin/OrgKpiDataEntry.tsx` `buildCardData`, when building `scopedRows` for employee and department scopes, include `status: val?.status ?? 'pending'` from the matched `org_kpi_values` row.

2. **Per-row status pill (Employee cell)**
   - In the row render, next to the existing department / designation badges, render a small pill driven by `row.status`:
     - `pending` → muted "Pending" (Clock icon)
     - `entered` → orange "Entered – not propagated" (CheckCircle2 icon)
     - `propagated` → green "Propagated" (ArrowUpRight icon)
     - `approved` → emerald "Approved" (ShieldCheck icon)
   - Reuse the same colour tokens as the header `statusConfig` in `OrgKpiEntryCard` so the two views read consistently.

3. **Header counter clarity**
   - Update the table header line that today reads "(X / Y entered)" to also show propagated count when a mix exists, e.g. "(50 / 50 entered • 18 propagated • 32 not propagated)". Counts come from `rows.filter(r => r.status === ...)`.
   - Keep wording compact; hide propagated/not-propagated chips when all rows share the same status.

4. **Per-row Propagate affordance**
   - The table already accepts `onPropagateRow`. Surface it as a small "Propagate" icon-button in the Actions cell **only when** `row.status === 'entered'` (and admin is not governance-locked). Disabled while `isPropagating`.
   - Wire it from `OrgKpiEntryCard` → `OrgKpiDataEntry` to call the existing `propagateMutation` for that single scopeId. No new RPC.

5. **Header pill stays aggregate**
   - Keep the current single-state header pill, but change its label to:
     - "All Propagated" when every row's status is propagated/approved
     - "Partially Propagated" (orange) when at least one row is `entered` and at least one is `propagated`
     - "Value Entered" when all entered and none propagated
     - "Pending" when none entered
   - This prevents the misleading "Value Entered" label when most rows are actually live.

6. **Tests / mocks**
   - Add a unit test for `OrgKpiScopedEntryTable` that renders a mixed-status `rows` array and asserts the correct pill text per row and the new header counter.
   - Extend existing org-KPI mocks so at least one row has `status: 'entered'` and one has `status: 'propagated'` for snapshot coverage.

7. **Docs / memory**
   - Update `mem://features/admin/org-kpi-management-suite` (or add a sibling note) with the new per-row status convention.
   - Note in DOCUMENTATION.md that the badge reads `org_kpi_values.status` directly (no derivation).

## Out of scope

- Auto-propagating on save (separate decision — would change workflow semantics).
- Backfilling Atul's specific row — the user can use the new per-row Propagate button after this ships, or we can run a one-off propagate for `9860cc06-…` separately if requested.
- Any change to `propagate_org_kpi_value` RPC or to `review_submissions` shape.

## Files touched

- `src/components/admin/OrgKpiScopedEntryTable.tsx` — type + per-row pill + header counts + per-row Propagate button.
- `src/pages/admin/OrgKpiDataEntry.tsx` — pass `status` into `scopedRows`, wire single-row propagate handler, compute aggregate header label.
- `src/components/admin/OrgKpiEntryCard.tsx` — relabel header pill based on mix; pass `onPropagateRow`.
- `src/test/orgKpiScopedEntryTable.test.tsx` — new tests for mixed-status rendering.
- `DOCUMENTATION.md` + memory note — record the convention.
