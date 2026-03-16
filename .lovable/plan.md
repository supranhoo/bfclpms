

# Fix: Duplicate KPI Error Still Showing Raw Message

## Diagnosis

The friendly error message fix IS correctly in place in `useCreateKpi` (line 372-374 of `useKpis.ts`). However, the screenshot may reflect a cached version of the app before the fix was deployed.

**To confirm**: Please do a hard refresh (Ctrl+Shift+R) and try again. If the friendly message appears, the fix is already working.

## Additional Hardening (Recommended)

There are **6 other code paths** that insert directly into the `kpis` table without the friendly duplicate error handling. These should all be patched for consistency:

| File | Line | Context |
|---|---|---|
| `AdminKpiEditorForm.tsx` | 341 | Bulk Apply copy |
| `SmartAssignmentDialog.tsx` | 247, 331 | Smart assignment |
| `BulkTemplateAssignDialog.tsx` | 185 | Bulk template assign |
| `CopyKrasDialog.tsx` | 229 | Copy KRAs |
| `KpiWeightageDashboard.tsx` | 390 | Already has partial handling ✅ |

### Changes

For each file above (except `KpiWeightageDashboard.tsx` which already handles it), update the error handler to detect `idx_kpis_no_duplicates` or `duplicate key` and show the user-friendly toast message instead of the raw database error.

Additionally, wrap the `mutateAsync` call in `AdminKpiCreateDialog.tsx` (line 265) in a `try/catch` to prevent unhandled promise rejection:

```typescript
try {
  await createKpi.mutateAsync({ ... });
  handleClose();
} catch {
  // Error already handled by useCreateKpi onError
}
```

This ensures the dialog stays open on error (currently `handleClose()` on line 298 would not execute on error anyway, but the explicit try/catch is cleaner).

### Files to modify
1. `src/components/admin/AdminKpiCreateDialog.tsx` — add try/catch
2. `src/components/admin/AdminKpiEditorForm.tsx` — friendly duplicate message
3. `src/components/admin/SmartAssignmentDialog.tsx` — friendly duplicate message (2 locations)
4. `src/components/admin/BulkTemplateAssignDialog.tsx` — friendly duplicate message
5. `src/components/admin/CopyKrasDialog.tsx` — friendly duplicate message

