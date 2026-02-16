

# Admin Rollback for Org-Level KPI to Data Entry

## What This Does

Adds a "Rollback to Data Entry" action for admins on propagated Org KPIs. Unlike the existing "Unlock" (which only allows editing), this fully reverses propagation -- clearing all pushed values from employee scorecards and resetting the org KPI back to a clean data entry state.

## Current Behavior vs. Requested

| Action | Current "Unlock" | New "Rollback to Data Entry" |
|--------|-----------------|------------------------------|
| Org KPI status | Changed to 'entered' | Reset to 'pending' |
| Employee review_submissions | Kept (old scores remain) | Cleared (achieved_value, self_score, self_rating nulled) |
| Employee KPI status | Unchanged | Reset to 'kra_set' (if still at 'self_review') |
| Data owner can re-enter | Yes | Yes (from scratch) |

## Changes

### 1. New Hook: `useRollbackOrgKpiPropagation` (new file)

A mutation hook that:
- Finds all employee KPIs matching the org KPI identity (category, KRA, KPI, period, year)
- Clears `achieved_value`, `self_score`, `self_rating` from their `review_submissions`
- Resets those KPIs' status back to `kra_set` (only if currently at `self_review`, to avoid overwriting downstream progress)
- Resets the `org_kpi_values` status to `pending` and clears the achieved value
- Logs the rollback in `org_kpi_data_entry_logs` with the admin's identity
- Notifies data owners via the notifications table

### 2. UI: Add "Rollback" Button to `OrgKpiEntryCard`

- Visible only to admins when status is `propagated`
- Sits alongside the existing "Unlock" button
- Uses a confirmation dialog warning: "This will clear propagated values from X employee scorecards and reset the KPI for fresh data entry."
- Requires a mandatory reason/justification (text input in the dialog)

### 3. Update `OrgKpiEntryCard` Props and Interface

- Add new `onRollback` callback prop: `(reason: string) => Promise<void>`
- Add rollback button with `RotateCcw` icon from lucide-react
- Add `sent_back` to the status config for the card's badge display

### 4. Wire Up in `OrgKpiDataEntry.tsx`

- Import and use the new rollback hook
- Pass the `onRollback` handler to each `OrgKpiEntryCard`

### 5. Update Documentation

- Update `DOCUMENTATION.md` with the new rollback capability

## Technical Details

### Rollback Hook Logic (pseudo-code)

```
1. Find all employee KPIs:
   SELECT id FROM kpis 
   WHERE category_id, kra_name, kpi_name, review_period, review_year, is_org_level = true

2. Clear their submissions:
   UPDATE review_submissions 
   SET achieved_value = null, self_score = null, self_rating = null 
   WHERE kpi_id IN (found KPI IDs)

3. Reset KPI status (only if at self_review):
   UPDATE kpis SET status = 'kra_set' 
   WHERE id IN (found KPI IDs) AND status = 'self_review'

4. Reset org_kpi_values:
   UPDATE org_kpi_values 
   SET status = 'pending', achieved_value = null, remarks = null, evidence_url = null
   WHERE category_id, kra_name, kpi_name, review_period, review_year

5. Log audit entry with reason

6. Notify data owners
```

### Files to Create/Modify

| File | Action |
|---|---|
| `src/hooks/useRollbackOrgKpiPropagation.ts` | **Create** -- new mutation hook |
| `src/components/admin/OrgKpiEntryCard.tsx` | **Modify** -- add Rollback button with confirmation dialog |
| `src/pages/admin/OrgKpiDataEntry.tsx` | **Modify** -- wire rollback handler |
| `DOCUMENTATION.md` | **Modify** -- document the feature |

### Safety Guardrails

- Only resets KPIs still at `self_review` stage (won't touch KPIs that have progressed further through the workflow)
- Mandatory reason field prevents accidental rollbacks
- Full audit trail logged for accountability
- Data owners receive notification about the rollback

