## Root Cause

`deleteTemplate` in `src/services/annualReview/annualReviewService.ts` (line 268-293) queries a column that doesn't exist:

```ts
db.from('annual_review_assignment_overrides')
  .select('id', { count: 'exact', head: true }).eq('template_id', id)
```

Confirmed against the live schema: `annual_review_assignment_overrides` has only `id, instance_id, role, new_reviewer_id, reason, created_by, created_at` — **no `template_id` column**. That table is for reviewer reassignment overrides (per operations memory), not per-employee template overrides. Per-employee template overrides live on `annual_review_instances.template_override_id` (already counted by the `instOverride` query).

The `.eq('template_id', ...)` request returns a PostgREST error (`column ... does not exist`) with a `code`/`hint` but the object thrown isn't an `Error` instance, so `toast.error(e.message)` renders as blank — matching the empty toast in the screenshot. Because the error is thrown before the actual `DELETE` runs, the template is never deleted.

## Risk & Impact

- **Data**: none — fixes a broken pre-flight check.
- **Workflow**: template deletion (previously always failing with blank error) starts working when there are truly no references. Reference-block messaging remains intact.
- **Regression**: `src/test/annualReview/deleteTemplate.test.ts` currently mocks the phantom `annual_review_assignment_overrides.template_id` query and must be updated to match the corrected surface.
- **Rollback**: single-file revert.

## Fix Plan

1. **`src/services/annualReview/annualReviewService.ts`** — `deleteTemplate`:
   - Drop the `annual_review_assignment_overrides` query entirely.
   - Keep `annual_review_assignment_rules`, `annual_review_instances.template_id`, `annual_review_instances.template_override_id` counts.
   - Update the blocking message to `Cannot delete — template is assigned to N rule(s), M live instance(s) (including per-employee overrides). Deactivate it instead.`
   - Harden error propagation: wrap `throw r.error` so a Supabase error object is rethrown as `new Error(r.error.message || 'Failed to check template references')` — prevents future blank toasts if any query breaks.

2. **`src/pages/annual-review/AnnualReviewAdmin.tsx`** — `del` mutation `onError`:
   - `toast.error(e?.message || 'Failed to delete template')` fallback so no toast is ever blank.

3. **`src/test/annualReview/deleteTemplate.test.ts`** — remove the `annual_review_assignment_overrides` branch and its `overrides` count from the fixtures/assertions; add a case asserting the mutation actually issues the final `DELETE` when only instances/rules are zero.

4. **DOCUMENTATION.md** — add BUG-047 entry: “Annual review template delete failed silently with blank toast — queried non-existent column on `annual_review_assignment_overrides`.”

5. **POLICY.md** — no policy change; add a one-liner under the Annual Review Templates section clarifying that per-employee template overrides are tracked via `annual_review_instances.template_override_id`, and `annual_review_assignment_overrides` is reviewer-reassignment only (matches existing operations memory).

## Verification

- `bunx vitest run src/test/annualReview/deleteTemplate.test.ts`
- Manually delete the `test 04` template shown in the screenshot — should either succeed (toast: “Template deleted”) or fail with a specific reference-count message.

## Not Applicable

UI layout, schema, or RLS changes.