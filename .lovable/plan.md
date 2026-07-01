
## Root cause (verified against DB)

For employee `100735` (Manoj Kumar Mahato) in **June 2026**, the `kpis` table currently holds **0 rows**. So the Copy KRAs duplicate check should find 0 duplicates and the copy should succeed. Instead the UI toasts:

> Copy Failed — No KPIs to copy (all duplicates).

That message is thrown at `src/components/admin/CopyKrasDialog.tsx:207` only when `kpisToInsert.length === 0`, which means `duplicateMap` reported all 24 selected KPIs as duplicates at click time — a state that does not exist in the database.

Why the dialog sees phantom duplicates:

1. `<CopyKrasDialog>` is rendered **unconditionally** in `src/pages/admin/AllKpis.tsx` (only `open={isOpen}` is toggled). The component never unmounts, so its React Query cache — including `['copy-kras-target-existing', targetEmployeeIds, targetPeriod, targetYear]` — survives across open/close cycles.
2. When the admin deletes the target employee's KRAs elsewhere (KPI Editor, Bulk delete, etc.), those flows do **not** invalidate `copy-kras-target-existing`. On reopening the dialog, React Query returns the cached 24-row snapshot instantly.
3. There is also a race: even after adding invalidation, if the user clicks **Copy** before the background refetch completes, the mutation still uses the stale in-memory `duplicateMap`. There is no server-side re-check inside `mutationFn`.

The Copy button label showing "Copy 24 KRAs" while the toast reports "all duplicates" is possible when the fresh 0-row refetch lands between render and click; the safer fix must therefore also re-verify on submit.

## Fix (surgical, 3 files)

### 1. `src/pages/admin/AllKpis.tsx`
Conditionally mount the dialog so it fully resets on every open (state + query cache lifecycle):

```
{isCopyKrasOpen && (
  <CopyKrasDialog isOpen onClose={() => setIsCopyKrasOpen(false)} />
)}
```

### 2. `src/components/admin/CopyKrasDialog.tsx`

a. Harden the target-existing query so it always fetches fresh when the dialog opens:

```
useQuery({
  queryKey: ['copy-kras-target-existing', targetEmployeeIds, targetPeriod, targetYear],
  queryFn: ...,
  enabled: targetEmployeeIds.length > 0,
  staleTime: 0,
  refetchOnMount: 'always',
  refetchOnWindowFocus: true,
});
```
Apply the same to the source KPI query for symmetry.

b. **Re-verify duplicates inside `mutationFn` right before insert** (authoritative server read, ignores any React state race):

```
const { data: fresh } = await supabase
  .from('kpis')
  .select('employee_id, kra_name, kpi_name')
  .in('employee_id', targetEmployeeIds)
  .eq('review_period', targetPeriod)
  .eq('review_year', targetYear);

const freshDupes = new Map<string, Set<string>>();
(fresh ?? []).forEach(k => { /* build map */ });

// Rebuild kpisToInsert using freshDupes instead of the closured duplicateMap.
```
Only throw "all duplicates" when the fresh server read agrees.

c. On successful copy, also invalidate `['copy-kras-target-existing']` (so opening the dialog again reflects the just-inserted rows without needing a full remount).

### 3. Delete/bulk-delete call sites that already invalidate `['kpis']` / `['all-kpis']`

Add one more line: `queryClient.invalidateQueries({ queryKey: ['copy-kras-target-existing'] })` in the mutation success handlers for:
- `AdminKpiEditorForm.tsx` delete path
- `AllKpis.tsx` bulk-delete handler (search for existing `invalidateQueries(['all-kpis'])` calls)

This makes the cache correct even without the remount fallback in step 1.

## Tests (regression protection)

New unit test `src/components/admin/CopyKrasDialog.duplicateRefresh.test.tsx`:

- **Case A** — stale cache, DB empty: seed React Query cache with 24 fake duplicate rows for the target/period, mock `supabase.from('kpis').select(...)` inside `mutationFn` to return `[]`; assert insert is called with 24 rows and no "all duplicates" toast fires.
- **Case B** — genuine duplicates: mock the in-mutation fetch to return the same 24 kra_name/kpi_name pairs the source has; assert the throw fires and insert is never called.
- **Case C** — partial overlap (12 of 24 exist): assert exactly 12 rows are inserted.

Existing `useActiveEmployeesForCopy` and `formatKpiInsertError` tests are unaffected.

## Risk & impact

| Area | Impact |
|------|--------|
| Data | None — new logic only widens the pre-insert safety net; unique index `idx_kpis_no_duplicates` is still the DB backstop. |
| Workflow | None — behaviour only changes for the false-negative case that was blocking the admin. |
| UI/UX | No visible changes; dialog behaves the same on the happy path. |
| Regression | Low. All changes are additive query options / one extra pre-insert SELECT. |
| Performance | One extra ≤targetCount×1 SELECT on submit; negligible. |
| Rollback | Revert the three files. |

## Documentation updates (per project SSOT rule)

- `DOCUMENTATION.md` — add a note under Copy KRAs describing the pre-insert re-verification and dialog remount policy.
- `POLICY.md` — extend §94 (or the Copy KRAs section) with: *"Duplicate detection for Copy KRAs must be re-verified against the database inside the mutation; UI-cached duplicate maps are advisory only."*
- Append entry to `mem://features/admin/copy-kras-org-kpi-integrity` — v2.66.7.10: stale-cache false-duplicate fix.

## Immediate workaround for the user (no code change needed)

Hard-refresh the page (Ctrl+F5) and reopen Copy KRAs — the target-existing query will refetch and the 24 KRAs will copy successfully. The plan above prevents the situation from recurring.
