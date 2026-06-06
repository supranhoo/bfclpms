## Root Cause

The "Data Owner: Ankit Choudhary" badge in the screenshot is the **fallback branch** of the badge logic, not a real owner lookup.

In `src/components/review/KpiDetailsTable.tsx` (lines 512–524), and identically in `src/components/review/MobileKpiCard.tsx` (~278–282) and `src/components/dashboard/MobileKpiCard.tsx` (~125–129), the code is:

```tsx
const owners = dataOwnerNames?.get(ownerKey);
return owners && owners.length > 0 ? (
  <Badge>Data Owner: {owners.join(', ')}</Badge>
) : orgValue?.entered_by_name ? (
  <Badge>Data Owner: {orgValue.entered_by_name}</Badge>   // ← wrong label
) : null;
```

When no row exists in `org_kpi_data_owners` for this KPI, the code falls through to `org_kpi_values.entered_by_name` — i.e. whoever last typed a value — and **mis-labels that person as the Data Owner**. Ankit had only entered data previously for this Employee-scoped Org KPI; he was never assigned as its owner, so the badge is factually wrong.

This is purely a presentation bug; ownership data in `org_kpi_data_owners` is correct.

## Risk & Impact Report

- **Data impact:** None — display-only change, no schema or write paths touched.
- **Workflow impact:** None — badge does not drive any workflow logic; `useRequestOrgKpiRevision` and Send-Back-to-Data-Owner flows already read from the real `org_kpi_data_owners` table, not from this badge.
- **UI/UX impact:** Rows where an owner IS assigned look identical. Rows that previously showed a misleading "Data Owner: <entered_by>" fallback will instead show a correctly-labeled "Entered by: <name>" badge (muted styling) — so the information is preserved but truthful.
- **Regression risk:** Low. Three call sites, mechanical change, identical pattern in each.
- **Scalability:** Unchanged — same query, same map lookup.
- **Rollback:** Trivial revert of the three components.

## Plan

1. **`src/components/review/KpiDetailsTable.tsx`** — Replace the fallback `Data Owner: {entered_by_name}` with `Entered by: {entered_by_name}` rendered as a muted/secondary badge (visually distinct from the owner badge). When `dataOwnerNames` has entries, render only the real "Data Owner" badge as today.
2. **`src/components/review/MobileKpiCard.tsx`** — Same change.
3. **`src/components/dashboard/MobileKpiCard.tsx`** — Same change.
4. **Tests** — Add a small unit-level render test (or extend an existing one) covering: (a) owners present → "Data Owner: X" badge, (b) no owners + `entered_by_name` present → "Entered by: Y" badge (not "Data Owner"), (c) neither present → no badge.
5. **Docs** — Add a one-liner to `DOCUMENTATION.md` under the Org KPI section clarifying the distinction:
   - **Data Owner** = assignee in `org_kpi_data_owners` (governance role)
   - **Entered by** = `org_kpi_values.entered_by_name` (last person who typed the value)
6. **Memory** — Append a note to `mem://features/admin/org-kpi-management-suite` so future work doesn't reintroduce the fallback mislabel.

## UI Changes

- **What:** The badge text on Org-KPI rows that have no assigned Data Owner.
- **Where:** Right of the "Org KPI — <scope>" chip on every Org KPI row in the review scorecard (`KpiDetailsTable`) and the mobile review/dashboard cards.
- **Before:** `Data Owner: Ankit Choudhary` (incorrect)
- **After:** `Entered by: Ankit Choudhary` (muted variant), or nothing if no value has been entered yet.
- **Interaction:** None — badges remain non-interactive informational chips.
- **Responsiveness:** No layout change; same chip dimensions on desktop and mobile.

## Out of Scope

- No changes to ownership lookup, RLS, or `useOrgKpiDataOwnerNames` query.
- No changes to Send-Back / Request-Revision recipient resolution.
- No DB migration.
