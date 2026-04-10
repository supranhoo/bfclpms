

## Fix: Re-percolate Multi-Month KPIs Stepped Back After Terminal Approval

### Root Cause

The "Admin Bulk Step Back" on April 5, 2026 correctly reverted multi-month KPIs that were prematurely reviewed (§58). However, it was too aggressive — it also stepped back **non-terminal sibling months** whose terminal siblings were already legitimately approved. The percolation trigger (`percolate_multimonth_score`) only fires when a terminal month transitions to `approved`, so these stepped-back siblings are now permanently stuck at `kra_set` with no submission data and no mechanism to recover.

**Scope**: 39 KPIs are immediately recoverable (terminal sibling is approved with `final_score`). 294 total multi-month KPIs are at `kra_set` across 2026 — the remaining 255 are genuinely pending (terminal not yet approved).

### Plan

**1. New edge function: `repair-stepped-back-siblings`**

A targeted repair function that:
- Finds multi-month KPIs at `kra_set` in 2026 where a sibling in the same cycle is already `approved` with a `final_score`
- For each, re-runs the percolation logic: copies the terminal's submission data, advances status to `approved`, sets `final_score`/`final_rating`
- Supports `mode: "scan" | "repair"` (same two-phase pattern as the existing repair tool)
- Returns detailed results with verification checks

**2. Add "Repair Stepped-Back Siblings" section to `DataRepairTab.tsx`**

- New card/section in the Data Repair tab
- Same two-phase UX: Scan → Select → Repair with confirmation dialog
- Shows employee name, KPI name, period, terminal sibling period/status/score
- Download scan/repair reports as Excel

**3. Prevent future recurrence: Guard the bulk step-back**

Update the bulk step-back migration/logic to **skip non-terminal siblings whose terminal month is already approved**. This ensures future step-backs only target KPIs that were genuinely reviewed prematurely, not their correctly-percolated siblings.

**4. Update DOCUMENTATION.md and POLICY.md**

- Document the sibling recovery tool
- Add §75: "Step-back operations must preserve non-terminal siblings when the terminal month is independently approved"
- Version bump

### Technical Details

**Edge function logic** (`repair-stepped-back-siblings`):
```text
1. Query: kpis WHERE status='kra_set', frequency IN (Bi-Monthly, Quarterly),
          review_year=2026
2. For each, find sibling via: same employee_id, kpi_name, review_year,
          status='approved' with final_score
3. Scan mode: return detail rows without modifying
4. Repair mode: 
   a. Copy terminal's review_submission fields to a new submission for the stuck KPI
   b. Update KPI status to 'approved', set final_score/final_rating
   c. Log audit entry with action='SIBLING_RE_PERCOLATION'
5. Post-repair verification (200 checks):
   - Verify repaired KPIs are at 'approved'
   - Verify submissions exist
   - Report remaining stuck count
```

**UI addition**: New collapsible section in DataRepairTab below the existing orphaned propagation repair.

### Files Changed
- **New**: `supabase/functions/repair-stepped-back-siblings/index.ts`
- **Modified**: `src/components/admin/DataRepairTab.tsx` — add sibling repair section
- **Modified**: `DOCUMENTATION.md` — version bump, document tool
- **Modified**: `POLICY.md` — add §75

### Risk Assessment
- **Data Safety**: Two-phase scan/repair with confirmation dialog; no auto-execution
- **Backward Compatible**: New function, no changes to existing percolation trigger
- **Regression Risk**: Low — only targets KPIs at `kra_set` with an approved terminal sibling

