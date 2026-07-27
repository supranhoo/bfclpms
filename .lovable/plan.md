## 1. Status of the earlier request (ADR-175 / §AR-KRA-RATING-VISIBILITY)

Verified in code + database — it is **partly delivered**, which is why it still looks "pending":

| Ask | Status | Evidence |
|---|---|---|
| Employee sees their KRA-driven rating | Delivered | `useKraDerivedRating.ts` + `ScoreBreakdownCard.tsx` wired into `EmployeeResultsView.tsx` |
| Report column "how the rating is derived (with/without KRA)" | Delivered | RPC `get_annual_review_comprehensive_report` returns `scoring_mode` (`With KRA` / `Without KRA` / `Blended`); rendered in `ComprehensiveTab.tsx`, exported as "Rating Derived From" |
| Report carries all scoring parameters | Delivered | RPC returns `criteria_weight`, `system_weight`, `kra_weight`, `kra_points`, `system_scores`, `terminal_criteria_scores` |
| **Rating visible on the admin progress grid** | **BROKEN — regressed** | see below |
| **Report stage columns for KRA employees** | **Still wrong** | report returns raw `weighted_score` = `0.00`, not the KRA-derived /5 |

## 2. Root cause of the blank row in your screenshot (Ankit Choudhary, 101785)

Confirmed against live data:

- Instance `0eef09b7…` — status `completed`, `total_score` 91.72, `final_rating` Outstanding, `enabled_stages` `[self, dept_head, bu_head]`.
- Template `Generic M - (With KRA)` has **0 criteria** and one `carry_kra` system slot at weight 100. Reviewers never score criteria, so both submitted responses (`self`, `bu_head`) have `weighted_score = 0.00` and `criteria_scores = {}`.
- ADR-130 already added a fallback in `AnnualReviewAdmin.tsx` that shows the KRA-derived /5 in each stage column — **but it only fires when `ss[role] != null`**.
- ADR-172 later changed `fetchInstanceStageScores()` (`annualReviewService.ts` ~line 852) to `slot[role] = scoredCount === 0 ? null : weighted_score`. For a KRA template `scoredCount` is *always* 0, so **every stage is forced to `null` and the ADR-130 fallback can never run**.

That is the exact collision: ADR-172's "don't show 0.0 for an unscored stage" guard silently disabled ADR-175/ADR-130's "show the KRA rating" path.

### 5 Whys
1. Stage columns are blank → the KRA fallback never renders.
2. Fallback never renders → its `ss[role] != null` precondition fails.
3. Precondition fails → the stage-score fetch returns `null` for every role.
4. Returns null → ADR-172 maps "no criteria scores" to null.
5. ADR-172 maps it that way → "stage was not scored" was conflated with "this template has nothing to score". The fetch layer had no notion of scoring mode.

## 3. Changes

**A. Distinguish "not scored" from "nothing to score" (root fix)**

`src/services/annualReview/annualReviewService.ts` — `fetchInstanceStageScores()` returns a richer per-role value: `{ weighted_score, scored: boolean, submitted: true }` instead of a bare number, so callers can tell an empty stage from a KRA stage. ADR-172's guarantee (never print `0.0` for a genuinely unscored criteria stage) is preserved because `scored` stays false.

`src/pages/annual-review/AnnualReviewAdmin.tsx` — the `fmt()` helper uses the new shape: criteria rating when `scored`; otherwise, if the template is KRA-based **and a response exists for that stage**, render the KRA-derived /5 with the existing "Derived from KRA achievement" tooltip; otherwise `—`. Same for the Excel/CSV stage columns built at lines ~341-420, which today emit blanks for the same reason.

`src/lib/annualReview/displayStageForResponse.ts` — `remapStageValueMapByDuplicates` is already generic (`<T>`) and needs no change; its `!= null` presence test now sees the object.

**B. Report parity (finishes the original ask)**

Migration replacing `get_annual_review_comprehensive_report` (additive, same signature, `SECURITY DEFINER`, unchanged scope guard): add `self_rating_5 … management_rating_5` derived columns. For a KRA-based template these are `kra_points / kra_weight * 5` for every stage that has a submitted response; for criteria templates they stay `weighted_score / stage_weight_sum`; `NULL` where the stage never responded. `ComprehensiveTab.tsx` and `ComprehensiveExport.ts` render/export these next to the existing raw scores, plus a "KRA %" column, so a reader can verify the number.

**C. Regression guard**

`src/lib/annualReview/kraStageDisplay.ts` (new, pure): `resolveStageDisplayRating({ scored, weightedScore, criteria, role, isKraTemplate, kraRating })` — single decision point used by grid, export and (mirrored) the RPC. Unit tests in `src/lib/annualReview/__tests__/kraStageDisplay.test.ts` covering: criteria stage scored, criteria stage submitted-but-empty (must stay `—`, ADR-172), KRA stage submitted (must show the derived /5), KRA stage not submitted (`—`), zero KRA weight.

**D. Docs** — ADR-179 in `DOCUMENTATION.md` recording the ADR-172 ↔ ADR-130 collision; `POLICY.md §AR-KRA-GRID-DISPLAY` amended: *a locked response with empty `criteria_scores` renders `—` only when the template actually has criteria; on KRA-weighted templates it MUST render the KRA-derived rating.*

## 4. On "why is this still showing pending"

Ankit (101785) is **not** pending — the instance is `completed` and finalized 2026-07-22; the row in your screenshot shows the Completed badge. Across the current cycle there are 29 genuinely open KRA-template instances (19 `pending_management`, 4 `pending_bu`, 3 `pending_self`, 3 `pending_dept`) and 65 open non-KRA ones. If the "pending" you mean is a specific screen or employee, tell me which and I will diagnose that separately — I have not assumed a cause for it, and it is not covered by the fix above.

## 5. Risk & impact

- **Data:** none. No schema change; the RPC change is additive (new return columns only).
- **Workflow / permissions:** unchanged — the RPC's directory-scope guard is copied verbatim.
- **UI:** admin grid rows for KRA employees change from `—` to a `/5` value (e.g. Ankit: Self and BU show ≈ 4.6, Dept stays `—` because that stage never responded). Criteria-template rows are untouched.
- **Regression risk:** medium-low, concentrated on ADR-172. Mitigated by the pure helper plus the explicit "empty criteria stage stays `—`" test.
- **Scalability:** no new queries; the KRA snapshot query is already cached and deduped per page.
- **Rollback:** revert the three TS files and re-deploy the previous RPC body (kept in the migration as a comment).
