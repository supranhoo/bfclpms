## Goal
Make the Overall Recommendation remark **mandatory** for Management submissions, mirroring BU Head. Also enable the remark editor for Management (currently it doesn't render because `management` isn't in the recommendation-authoring roles list). Enforce the same "no remark → cannot submit" rule for BU Head.

## Current State (verified)
- `src/components/annual-review/OverallRecommendationCard.tsx`
  - `RECOMMENDATION_ROLES = ['dept_head', 'bu_head']` — **Management is missing**, so the textarea never renders for a Management reviewer.
  - Label reads `"Your recommendation (optional)"` — no requirement anywhere.
- `src/components/annual-review/TeamReviewDetailContent.tsx` → `handleSubmit`
  - Only guards the **self** stage. No check on the reserved `__overall_recommendation` key before `advance.mutateAsync` for reviewer stages.
- No server-side RPC enforcement of a non-empty recommendation.

## Change Plan

1. **`OverallRecommendationCard.tsx`**
   - Add `'management'` to `RECOMMENDATION_ROLES` so the editor renders on the Management terminal stage.
   - Export a new constant `RECOMMENDATION_REQUIRED_ROLES = ['bu_head', 'management']` (Dept Head stays optional — user only mirrored BU Head).
   - When the current `role` is in `RECOMMENDATION_REQUIRED_ROLES`:
     - Change label from `"Your recommendation (optional)"` to `"Your recommendation (required)"` with a red asterisk.
     - Show inline helper text: `"A recommendation is required before this review can be submitted."`
   - Include `'management'` in `collectRecommendations` display order (append after `hr`) so the aggregated block on the employee results view and downstream stages shows Management notes.
   - Extend `STAGE_LABEL` usage already covers `management`.

2. **`TeamReviewDetailContent.tsx` → `handleSubmit`**
   - After the existing `self` block, add a guard:
     ```ts
     if (role && RECOMMENDATION_REQUIRED_ROLES.includes(role)) {
       const rec = ((draft.qualitative_responses ?? {})[RECOMMENDATION_KEY] ?? '').trim();
       if (!rec) {
         toast.error('Please add an Overall Recommendation before submitting.');
         return;
       }
     }
     ```
   - Same guard runs before the proxy-assisted branch so assisted submissions can't bypass it.

3. **Tests** (`src/test/annualReview/`)
   - Extend/add unit tests:
     - `OverallRecommendationCard` renders the editor for role `management` and shows the "required" label.
     - `handleSubmit` blocks (toast + no `advance.mutateAsync`) when `bu_head` or `management` submits with empty recommendation.
     - `dept_head` submission still succeeds without a recommendation (unchanged behaviour).

4. **Docs / Policy**
   - Append `POLICY §AR-RECOMMENDATION-REQUIRED` to `POLICY.md`: "For BU Head and Management terminal stages, submission is blocked unless a non-empty Overall Recommendation is provided."
   - Add ADR-151 in `docs/adr/` capturing the decision and the parity with BU Head.
   - Update `DOCUMENTATION.md` Version History.

## Risk & Impact

| Vector | Assessment |
|---|---|
| Data | None — client-side guard only; existing storage key `__overall_recommendation` unchanged. |
| Workflow | BU Head and Management can no longer submit without a note. Dept Head/HR/others unaffected. |
| UI/UX | Textarea now visible for Management; label switches to "required" for BU Head + Management. |
| Regression | Low — additive to `handleSubmit`; RECOMMENDATION_ROLES extension only enables an existing card path. |
| Rollback | Revert the two files + drop the tests. No schema changes. |

## Out of scope
- Server-side RPC validation (client guard is sufficient per current pattern used for self-stage; can be added later if bypasses appear).
- Making Dept Head remark mandatory.
- Retroactive backfill of already-locked BU Head/Management responses.