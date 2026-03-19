

## KRA Library & Template Propagation — Issues & Fixes

After reviewing all related files, the system is largely functional. However, I found the following bugs and improvements:

### Bug 1: `useMemo` Used for Side Effects (KRALibrary.tsx, line 93)

```js
useMemo(() => { setCurrentPage(1); }, [searchQuery, categoryFilter, sortField, sortDir]);
```

`useMemo` must not trigger side effects like `setState`. This is a React anti-pattern that may cause inconsistent renders. Must be changed to `useEffect`.

### Bug 2: Revert Does Not Update the Template Record

When "Revert" is clicked in `TemplateChangeHistory`, it sends reversed `fields_changed` to the edge function, which updates linked KPIs. However, **the template record itself is never updated back** to the old values. This means the template and its linked KPIs become out of sync — the template shows the new value, but KPIs have the old value.

**Fix**: After the revert propagation succeeds, also call `useUpdateKpiTemplate` to patch the template with the reverted values.

### Bug 3: Duplicate Passes `created_by` Field

In `KRALibrary.tsx` line 115, the destructure `const { id, created_at, updated_at, kra_categories, ...rest } = template` still includes `created_by` in `rest`. If `created_by` has a foreign key constraint referencing the original creator, this may fail for other admins. Should also exclude `created_by`.

### Improvement 1: Tiered Frequency Uses Free-Text Input

For `uom_type === 'tiered'` (line 652-655), frequency is a plain `<Input>` instead of the `<Select>` dropdown used for numeric and binary types. This inconsistency means tiered templates can have arbitrary frequency strings.

### Improvement 2: Missing Error Handling on Duplicate

`handleDuplicate` (line 114-123) uses `mutateAsync` but doesn't catch errors. If the mutation fails, the unhandled promise rejection occurs silently. The `createTemplate` hook has `onError` toast, but `mutateAsync` throws — so the caller should handle it.

---

### Plan

| # | File | Change |
|---|------|--------|
| 1 | `KRALibrary.tsx` line 93 | Change `useMemo` to `useEffect` for resetting page |
| 2 | `KRALibrary.tsx` line 115 | Also exclude `created_by` from duplicate destructure |
| 3 | `KRALibrary.tsx` line 114-123 | Wrap `handleDuplicate` in try/catch |
| 4 | `TemplateChangeHistory.tsx` handleRevert | After propagation, also update the template record with reverted field values |
| 5 | `TemplateFormDialog.tsx` line 652-655 | Replace free-text Input with Select dropdown for tiered frequency (matching numeric/binary) |

