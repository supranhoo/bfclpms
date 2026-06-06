## Goal
The reviewer-stage dropdown on `Bulk Review (Beta)` currently shows all 6 stages to every user. Restrict the visible options to those the signed-in user is actually entitled to act as.

## Visibility matrix

| Effective role | Options shown in dropdown |
|---|---|
| `admin` | All six (Manager, Functional Manager, Skip-Level, HR PMS, Auditor, Management) |
| `manager` | Manager (+ Functional Manager only if the user is set as `functional_manager_id` on at least one active profile) |
| `skip_level` | Skip-Level |
| `hr_pms` | HR PMS |
| `auditor` | Auditor |
| `management` | Management |
| `employee` / other | (no options — the page is already feature-flag gated, so this is a defensive empty state) |

Note: there is no `functional_manager` app_role. "Functional Manager" is a relationship — a user acts as one when another active profile points to them via `profiles.functional_manager_id`. So a `manager` who is also referenced as a functional manager will see **both** Manager and Functional Manager. This matches how `workflowResolver.ts` and `workflowEngine.ts` already treat the stage.

## Risk & Impact Report
- **Data:** none — UI-only filter on a static option list plus one `count: 'exact', head: true` query on `profiles`.
- **Workflow:** none — RPC payload still sends `viewerStage`; we just constrain which value the user can pick.
- **UI:** dropdown becomes shorter for non-admins; if only one option is allowed it is auto-selected and the trigger still renders (no layout shift). Default `viewerStage` initializer in `BulkReviewDashboard` already maps role → stage; we'll keep it and clamp it to the allowed set.
- **Regression:** admin behavior unchanged. Existing URL deep-links carrying a `viewerStage` the user isn't allowed to use will fall back to the first allowed stage (logged via toast? No — silent, consistent with current default-pick behavior).
- **Scalability:** one cached count query per session (staleTime 5 min), gated on `effectiveRole === 'manager'`. Negligible.
- **Rollback:** revert the single file; no schema or RPC change.

## Plan

1. **`src/pages/review/BulkReviewDashboard.tsx`** — replace the constant `VIEWER_STAGES` consumption with a `useMemo` that filters by `effectiveRole`. Add a small `useIsFunctionalManager()` hook call (see step 2) so the Functional Manager option appears for managers who actually own that relationship. Clamp `viewerStage` state to the allowed list inside an effect (if current value not allowed → set to `allowed[0]`).

2. **`src/hooks/useIsFunctionalManager.ts`** (new, ~20 lines) — `useQuery` that runs `supabase.from('profiles').select('id',{count:'exact',head:true}).eq('functional_manager_id', user.id).eq('is_active', true)`. Returns `boolean`. `staleTime: 5 * 60_000`. Enabled only when `user?.id && effectiveRole === 'manager'`.

3. **Tests** — `src/test/bulkReview/viewerStageVisibility.test.ts` covering: admin sees all, each non-admin role sees exactly its own stage, manager + FM flag sees both, unauthorized role sees empty list, clamp logic rewrites an out-of-range `viewerStage`.

4. **Docs**
   - `DOCUMENTATION.md` — short subsection under Bulk Review noting role-scoped reviewer stage.
   - `POLICY.md` — new clause: "Bulk Review reviewer-stage selector must mirror the user's effective role; Functional Manager is visible only to users referenced as `functional_manager_id` on an active profile; admin sees all."
   - `mem/features/review/bulk-review-viewer-stage.md` (new) + entry in `mem/index.md`.
   - `docs/adr/ADR-079.md` — short ADR with rollback = revert the page + delete the hook.

## Out of scope
- No change to the RPC, RLS, or grants. The server already enforces per-row visibility; this is a UX clamp, not a security boundary.
- No change to the master feature-flag (`feature_bulk_review_dashboard`) — pilot membership stays as configured.
