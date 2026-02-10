

# Remove 50-Error Limit from Background Import

## Problem

The background KPI import edge function (`supabase/functions/import-kpis/index.ts`) has a hard limit of **50 errors** at line 398:

```typescript
updateData.errors = JSON.stringify(updates.errors.slice(0, 50)); // Limit to 50 errors
```

This means when more than 2 users fail (or a single user like Komal Bansal has 70+ failed KRAs), only the first 50 error entries are stored in the `import_progress` table. The rest are silently discarded, so the report appears incomplete.

The foreground import has **no such limit** -- it collects all errors. The `ImportResultsSummary` component also has no limit and renders everything it receives. The bottleneck is solely in the edge function's `updateProgress` helper.

## Fix

### 1. Edge Function (`supabase/functions/import-kpis/index.ts`, ~line 398)

Remove the `.slice(0, 50)` limit. To avoid storing excessively large payloads, raise the cap to **500** errors (sufficient for any reasonable import):

```typescript
updateData.errors = JSON.stringify(updates.errors.slice(0, 500));
```

### 2. Documentation (`DOCUMENTATION.md`)

Update the import error reporting section to note the 500-error cap for background imports.

## Notes

- The `errors` column in `import_progress` is of type `Json` (jsonb), so there's no column-level size constraint -- it can hold thousands of entries
- 500 is a practical safeguard to prevent multi-MB JSON payloads in edge cases (10,000-row files with every row failing)
- The foreground import path is unaffected (no limit exists there)

