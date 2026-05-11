## Risk & Impact Report

- **Data Impact:** No business data will be changed. This is a database function signature/body correction only.
- **Workflow Impact:** No workflow or permission rules change. Existing role scoping remains the same.
- **UI/UX Consistency:** No visual changes. The existing Management Review cards should populate once KPI data loads correctly.
- **Regression Risk:** Low, but this function feeds HR PMS, Audit, and Management reviewer dashboards, so a type mismatch can break all three.
- **Mitigation Plan:** Add a migration that explicitly casts enum/varchar/text-mismatch fields to the declared return types, then add a regression test that pins these casts so future RPC edits do not reintroduce the 400 error.

## Root Cause

The browser network log shows this failing request:

```text
POST /rpc/get_reviewer_kpis_for_period
400: Returned type review_status does not match expected type text in column 6
```

Because `kpis.status` is a database enum (`review_status`) but the RPC declares `status text`, the entire KPI fetch fails. That leaves `periodKpis` empty, so the dashboard correctly renders 0 employees/KPIs even though data exists.

## Implementation Plan

1. **Fix the KPI period RPC**
   - Create a new migration replacing `public.get_reviewer_kpis_for_period`.
   - Keep the same access/scoping logic.
   - Cast mismatched fields explicitly, especially:
     - `k.status::text`
     - `k.r5::numeric`, `k.r4::numeric`, etc. only if safe, or change return type to match actual text thresholds if needed
     - `k.day_count_type::text`
   - Preserve the 30s statement timeout for this reporting helper.

2. **Validate the backend function directly**
   - Run a read-only DB check that the function can return rows for March 2026.
   - Confirm it no longer throws the enum/text mismatch.

3. **Add regression coverage**
   - Extend `src/test/bugBountyFixes.test.ts` to assert the latest `get_reviewer_kpis_for_period` migration casts `k.status::text` (and other declared text fields as needed).
   - This prevents future edits from returning database enum types into text columns again.

4. **Update SSOT documentation**
   - Append `DOCUMENTATION.md` version history with the root cause and fix.
   - Add/update `POLICY.md` reviewer-dashboard rule: backend reporting RPCs must explicitly cast enum/varchar fields to their declared return types and fail visibly, not silently degrade to zero.

5. **Post-fix confirmation**
   - Re-check the preview network signal for `/rpc/get_reviewer_kpis_for_period` returning 200.
   - Confirm the Management Review stat cards are no longer caused by an empty KPI dataset.