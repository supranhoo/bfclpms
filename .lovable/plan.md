

## Fix Repair Orphaned Propagations — Validation Findings

### Issues Found

1. **Category name bug**: Edge function queries `kpi_categories` table but the actual table is `kra_categories`. All category names return empty.

2. **Limit too low**: There are **1,125 org KPIs** stuck at `kra_set`, but the scan is capped at 200 (default) or 500 (max). Only 5 out of 200 checked were repairable — the remaining 925+ KPIs are never even scanned.

3. **No pagination**: The UI does a single scan call. With 1,125 records, multiple passes are needed.

### Plan

**1. Fix category table name in edge function**
- File: `supabase/functions/repair-orphaned-propagations/index.ts`
- Change `.from("kpi_categories")` to `.from("kra_categories")` (line 114)

**2. Increase limits and add multi-pass scanning**
- Increase max limit from 500 to 1500 in the edge function (`Math.min(body.limit, 1500)`)
- Update the UI to send `limit: 1500` for scan mode to capture all records in one pass
- If total exceeds limit, show a warning "X records checked out of Y total — run scan again for remaining"

**3. Add post-repair verification query**
- After repair completes, the edge function runs 2-3 verification checks (each `.limit(200)`):
  - **Check 1**: Query `kpis` where `id IN (repaired_ids)` and verify `status = 'self_review'`
  - **Check 2**: Query `review_submissions` where `kpi_id IN (repaired_ids)` and verify records exist
  - **Check 3**: Query remaining orphans (kpis with `is_org_level = true`, `status = 'kra_set'`, no review_submission) to report how many still need repair
- Add a `verification` object to the response: `{ kpis_verified: N, submissions_verified: N, remaining_orphans: N }`
- Display verification results in the UI after repair

**4. Update DOCUMENTATION.md and POLICY.md**
- Document the verification checks
- Version bump

### Files Changed
- `supabase/functions/repair-orphaned-propagations/index.ts` — fix table name, increase limits, add verification
- `src/components/admin/DataRepairTab.tsx` — display verification results, update limit
- `DOCUMENTATION.md` — version bump
- `POLICY.md` — update §74

