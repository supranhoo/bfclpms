

## Fixes for Propagation Failure and Display Bug

### Issue 1: Edge Function CORS Failure
The error "Failed to send a request to the Edge Function" is caused by missing CORS headers. The Supabase JS client sends additional headers (`x-supabase-client-platform`, `x-supabase-client-platform-version`, etc.) that are not listed in `Access-Control-Allow-Headers`, so the browser blocks the preflight OPTIONS request.

**Fix**: Update CORS headers in `supabase/functions/propagate-template-change/index.ts` line 3-6.

### Issue 2: `[object Object]` in Fields to Propagate Display
When `qualitative_options` (an array of objects) is changed, `String(change.old)` and `String(change.new)` render as `[object Object],[object Object]` instead of human-readable text.

**Fix**: In `src/components/admin/TemplateFormDialog.tsx` lines 849/851, use `JSON.stringify` for non-primitive values instead of `String()`.

---

### Plan

| # | File | Change |
|---|------|--------|
| 1 | `supabase/functions/propagate-template-change/index.ts` | Update `corsHeaders` to include all required Supabase client headers |
| 2 | `src/components/admin/TemplateFormDialog.tsx` | Fix `String()` rendering to handle objects/arrays with `JSON.stringify` or a label formatter |

