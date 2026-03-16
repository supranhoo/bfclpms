
Detailed RCA

What I checked
- `src/hooks/useKpis.ts`
- `src/lib/kpiErrorUtils.ts`
- `src/components/admin/AdminKpiCreateDialog.tsx`
- `src/components/admin/BulkTemplateAssignDialog.tsx`
- `src/components/admin/BundleAssignDialog.tsx`
- `src/components/admin/SmartAssignmentDialog.tsx`
- `src/components/admin/CopyKrasDialog.tsx`
- The latest screenshot you shared
- External docs for PostgREST/Supabase uniqueness error handling (`23505`)

What the screenshot proves
- The toast text in the screenshot exactly matches the fallback string in `src/lib/kpiErrorUtils.ts`:
  `This KRA/KPI is already assigned to this employee for the selected review period...`
- So the app is no longer showing the raw DB constraint error. The remaining problem is that it is still showing the generic fallback message instead of the resolved effective month.

Do I know what the issue is?
Yes.

Exactly what the issue is
1. `AdminKpiCreateDialog.tsx` resolves multi-month KPIs to a terminal month before insert:
   - `getActiveMonthForCycle(frequency, reviewPeriod, reviewYear, frequencyCycleStart || null)`
2. But `useCreateKpi()` still builds the toast like this:
   - `getDuplicateKpiMessage()` with no `selectedMonth`, `resolvedMonth`, `frequency`, or `selectedYear`
3. Because that context is missing, manual KPI creation can only show the generic fallback:
   - “for the selected review period”
4. The dialog UI is still misleading:
   - it still says `Review Period / Review Year`
   - it still offers `Q1/Q2/Q3/Q4`
5. That is inconsistent with the rest of the admin assignment flows, which use `EffectiveMonthSelector` and month-based input.
6. There is also a hidden logic bug: `getMonthNumber()` falls back to January for unknown values. So if this dialog allows `Q2/Q3/Q4`, the resolution logic can map them incorrectly.
7. Some bulk flows are still inconsistent too:
   - `SmartAssignmentDialog.tsx` checks existing KPIs using `currentPeriod/currentYear`
   - but inserts into `resolvedPeriod`
   - so duplicate pre-checks can still miss multi-month duplicates and only fail at insert time

Root cause summary
- Duplicate detection is working.
- The remaining bug is a context-loss + UI-semantics issue:
  - the insert happens in the resolved month
  - the error message is built without that resolved month
  - the dialog still presents the selection as a review period instead of an effective month

Plan to fix

1. Fix the manual create mutation contract
- Refactor `useCreateKpi()` so the mutation receives:
  - the DB payload
  - error-display context (`frequency`, `selectedMonth`, `resolvedMonth`, `selectedYear`)
- In `onError`, replace:
  - `getDuplicateKpiMessage()`
- with:
  - `formatKpiInsertError(error, context)`
- This directly fixes the exact toast shown in your screenshot.

2. Fix the manual create UI wording
- Update `AdminKpiCreateDialog.tsx` to use the same effective-month concept already used in the other assignment dialogs.
- Replace `Review Period / Review Year` with `Effective Month / Year`.
- Remove `Q1/Q2/Q3/Q4` from this dialog entirely.
- Use month-only input so the selection matches how `getActiveMonthForCycle()` actually works.

3. Add a live effective-month preview
- In `AdminKpiCreateDialog.tsx`, show a helper whenever the resolved month differs from the selected month.
- Example:
  `Quarterly KPI selected in January 2026 will be assigned to March 2026.`
- This prevents users from being surprised by duplicates that exist in the cycle-end month.

4. Align duplicate pre-checks with resolved periods
- Update `SmartAssignmentDialog.tsx` to check duplicates against resolved periods, not just the selected month.
- Review `BundleAssignDialog.tsx`, `BulkTemplateAssignDialog.tsx`, and `CopyKrasDialog.tsx` so all duplicate checks and toasts use the same selected-vs-resolved logic.
- Goal: avoid “no duplicate warning before insert, then DB reject” behavior.

5. Harden the shared utility
- Keep `error.code === '23505'` as primary detection.
- Use `formatKpiInsertError()` everywhere duplicate KPI inserts can happen.
- Standardize message priority:
  - resolved month/year
  - selected month/year as fallback
  - generic period only if no context exists

Files to update
- `src/hooks/useKpis.ts`
- `src/lib/kpiErrorUtils.ts`
- `src/components/admin/AdminKpiCreateDialog.tsx`
- `src/components/admin/SmartAssignmentDialog.tsx`
- `src/components/admin/BundleAssignDialog.tsx`
- `src/components/admin/BulkTemplateAssignDialog.tsx`
- `src/components/admin/CopyKrasDialog.tsx`

Validation after implementation
- Manual create:
  - Quarterly KPI
  - selected month = January
  - duplicate already exists in March
  - expected toast: mentions March explicitly, not “selected review period”
- Monthly KPI:
  - selected month and stored month remain the same
  - expected behavior unchanged
- Manual dialog:
  - no `Q1/Q2/Q3/Q4` options
  - effective month preview appears for multi-month frequencies
- Smart/bulk assignment:
  - duplicate pre-checks match the resolved insert month
  - fewer insert-time duplicate surprises

Why this plan should solve the reported issue
- The toast in the screenshot is coming from the generic fallback branch, not from failed duplicate detection.
- Passing resolved-month context into the create hook and fixing the dialog semantics addresses the exact mismatch the user is still seeing.
