

# Analysis: Org KPI Data Owners & Governance Permissions

## Current State

Data Owners are **not integrated** with the Role Permission Matrix. Here's why:

1. **Data Owner is not a role** — It's a per-KPI assignment stored in `org_kpi_data_owners`, not part of the `app_role` enum (admin, manager, employee, etc.)
2. **OrgKpiDataEntry page never checks governance permissions** — It imports `useOrgKpiOwnershipMap` for access control but does NOT import or use `useReviewPeriodPermissions`
3. **The `check_review_period_permission` RPC** resolves permissions by Employee → Department → Role → Global hierarchy. It has no concept of "data owner" as a permission target

## The Gap

If an admin locks a review period (e.g., sets "Edit Scores" to OFF for the "employee" role), a Data Owner who holds the "employee" role would be blocked from the Role Permission Matrix — but the **Org KPI Data Entry page ignores governance entirely**, so they can still enter and propagate values freely.

This means:
- Governance locks on the Roles tab have **zero effect** on Org KPI data entry
- A period could be fully locked, yet data owners can still modify and propagate values

## Recommended Fix

Add governance awareness to the Org KPI Data Entry page:

### 1. Check governance permissions in `OrgKpiDataEntry.tsx`
- Import `useReviewPeriodPermissions` 
- Check `edit_scores` permission before allowing value entry
- Check `view_only` to disable all inputs when the period is locked
- Show the `GovernanceLockBanner` when restrictions apply

### 2. No changes to the Role Permission Matrix itself
Data Owners inherit their role's permissions (they are employees/managers who happen to also be data owners). The matrix already covers their underlying role — it just needs to be **enforced** on the data entry page.

### Files to Modify
- `src/pages/admin/OrgKpiDataEntry.tsx` — integrate `useReviewPeriodPermissions` hook, pass `isLocked` flag to entry cards, show governance banner
- `src/components/admin/OrgKpiEntryCard.tsx` — accept and respect a `governanceLocked` prop to disable inputs

### No database or RLS changes needed
The RPC and lock infrastructure already exist; this is purely a frontend enforcement gap.

