

## Fix Propagation CORS Failure and [object Object] Display

Both fixes from the previous plan were **not actually applied** to the files. The edge function still has the old CORS headers, and `String()` is still used for object rendering. Here is the corrected plan:

### Issue 1: Edge Function CORS — request never reaches the function

The Supabase JS client sends headers like `x-supabase-client-platform` that are not in the `Access-Control-Allow-Headers` list. The browser blocks the preflight, so the function never executes (confirmed: zero logs).

| # | File | Change |
|---|------|--------|
| 1 | `supabase/functions/propagate-template-change/index.ts` (line 5) | Replace CORS headers with full set: `authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version` |

### Issue 2: `[object Object]` in Fields to Propagate

`String()` on arrays/objects produces `[object Object]`. Affects both `TemplateFormDialog.tsx` (lines 849, 851) and `TemplatePropagationPreview.tsx` (lines 67, 69).

| # | File | Lines | Change |
|---|------|-------|--------|
| 2 | `src/components/admin/TemplateFormDialog.tsx` | 849, 851 | Replace `String(change.old/new)` with a helper: if value is object/array, use `JSON.stringify(val)`, otherwise `String(val ?? '—')` |
| 3 | `src/components/admin/TemplatePropagationPreview.tsx` | 67, 69 | Same fix as above |

### Technical detail

```typescript
const fmt = (v: any) => v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);
```

Three files, three small edits. This will unblock propagation and fix the display.

