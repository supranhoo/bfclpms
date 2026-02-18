
# Rollback: Jaspal's Org KPI Propagation — "Adherence to Manning Norms" (February 2026)

## What Happened

Jaspal (as Data Owner) propagated values for the **"Adherence to Manning Norms"** KPI (under "Adherence to Monthly Budget" category) across **27 different department scopes** for February 2026. Each scope had a different achieved value (ranging from 71 to 112).

Because this is a department-scoped org KPI, the propagation pushed values to **27 employees × 27 KPIs each** = **729 review_submissions** records. All 729 affected employee KPIs are currently at `self_review` status (meaning no employee has submitted a self review yet — the propagated value is sitting there waiting).

## Scope of the Rollback

| Item | Count |
|---|---|
| Org KPI value records (scoped entries) | 27 |
| Employee KPIs affected (`review_submissions`) | 729 |
| Unique employees affected | 27 |
| Current employee KPI status | All at `self_review` |

Since all affected KPIs are still at `self_review` (no employee has reviewed beyond that), the rollback is clean — no downstream data will be lost.

## What the Rollback Will Do

1. **Clear `review_submissions`** — Set `achieved_value`, `self_score`, `self_rating` to NULL for all 729 records tied to this org KPI's employee KPIs
2. **Reset employee KPI status** — Revert all 729 KPI records from `self_review` back to `kra_set`
3. **Reset org KPI value status** — Reset all 27 `org_kpi_values` records from `propagated` back to `pending`, and clear their `achieved_value`, `remarks`, `evidence_url`
4. **Log the rollback** — Insert an audit entry in `org_kpi_data_entry_logs` for each of the 27 scoped records
5. **Notify Jaspal** — Send a notification that the propagation has been rolled back

## Files to Modify

No files need to be changed. This is a **data-only rollback** — the admin simply uses the existing "Rollback to Data Entry" button on the Org KPI Data Entry page (`/admin/org-kpi-data-entry`).

## Admin Action Steps

The rollback is already built into the system via the `useRollbackOrgKpiPropagation` hook. Here is exactly what the admin (Ankit Choudhary) needs to do:

1. Navigate to **Admin → Org KPI Data Entry**
2. Select period: **February 2026**
3. Find the KPI: **"Adherence to Manning Norms"** (under "Adherence to Monthly Budget")
4. Since there are 27 scoped entries (one per department), each entry card will show a **"Rollback to Data Entry"** button (admin-only)
5. Click rollback on each department scope that needs to be reversed, entering a reason each time

However, since there are 27 scopes to roll back individually through the UI, and the user is asking for this to be done now, I can also build a **one-click bulk rollback** UI feature or use a database-level fix.

## Recommended Approach: Build a Bulk Admin Rollback Action

Since 27 individual rollbacks through the UI would be tedious, I will add a **"Rollback All Scopes"** action at the category level on the Org KPI Data Entry page. This lets the admin roll back all department-scoped entries for a single KPI name in one click, with a single reason.

### Technical Changes

**`src/hooks/useRollbackOrgKpiPropagation.ts`** — Extend the existing hook to support rolling back all scoped entries for a KRA+KPI combination across all departments/employees in one mutation call. The hook already handles single-category rollbacks; we extend it to loop over all matching `org_kpi_values` records.

**`src/components/admin/OrgKpiEntryCard.tsx`** — Add a "Rollback All Scopes" button at the card level that triggers the bulk rollback when multiple department scopes exist for the same KPI name.

**`DOCUMENTATION.md`** — Version bump to 1.45.16

## Database Impact

All 27 `org_kpi_values` records will go from `propagated` → `pending` (achieved_value cleared).
All 729 `review_submissions` records will have `achieved_value`, `self_score`, `self_rating` set to NULL.
All 729 employee `kpis` records will go from `self_review` → `kra_set`.

This is a fully reversible operation — Jaspal can re-enter and re-propagate correct values after the rollback.

## Technical Notes

- No migration needed — existing tables and columns handle this
- The `useRollbackOrgKpiPropagation` hook already handles single-scope rollback correctly; we extend its interface to accept an array of category/kra/kpi combos and loop
- All 27 org_kpi_values records share the same `kra_name` and `kpi_name` but differ by `department_id` — the rollback query uses `kra_name` + `kpi_name` + `category_id` to target all of them at once
- No employee has progressed past `self_review` so there is zero risk of data loss
