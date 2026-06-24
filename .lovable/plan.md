## Goal
Admin-controlled toggle that, when ON, shows the mapped reviewer's name beneath each stage label in the Annual Review stepper (e.g., under "Dept Head" → "Ramesh Kumar"). When OFF (default = current behavior), only the stage label is shown.

## Assumptions
- Setting is a single global flag for the Annual Review module (not per-cycle, not per-employee). Confirm if you want it per-cycle instead.
- Names come from already-loaded `instance.manager_id / skip_id / dept_head_id / bu_head_id / hr_id` resolved against the existing active-profiles cache (no extra fetch round-trip).
- "Self" stage shows the employee's own name only when the toggle is ON (consistent treatment).
- If a stage is enabled in the chain but its reviewer slot on the instance is NULL (unmapped), we render a muted `— Unassigned` line so admins notice gaps. Confirm if you'd rather hide the line entirely.

## Risk & Impact
- **Data**: 1 new row in `public.annual_review_settings` (new table, single-row keyed config) OR reuse `app_settings`. Additive, RLS: admin write / authenticated read. No history-changing migrations.
- **Workflow**: None — purely presentational.
- **UI/UX**: Stepper grows by one line of text per stage when ON; remains single-line when OFF. Existing horizontal scroll already handles overflow.
- **Regression**: Low. Tracker is consumed in `EmployeeAnnualReview` and `TeamReviewDetailContent` only; both already pass `instance` in scope.
- **Scalability**: Setting is read once per page via React Query (cached). No N+1.
- **Rollback**: Drop the row / flip flag OFF. Tracker falls back to label-only rendering automatically.

## Plan

1. **DB — settings storage**
   - New migration: `public.annual_review_settings` (id uuid pk, key text unique, value jsonb, updated_at, updated_by). GRANTs + RLS: `SELECT` to `authenticated`, `INSERT/UPDATE` to admins only (via `has_role`).
   - Seed row: `key='show_reviewer_names_in_stepper', value=false`.

2. **Service + hook**
   - `src/services/annualReview/annualReviewSettings.ts`: `getShowReviewerNames()`, `setShowReviewerNames(boolean)`.
   - `src/hooks/useAnnualReviewSettings.ts`: `useShowReviewerNames()` (React Query, staleTime 5 min) + `useSetShowReviewerNames()` mutation invalidating the key.

3. **Admin UI** — `src/pages/annual-review/AnnualReviewAdmin.tsx`
   - Add a new `Settings` tab (icon: `Settings2`) at the end of the existing TabsList.
   - Inside: a single `Switch` row — "Show reviewer names in workflow stepper" with helper text "When ON, each stage in the progress tracker displays the mapped reviewer's name below the stage label." Wired to the hook.

4. **Tracker** — `src/components/annual-review/AnnualReviewStageTracker.tsx`
   - Accept optional `reviewerNamesByStage?: Partial<Record<AnnualReviewerRole, string | null>>` prop.
   - When prop is provided AND non-empty, render the name (or muted "— Unassigned") on a second line under the stage label.
   - No behavior change when prop is omitted (keeps existing tests green).

5. **Callers**
   - `EmployeeAnnualReview.tsx` and `TeamReviewDetailContent.tsx`:
     - Read `useShowReviewerNames()`.
     - If ON, build `reviewerNamesByStage` by mapping `instance.{manager_id, skip_id, dept_head_id, bu_head_id, hr_id}` and `employee_id` through the already-loaded active-profiles list (`formatSafetyProfileLabel` for consistent formatting).
     - Pass to `<AnnualReviewStageTracker reviewerNamesByStage={...} />`.

6. **Tests**
   - `annualReviewSettings.test.ts` — get/set round-trip + admin-only write guard.
   - `AnnualReviewStageTracker.test.tsx` — renders names when prop provided; renders "Unassigned" for null; hides line when prop omitted.
   - Update `i18nContext.test.tsx` snapshot if affected.

7. **Docs**
   - `DOCUMENTATION.md` v2.66.60 entry: setting key, RLS, default OFF, where it surfaces.
   - `POLICY.md` §AR-STEPPER-NAME-VISIBILITY: visibility is admin-controlled; default OFF; ON shows mapped reviewer name (or "Unassigned" placeholder) under each enabled stage; setting is global per tenant.

## UI Changes (visual)
Stepper item, ON state:
```
(2)  Dept Head
     Ramesh Kumar
```
OFF state (unchanged):
```
(2)  Dept Head
```

## Out of Scope
- Per-cycle or per-template overrides.
- Showing reviewer emails / avatars.
- Changing the existing `ChangeWorkflowDialog` UI (which already shows names elsewhere).

## Open Questions
1. Global setting OR per-cycle? (Default in plan: **global**.)
2. For unmapped stages: render muted "— Unassigned" (plan default) or hide the line entirely?
