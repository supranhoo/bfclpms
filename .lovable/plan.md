## Root Cause

The Activate/Deactivate button on `Annual Review Admin → Templates` calls `svc.upsertTemplate({ id: t.id, is_active: !t.is_active })`.

`upsertTemplate` does a blind `.upsert(t)` against `annual_review_templates`. Postgres `INSERT ... ON CONFLICT` evaluates the `NOT NULL` constraint on `name` **before** the conflict resolver runs, so passing only `{ id, is_active }` fails with:

> null value in column "name" of relation "annual_review_templates" violates not-null constraint

This affects toggling activation on every template (you only noticed it on `test 04` because the active one toggled successfully before the regression, or because both flows hit the same path).

## Risk & Impact

- **Data:** None — failing INSERT, no row written.
- **Workflow:** Admins currently cannot activate/deactivate any template via this button.
- **Regression risk:** Low. The fix is scoped to one service function; full upserts (Create/Edit dialog) still send full payloads and must keep working.
- **Scalability/UI:** No change.

## Fix Plan (surgical)

### 1. `src/services/annualReview/annualReviewService.ts` — split upsert path
Change `upsertTemplate(t)` so that when `t.id` is provided we issue an `UPDATE` (only the supplied fields), and when no `id` is provided we issue an `INSERT` (full payload, requires `name`). Same external signature, same return shape.

```ts
export async function upsertTemplate(t: Partial<AnnualReviewTemplate>): Promise<AnnualReviewTemplate> {
  if (t.id) {
    const { id, ...patch } = t;
    const { data, error } = await db
      .from('annual_review_templates')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await db
    .from('annual_review_templates')
    .insert(t)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
```

No other call sites change — the Template Editor dialog, clone flow, and toggle button all continue calling `upsertTemplate` the same way.

### 2. Tests
- Add a unit test in `src/test/annualReview/` that mocks the Supabase client and asserts:
  - `upsertTemplate({ id, is_active: true })` issues an `update().eq('id', ...)` and **does not** require `name`.
  - `upsertTemplate({ name, sections, ... })` (no id) issues an `insert`.
- Re-run `templateEditorWeightGuard.test.tsx` to confirm the editor path is unaffected.

### 3. Docs (SSOT)
- `src/modules/annual-review/DOCUMENTATION.md` (or the existing annual-review docs section): add a short note under "Templates" — partial updates use UPDATE, full creates use INSERT. Activation toggles are a partial update.
- `mem/features/annual-review/overview.md`: one-liner under templates noting the partial-update contract for `upsertTemplate`.
- No `POLICY.md` change — business policy is unchanged.

## UI Changes
Not Applicable — same button, same labels, same behavior, just no error toast.

## Rollback
Revert the single function back to `.upsert(t)`. No schema change, no migration.

## Out of Scope
- The dynamically-imported-module error on `SystemSettings.tsx` (unrelated, transient HMR fetch).
- Reworking `upsertRule` similarly — call it out in the docs note but only refactor if/when a similar bug surfaces.
