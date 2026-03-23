

## RCA: Why Sent-Back KPIs Were Not Rolled Back

### Root Cause

The previous rollback identification query was **too narrow**. It only checked `kpi_queries` table for `query_type = 'send_back'` records. However, **auditor and management send-backs are recorded in `kpi_audit_logs`** (actions like `AUDITOR_SENT_BACK_TO_EMPLOYEE`, `MANAGEMENT_SENT_BACK_TO_AUDITOR`, etc.), NOT in `kpi_queries`.

For employee 100856 Feb:
- Auditor sent back "Ensure project retention" on Mar 15 (action: `AUDITOR_SENT_BACK_TO_EMPLOYEE`)
- Auditor sent back "CCTV Surveillance" on Mar 15 (action: `AUDITOR_SENT_BACK_TO_EMPLOYEE`)
- Both were then auto-scored zero on Mar 21

These KPIs had **no `kpi_queries` record**, so the rollback query missed them entirely.

### Still-Penalized KPIs (11 total, all with `status: approved`, `final_score: 0`)

| Employee | Code | Period | KPI (truncated) |
|----------|------|--------|-----------------|
| Nitesh Baldwa | 100012 | Jan 26 | Timely payments as per SOP |
| Nitesh Baldwa | 100012 | Jan 26 | Lifting of balance BL quantity |
| Biswajit Sahoo | 100426 | Feb 26 | Days compliance for report |
| Biswajit Sahoo | 100426 | Feb 26 | Timely submission of HR MIS |
| Prakash Kumar Sinha | 100840 | Feb 26 | Payment receipts and reconciliation |
| **Abhas Luharuwalla** | **100856** | **Feb 26** | **Ensure Availability of CCTV** |
| **Abhas Luharuwalla** | **100856** | **Feb 26** | **Ensure project retention** |
| Chandra Bhan Singh | 101680 | Feb 26 | Preventive maintenance |
| Dippendu Das | 101773 | Jan 26 | No Material shortage in USA |
| Dippendu Das | 101773 | Jan 26 | Accounts reconciliation - USA |
| Rakesh Kumar Gupta | 101902 | Jan 26 | Compliance to TAT for In-bound |

### Fix Plan

#### 1. Database migration — Rollback all 11 KPIs

For each of the 11 KPI IDs:
- Set `kpis.status` back to `self_review`
- Clear `review_submissions`: `auto_advance_reason = NULL`, `self_score = NULL`, `self_rating = NULL`, `self_remarks = NULL`, `final_score = NULL`, `final_rating = NULL`, `achieved_value = NULL`
- Insert audit log entry: action `PENALTY_ROLLBACK`, recording reason

#### 2. Fix the edge function — `supabase/functions/auto-lock-review-periods/index.ts`

Update the sent-back detection to check **both** sources:
- `kpi_queries` where `query_type = 'send_back'` (existing)
- `kpi_audit_logs` where action matches `%SENT_BACK%` (new)

Merge both sets into a single `sentBackIds` Set before filtering eligible KPIs.

### Files Modified
- `supabase/functions/auto-lock-review-periods/index.ts` — broaden sent-back detection
- Database migration — rollback 11 wrongly penalized KPIs

