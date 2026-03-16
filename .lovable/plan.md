
Problem re-stated:
The raw database error is no longer the main problem. The user now sees a friendly toast, but it is still misleading: the dialog shows January 2026 while the app silently resolves a Quarterly KPI to March 2026. So the message says “already assigned for the selected review period,” even though the real duplicate is in the cycle-end month.

What I checked:
- `useCreateKpi` already shows the friendly toast.
- `AdminKpiCreateDialog` inserts with `getActiveMonthForCycle(frequency, reviewPeriod, reviewYear, ...)`, so January + Quarterly becomes March.
- `BulkTemplateAssignDialog` duplicate pre-check still queries `currentPeriod/currentYear` instead of the resolved period, so it can miss duplicates before insert.
- Web docs confirm uniqueness violations should be detected reliably via Postgres/PostgREST code `23505`, not only string matching.

Do I know what the issue is?
Yes.

Exactly what the problem is:
1. Manual KPI creation is using cycle-end month resolution internally, but the UI still labels the selection as `Review Period`, which makes January look like the storage month.
2. Duplicate messaging does not tell the user the actual effective month/year that caused the conflict.
3. Some bulk flows are inconsistent: they insert into the resolved month but validate or message against the unreconciled selected month.

Implementation plan:

1. Fix the user-facing meaning in manual assignment
- Update `src/components/admin/AdminKpiCreateDialog.tsx`
- Replace the current “Review Period / Review Year” wording with the same “Effective Month / Year” concept already used elsewhere, or add a live helper directly under the selectors:
  - Example: `Quarterly KPI selected in January 2026 will be assigned to March 2026.`
- Show the resolved month/year preview whenever frequency is multi-month.

2. Make duplicate errors explain the actual conflict period
- Update `src/hooks/useKpis.ts`
- Detect duplicates using:
  - `error.code === '23505'`
  - fallback to existing message/constraint checks
- Change the toast copy so it references the resolved effective month, not vague “selected review period”.
- Example outcome:
  - `This KRA/KPI is already assigned for March 2026 (effective month for the selected Quarterly cycle).`

3. Fix duplicate pre-checks to use resolved month/year
- Update `src/components/admin/BulkTemplateAssignDialog.tsx`
- Compute `resolvedPeriod` before querying existing KPIs, then compare against that resolved month/year.
- This prevents the app from saying “looks clear” for January and then failing on insert into March.

4. Standardize all direct KPI insert paths
Review and align these files so they all use the same duplicate interpretation and messaging:
- `src/components/admin/AdminKpiCreateDialog.tsx`
- `src/components/admin/BulkTemplateAssignDialog.tsx`
- `src/components/admin/BundleAssignDialog.tsx`
- `src/components/admin/SmartAssignmentDialog.tsx`
- `src/components/admin/CopyKrasDialog.tsx`
- `src/components/admin/AdminKpiEditorForm.tsx`

5. Centralize the duplicate message logic
- Add a shared helper (for example in `src/lib/...`) that:
  - detects duplicate errors consistently
  - formats the message with `frequency`, selected month/year, and resolved month/year
- This avoids 5+ slightly different toasts and future regressions.

Validation after implementation:
- Try assigning a Quarterly KPI with January 2026 selected when March 2026 already contains that KPI.
- Expected result: no raw DB error, and no misleading “selected review period” wording.
- For bulk template assignment, the duplicate warning should appear before insert if the effective month already has that KPI.
- Monthly KPIs should still behave exactly as before.

Files most likely to change:
- `src/hooks/useKpis.ts`
- `src/components/admin/AdminKpiCreateDialog.tsx`
- `src/components/admin/BulkTemplateAssignDialog.tsx`
- `src/components/admin/BundleAssignDialog.tsx`
- `src/components/admin/SmartAssignmentDialog.tsx`
- `src/components/admin/CopyKrasDialog.tsx`
- `src/components/admin/AdminKpiEditorForm.tsx`
