

## RCA: Sent-Back Indicator Not Showing on Org KPI Scoped Table

### Root Cause

The `useSentBackOrgKpiEmployees` hook is **imported but never called** in `OrgKpiDataEntry.tsx` (line 10). The `sentBackMap` prop is never passed to `OrgKpiEntryCard`, so the amber highlight and Undo2 icon never render.

This was a wiring gap from the v2.14.0 implementation — the hook and UI were built correctly, but the connection between them was missed.

### Fix

**File: `src/components/admin/OrgKpiEntryCard.tsx`**

Move the sent-back detection **inside** `OrgKpiEntryCard` rather than relying on the parent to pass it. The card already has all required params (`data.categoryId`, `data.kraName`, `data.kpiName`, `reviewPeriod`, `reviewYear`).

- Import and call `useSentBackOrgKpiEmployees` directly inside the component
- Remove the `sentBackMap` optional prop from the interface (it becomes internal state)
- The hook is only enabled for scoped KPIs (employee/department scope), so no unnecessary queries for org-scope cards

**File: `src/pages/admin/OrgKpiDataEntry.tsx`**

- Remove the unused import of `useSentBackOrgKpiEmployees` (line 10) — it's now handled inside the card

**File: `DOCUMENTATION.md`** — Version history v2.14.1

**File: `POLICY.md`** — No changes needed (§30 already covers the invariant)

### Secondary Issue Check

The hook filters by `status: 'open'`. If the send-back query was auto-resolved (e.g., when the KPI was re-submitted), the indicator correctly disappears. This is the expected behavior based on `SentBackBanner` precedent. However, if the KPI was sent back but the query record uses a different status, we should also check — will verify during implementation.

### Risk Assessment
- **Regression**: Zero — purely additive wiring fix
- **Performance**: One additional query per scoped card; acceptable for admin page
- **Scope**: Wiring only; no logic or schema changes

