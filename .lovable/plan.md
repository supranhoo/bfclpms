

## RCA: Comments and Auto-Advance Reason Not Percolating to Sibling Months

### Root Cause

The `percolate_multimonth_score()` trigger copies only these fields to sibling month submissions:
- Scores: `self_score`, `manager_score`, `skip_level_score`, `hr_pms_score`, `auditor_score`, `management_score`, `final_score`
- Ratings: all corresponding `*_rating` columns
- `achieved_value`, `is_na`

**Missing from percolation:**
- `self_remarks`, `manager_remarks`, `skip_level_remarks`, `hr_pms_remarks`, `auditor_remarks`, `management_remarks`
- `auto_advance_reason`
- Evidence URLs: `self_evidence_urls`, `manager_evidence_urls`, `skip_level_evidence_urls`, `hr_pms_evidence_urls`, `auditor_evidence_urls`, `management_evidence_urls`
- Achieved values per level: `manager_achieved_value`, `auditor_achieved_value`, `management_achieved_value`, `skip_level_achieved_value`, `hr_pms_achieved_value`

### Fix

**Single migration** — update `percolate_multimonth_score()` to include all remarks, `auto_advance_reason`, evidence URLs, and per-level achieved values in both the INSERT and ON CONFLICT UPDATE clauses.

**Data repair** — backfill existing sibling records that have null remarks but whose terminal month has remarks, using a single UPDATE...FROM query.

### Changes

| Item | Detail |
|------|--------|
| SQL migration | Recreate `percolate_multimonth_score()` with all missing columns |
| SQL data repair (insert tool) | Backfill remarks, auto_advance_reason, evidence URLs for existing percolated records |
| `DOCUMENTATION.md` | v2.15.49 entry |

### Columns to add to percolation INSERT/UPDATE

```text
self_remarks, manager_remarks, skip_level_remarks,
hr_pms_remarks, auditor_remarks, management_remarks,
auto_advance_reason,
self_evidence_urls, manager_evidence_urls, skip_level_evidence_urls,
hr_pms_evidence_urls, auditor_evidence_urls, management_evidence_urls,
manager_achieved_value, auditor_achieved_value, management_achieved_value,
skip_level_achieved_value, hr_pms_achieved_value
```

### Risk
- Low — additive change only; existing score percolation logic unchanged
- Backfill only touches records already identified as percolated via audit logs

