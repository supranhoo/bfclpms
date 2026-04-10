
## Plan: Fix Completed Dec-Jan / Cross-Year KPIs Still Showing at KRA Set

### What I found
The current repair flow does not fully cover the case in your screenshot.

- The Apr 5 migration reset January 2026 Bi-Monthly KPIs using only `frequency='Bi-Monthly' AND review_period='January'`, which incorrectly included completed **Dec-Jan** cycles.
- There was an earlier one-time restore migration for Jan 2026 from Dec 2025, but the **new repair tool** only searches:
  - KPIs currently at `kra_set`
  - siblings in the **same `review_year`**
  - terminal month resolved from the current month’s cycle map
- Because of that, a KPI whose journey was already completed but whose terminal approval sits in the **previous calendar year** can still remain stuck at `kra_set` and be missed by the repair tool.

### Root cause
For Dec-Jan type cycles, the January KPI may need to be restored from a terminal sibling in **December of the previous year**.  
The current `repair-stepped-back-siblings` function only looks up:
```text
employee_id + kpi_name + review_year
```
So it misses cross-year cycle pairs like:
```text
December 2025 -> January 2026
```

### Risk & Impact Report
- **Data impact:** No new tables required. Logic change only, but it affects sensitive historical KPI recovery, so audit logging and verification must remain strict.
- **Workflow impact:** Restored KPIs should only be moved back to `approved` when the linked terminal cycle was genuinely completed and already finalized.
- **UI/UX impact:** Minimal. Existing Data Repair flow can stay the same, but scan results should clearly identify “cross-year terminal sibling” cases.
- **Regression risk:** Medium, because multi-month cycle logic is already complex and must not re-open the Feb-Mar contamination problem.
- **Mitigation:** Add explicit cycle-aware cross-year matching, narrow eligibility rules, test Dec-Jan and same-year cycles separately, and keep scan → select → repair confirmation.

### Implementation plan

**1. Extend `repair-stepped-back-siblings` to support cross-year terminal matching**
- Update sibling lookup logic so it does not assume `terminal sibling.review_year === current KPI.review_year`.
- Add cycle-aware year resolution:
  - same-year sibling recovery for normal Jan-Feb / Jan-Mar style cycles
  - previous-year terminal recovery for Dec-Jan style Bi-Monthly cycles
- Match using a stronger key:
  - `employee_id`
  - `kpi_name`
  - `kra_name`
  - `frequency`
  - resolved terminal `review_period`
  - resolved terminal `review_year`

**2. Add a dedicated “already completed journey” eligibility guard**
Only mark a KPI as repairable when:
- current KPI is `kra_set`
- it is a non-terminal sibling that should have inherited the final result, or a cross-year January member of a completed Dec-Jan cycle
- terminal KPI is already `approved`
- terminal submission has non-null `final_score`

This prevents accidentally restoring genuinely pending KPIs.

**3. Improve repair scan output**
Enhance the detail rows to show:
- source terminal period
- source terminal year
- whether the repair is `same_year` or `cross_year`
- clearer reason labels for:
  - `cross_year_terminal_recoverable`
  - `same_year_terminal_recoverable`
  - `terminal_not_found`
  - `terminal_not_finalized`

This will make it obvious why a KPI is still at KRA Set.

**4. Keep repair mode strict and auditable**
When repairing:
- copy the terminal submission data
- set KPI back to `approved`
- write a clear audit log entry with:
  - source terminal KPI id
  - source period/year
  - recovery mode (`same_year` / `cross_year`)
  - repair tool name

**5. Add regression tests and mock scenarios**
Per project policy, add tests for:
- Dec 2025 terminal approved → Jan 2026 sibling at `kra_set` gets detected
- Same-year sibling recovery still works
- Terminal month at `kra_set` is not repairable
- Terminal approved but no `final_score` is not repairable
- Feb-Mar logic is not confused with Dec-Jan logic

Also add realistic mock data for completed and incomplete 2026 multi-month journeys.

**6. Update the admin repair UI messaging**
In `SiblingRepairSection.tsx`:
- update text to mention cross-year completed cycles
- surface source period/year in the results table/export
- optionally add a filter badge for `Cross-Year Recovery`

**7. Update SSOT docs and policy**
Update both:
- `DOCUMENTATION.md`
- `POLICY.md`

Document that:
- multi-month repair must support cross-year cycle recovery
- step-back protection and remediation must be cycle-aware across year boundaries
- completed Dec-Jan journeys must never remain stranded at `kra_set` after a bulk rollback

### Files to update
- `supabase/functions/repair-stepped-back-siblings/index.ts`
- `src/components/admin/SiblingRepairSection.tsx`
- `DOCUMENTATION.md`
- `POLICY.md`
- test/mock files for the repair function

### Expected outcome
After this fix:
- KPIs like the one in your screenshot, whose journey was already finalized before the Apr 5 reset, will appear in the repair scan
- admins can explicitly repair them from the correct terminal sibling
- future missed cross-year cases in 2026 will be covered by the same tool instead of requiring another special one-off migration
