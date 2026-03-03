

# Fix: Correct Stale `final_score` on 3 Approved KPIs

## Problem
3 KPIs across the system have `status = 'approved'` but `final_score = 0` even though a later-stage reviewer (Auditor, HR PMS, or Management) gave a score of 5. This is a **data integrity issue** from approvals processed before the `final_score` sync logic was added.

### Affected Records
| Employee | KPI | Period | Auditor | Mgmt | Final (wrong) |
|---|---|---|---|---|---|
| 100264 – Sajid Raza | Incoming Quality of RM | Dec | 0 | 5 | 0 |
| 100894 – Parshu Ram Shukla | Customer Complaints | Jan | 0 | 5 | 0 |
| 100633 – Ramchandra Reddy | Adherence to Manning Norms | Dec | 5 | — | 0 |

## Root Cause
These KPIs were approved through a code path (likely ManagementScorecard or admin step-back) before the `final_score` sync logic existed. The current code already handles this correctly — no code fix needed.

## Fix: One-Time Data Migration

Run a SQL migration to retroactively fix all approved KPIs where `final_score` doesn't match the authoritative fallback chain:

```sql
UPDATE review_submissions rs
SET 
  final_score = COALESCE(rs.management_score, rs.auditor_score, rs.hr_pms_score, rs.skip_level_score, rs.manager_score, rs.self_score),
  final_rating = COALESCE(rs.management_rating, rs.auditor_rating, rs.hr_pms_rating, rs.skip_level_rating, rs.manager_rating, rs.self_rating)
FROM kpis k
WHERE rs.kpi_id = k.id
  AND k.status = 'approved'
  AND rs.final_score = 0
  AND (
    COALESCE(rs.management_score, rs.auditor_score, rs.hr_pms_score, rs.skip_level_score, rs.manager_score) > 0
  );
```

This updates only the 3 affected rows. No code changes needed — the existing approval paths already sync `final_score` correctly.

**1 DB migration, 0 file changes.**

