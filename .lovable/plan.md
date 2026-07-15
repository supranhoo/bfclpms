
## Findings

Employee master (`profiles.reporting_manager_id`) is already correct — all three report to **101131 Bhoopendra Kumar Sinha**:

| Emp | Name | Master manager |
|---|---|---|
| 101214 | Rahul Kumar | 101131 Bhoopendra Kumar Sinha ✅ |
| 101390 | Ajit Kumar Singh | 101131 Bhoopendra Kumar Sinha ✅ |
| 101675 | Bitu Prasad Pal | 101131 Bhoopendra Kumar Sinha ✅ |

But the **Annual Review 2025-2026 instances** were snapshotted with the wrong manager — **100860 Satyendra Kumar Singh**:

| Emp | Instance stage | Instance manager (current) | Target |
|---|---|---|---|
| 101214 | pending_self | 100860 Satyendra Kumar Singh | **101131 Bhoopendra Kumar Sinha** |
| 101390 | pending_self | 100860 Satyendra Kumar Singh | **101131 Bhoopendra Kumar Sinha** |
| 101675 | pending_self | 100860 Satyendra Kumar Singh | **101131 Bhoopendra Kumar Sinha** |

All three are still at `pending_self` — safe to swap the reviewer (per §AR-REVIEWER-RESYNC gate). No response data is impacted.

## Change

Single data update (no schema, no code):

```sql
UPDATE public.annual_review_instances
   SET manager_id = 'be186f10-5583-41df-86be-32df0b44bafb'  -- 101131 Bhoopendra
 WHERE cycle_id = 'b82a935f-05a3-4a18-a65c-215d2ef16c4c'    -- Annual Review 2025-2026
   AND employee_id IN (
     '26c343c3-e4c4-4147-b66b-e354270c0070',  -- 101214 Rahul Kumar
     '1389b385-a8ec-4ed8-9531-a7f3d225bb02',  -- 101390 Ajit Kumar Singh
     'a79de0df-5cfb-452c-a4cd-786b5782616a'   -- 101675 Bitu Prasad Pal
   )
   AND overall_status = 'pending_self';
```

Dept head / BU head are unchanged (they were already the correct ones for that department).

## Risk & Impact
- **Data**: 3 rows updated. Only `manager_id`. No self-review data touched.
- **Workflow**: Instances stay at `pending_self`. When each employee submits, the review will now route to 101131 instead of 100860.
- **UI**: 101131 will see these three in their Team Annual Review queue after self-submission; 100860 will no longer see them.
- **Regression**: None — master already matches; this only aligns the cycle snapshot with master.
- **Rollback**: Re-run UPDATE with the old manager id `042918c6-18e3-4ea3-af05-97c272b8e96d` if needed.

## Verification (post-apply)
Re-query the 3 instances and confirm `manager_id` shows Bhoopendra (101131).

## Note
Employee master is already correct, so nothing to change in `profiles`. If you also want the fix to auto-apply for any future cycle rebuild, that's already covered — this is only a one-time snapshot correction for the active 2025-2026 cycle.
