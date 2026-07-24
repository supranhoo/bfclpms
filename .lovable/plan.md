## Diagnosis (verified)

- DB confirms Jaspal (101125): `enabled_stages = [self, management]`, `management_id = Dummy (001)`, `overall_status = pending_management`. Data is correct.
- The stepper drops **Management** because `computeVisibleStages` → `resolveEffectiveChain` (`src/lib/annualReview/effectiveChain.ts`) doesn't know about `management`:
  - `SENIORITY` and `FORWARD` arrays only list `self → manager → skip_manager → dept_head → bu_head → hr`.
  - `ResolveInput.reviewers` doesn't accept a `management` slot.
  - `computeVisibleStages` in `src/lib/annualReview/visibleStages.ts` doesn't pass `instance.management_id`.
  - Result: `effectiveStages()` returns `[self]` only → tracker renders just Self.

The earlier fix (adding `management` to `buildReviewerNamesByStage`) is why "Jaspal (101125)" now shows under Self, but Management is still filtered out upstream, before the tracker even sees the chain.

So — **no, the current screenshot is not correct**. Management should render as step 2 with "Dummy (001)" underneath.

## Fix Plan (surgical, UI/plumbing only — no DB changes)

1. `src/lib/annualReview/effectiveChain.ts`
   - Add `'management'` as the most-senior entry in `SENIORITY` (top of dedup, so it wins over hr/bu_head duplicates the same way hr does today).
   - Add `'management'` at the end of `FORWARD` (terminal stage after `hr`).
   - Extend `ResolveInput.reviewers` typing to include `management`.

2. `src/lib/annualReview/visibleStages.ts`
   - Add `management_id: string | null` to `InstanceLike`.
   - Pass `management: instance.management_id` into both `resolveEffectiveChain` and `effectiveStages` calls (in `computeVisibleStages` and `computeStageResolutions`).

3. Confirm callers already pass full `instance` objects (they do — `EmployeeAnnualReview`, `TeamReviewDetailContent`), so no changes there.

4. Tests
   - Extend `src/test/annualReview/stageTrackerReviewerNames.test.tsx` (or add a sibling `effectiveChain.management.test.ts`) with a Jaspal-shaped fixture: `enabled=[self, management]`, `management_id` set, `bu_head_id=null` → expect `effectiveStages() === ['self', 'management']` and reviewer name resolves.

## Risk & Impact

- **Data:** none.
- **Workflow:** none — SQL engine already handles `management`; this only aligns the TS mirror.
- **UI:** Management stage will now appear in the stepper for the 24 BU-Head instances with `enabled_stages=[self, management]`, and correctly show the reviewer name. No other instance shape is affected because `management` only appears in `enabled_stages` when Backfill has stamped it.
- **Regression:** low. Adding `management` to `SENIORITY`/`FORWARD` is additive; existing 6-stage instances have no `management` slot so behavior is unchanged.
- **Rollback:** revert two files.

## Verification

- Reload Jaspal's review → stepper shows `1 Self Review – Jaspal (101125)` then `2 Management – Dummy (001)`; badge stays "Management Review Pending".
- Team Annual Review detail for Gaurav opening Jaspal shows the same 2-step chain.
- Existing 6-stage instances (non-BU-Head) render identically to today.
