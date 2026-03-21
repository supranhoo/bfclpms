

## Roll Back Reconciled February KPIs to Audit Stage

### Scope
- **18 KPIs** for **1 employee** (Y R V S Murthy, 200493) — February 2026 only
- January KPIs are left untouched

### What Happened
On March 13, the Workflow Reconciliation tool auto-advanced these 18 KPIs from `audit` → `approved`, setting `final_score` from the skip-level fallback. The employee's workflow still includes the `audit` stage, so these need to go back.

### Correction Steps

**Database updates (via insert/update tool):**

1. **`kpis` table** — For the 18 affected KPI IDs:
   - Set `status` = `'audit'`
   - Clear `final_score` = NULL, `final_rating` = NULL

2. **`review_submissions` table** — For matching submissions:
   - Set `kpi_status` = `'audit_review'` (the enum value for audit stage in submissions)
   - Clear `final_score` = NULL, `final_rating` = NULL

3. **`kpi_audit_logs`** — Insert a log entry for each KPI:
   - `action` = `'RECONCILIATION_REVERSED'`
   - `old_value` = `{"status": "approved"}`
   - `new_value` = `{"status": "audit"}`
   - `performed_by` = admin user ID

### Files Changed
None — this is a data-only correction using the database update tool.

