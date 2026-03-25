
RCA: the reconciliation scan is failing because the backend now has two different `reconcile_workflow_statuses` functions with the same name.

What I found
- The UI calls `supabase.rpc('reconcile_workflow_statuses', params)` from `src/components/admin/ReconcileOrphanedKpisDialog.tsx`.
- The database currently contains both of these function signatures:
  - `public.reconcile_workflow_statuses(p_review_period text, p_review_year integer, p_dry_run boolean, p_performed_by uuid)`
  - `public.reconcile_workflow_statuses(p_dry_run boolean, p_review_period text, p_review_year integer, p_performed_by uuid)`
- The new migration `supabase/migrations/20260325165114_6cc14266-336b-40f2-b6be-aeb858a1fa85.sql` changed the parameter order to put `p_dry_run` first.
- In PostgreSQL, changing parameter order creates a new overload instead of replacing the old function.
- PostgREST/Supabase RPC does not reliably support overloaded functions with the same argument names for JSON/named-parameter calls, so the RPC becomes ambiguous and the scan fails before any reconciliation logic runs.

Why this happened
- The earlier function existed with `p_review_period, p_review_year, p_dry_run, p_performed_by`.
- The latest migration introduced the same function name but reordered parameters.
- That unintentionally left two live versions in the database.
- The frontend passes named params, but PostgREST still sees two valid candidates and cannot choose one.

Why the UI shows only a generic error
- `handleOpenDryRun` in `ReconcileOrphanedKpisDialog.tsx` catches the RPC error and always shows:
  - “Failed to scan for workflow status issues.”
- So the real database ambiguity is hidden from the user.

Impact
- Dry-run scan fails.
- Execute reconcile would also fail for the same reason.
- The automation path in `supabase/functions/auto-reconcile-workflow/index.ts` is also affected because it calls the same RPC with the same function name.

Implementation plan to fix
1. Add a cleanup migration that removes the obsolete overload:
   - `DROP FUNCTION public.reconcile_workflow_statuses(text, integer, boolean, uuid);`
   - Keep only one canonical signature.
2. Standardize on one parameter order everywhere. Best choice is the long-standing order already used in the project/types:
   - `p_review_period, p_review_year, p_dry_run, p_performed_by`
3. Recreate/replace the surviving function with the full Class 4 logic included.
4. Regenerate backend types so `src/integrations/supabase/types.ts` reflects only one RPC signature.
5. Improve error handling in `ReconcileOrphanedKpisDialog.tsx` so the actual RPC error message is surfaced for future debugging instead of a generic toast.
6. Optionally audit recent migrations to ensure no other DB functions were “replaced” with reordered parameters, since the same bug pattern can recur.

Technical details
- Root cause is not RLS, frontend state, or the new Class 4 logic itself.
- Root cause is function overloading introduced by parameter reordering in a migration.
- This matches PostgREST documented behavior for ambiguous overloaded RPC functions (`PGRST203` class of issue).

Files involved
- `src/components/admin/ReconcileOrphanedKpisDialog.tsx`
- `supabase/functions/auto-reconcile-workflow/index.ts`
- `supabase/migrations/20260324130806_558c4eae-2e14-4303-9a34-9718932ea5c6.sql`
- `supabase/migrations/20260325165114_6cc14266-336b-40f2-b6be-aeb858a1fa85.sql`
- `src/integrations/supabase/types.ts`

Expected outcome after fix
- The scan dialog should open and return dry-run results normally.
- The 92 “scored not forwarded” KPIs should become visible in the reconciliation preview.
- Manual execute and auto-reconcile should both work again.
