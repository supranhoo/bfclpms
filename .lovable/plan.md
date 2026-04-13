
Fix the remaining deep-link bug so observation notifications open the specific KPI details sheet, not just the employee dashboard.

What I found
- Inbox routing is now mostly correct: observation workflow notifications already build `/dashboard?view=...&employee=...&kpi=...`.
- The remaining bug is in dashboard deep-link handling:
  - `Dashboard.tsx` reads `employee` + `kpi` and selects the employee.
  - But reviewer/admin flows only pass `autoOpenKpiId` into `UnifiedScorecard`.
  - In `UnifiedScorecard.tsx`, auto-open currently works only for self mode (`selectedKpiForSelfReview`).
  - Reviewer modes (`team`, `audit`, `management`, `hr_pms`) do not auto-open `reviewSheetOpen`, so the app lands on the employee scorecard page instead of opening “View KPI Details”.

Implementation plan

1. Add reviewer deep-link auto-open in `UnifiedScorecard.tsx`
- Extend the existing auto-open logic to support non-self modes.
- When `autoOpenKpiId` matches a KPI in reviewer mode:
  - set `selectedKpi`
  - open the reviewer sheet (`setReviewSheetOpen(true)`)
- If the KPI belongs to another period, first switch period selection, then auto-open after data reload.

2. Support panel-aware opening for reviewer mode
- Preserve and wire `panel` query param from `Dashboard.tsx`.
- If `panel=queryHistory`, open the KPI details sheet and then auto-open Query History in reviewer mode too.
- Keep existing self-mode behavior unchanged.

3. Make deep-link processing more reliable in `Dashboard.tsx`
- Refine the cross-user deep-link effect so it does not stop after only selecting employee.
- Ensure one-time URL cleanup happens after the KPI sheet/open-panel state has been initialized correctly.
- Keep `employee` persistence behavior for refresh restoration.

4. Add regression tests and mocks
- Add/expand tests for:
  - admin opening another employee’s observation reply -> employee selected + KPI details sheet opens
  - auditor/management role deep-link -> correct view + KPI sheet opens
  - mention notification still opens read-only mention sheet only
  - `panel=queryHistory` opens query history from deep link
  - fallback when KPI is in another period/year
- Add/update realistic mock notification/deep-link fixtures per policy.

5. SSOT + policy sync
- Update `DOCUMENTATION.md`
- Update `POLICY.md`
- Record that inbox observation workflow links must deep-link to the target employee KPI detail sheet, not merely the employee dashboard page.

Risk & Impact Report
- Data impact: none; frontend-only behavior fix.
- Workflow impact: improves reviewer/admin navigation without changing permissions or scoring.
- UI/UX consistency: aligns inbox “Open in App” with user expectation by opening “View KPI Details”.
- Regression risk: medium-low because `UnifiedScorecard` is shared across review modes.
- Mitigation plan: isolate logic to deep-link handling, preserve mention flow, add explicit regression tests for self vs reviewer modes and panel behavior.

Expected result
- If Jaspal clicks “Open in App” on an observation notification for another employee, the app opens that employee context and directly opens the target KPI’s “View KPI Details” sheet.
- If the notification is a mention, it still opens the separate read-only mention sheet.
- If the deep-link includes query history, that panel opens automatically inside the KPI details flow.
