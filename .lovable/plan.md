## Problem

For Ankit, **Dept Head** and **BU Head** are unmapped, so the workflow engine already auto-skips them and advances directly from Self → HR Final (Jaspal). But the **stepper still renders them as "— Unassigned"**, making it look like the review is stuck or mis-configured.

The workflow execution and the UI are out of sync:

- **Execution (SQL `annual_review_effective_chain_details` + `resolveEffectiveChain`)** — already drops stages with no mapped reviewer / self-assignment / inactive reviewer / duplicate reviewer.
- **Stepper (`AnnualReviewStageTracker`)** — renders the raw `enabled_stages` array, so dropped stages still appear.

## Decision

Hide auto-skipped stages from the stepper everywhere, so the visual chain matches what the engine actually executes. For Ankit this means the tracker collapses to:

```text
1 Self Review  →  2 HR Final (Jaspal)
```

No new admin toggle — auto-skip is already a system rule (driven by reviewer mapping). The stepper just needs to honour it.

## Risk & Impact Report

- **Data Impact:** None. `enabled_stages` is not modified; this is presentation only.
- **Workflow Impact:** None. Engine already skips these stages via `nextStatus`/SQL chain.
- **UI/UX Impact:** Stepper hides stages with no mapped reviewer (or self-assignment / inactive / duplicate reviewer). Step numbers re-number from the surviving stages so the chain reads cleanly (1, 2, ... not 1, 4).
- **Regression Risk:** Low. Two call sites; one shared helper already exists (`effectiveStages` in `src/lib/annualReview/effectiveChain.ts`).
- **Mitigation:** Snapshot test of stepper with unmapped Dept/BU + unit test of helper output for this exact scenario.

## Plan

### 1. Compute the effective chain at the call sites

In both `src/pages/annual-review/EmployeeAnnualReview.tsx` and `src/components/annual-review/TeamReviewDetailContent.tsx`:

- Already have `profiles` from `useActiveProfilesLite()` (active profiles only).
- Build `activeById` = `Object.fromEntries(profiles.map(p => [p.id, true]))`.
- Compute:

```ts
const visibleStages = useMemo(() => {
  if (!instance || !profiles) return instance?.enabled_stages;
  return effectiveStages({
    enabledStages: instance.enabled_stages,
    employeeId: instance.employee_id,
    reviewers: {
      manager:      instance.manager_id,
      skip_manager: instance.skip_id,
      dept_head:    instance.dept_head_id,
      bu_head:      instance.bu_head_id,
      hr:           instance.hr_id,
    },
    activeById,
  });
}, [instance, profiles, activeById]);
```

- Pass `enabledStages={visibleStages}` to `AnnualReviewStageTracker`.

Fallback to raw `instance.enabled_stages` while profiles are still loading — prevents a flicker that hides everything.

### 2. Tooltip for hidden stages (transparency)

Add a small "ⓘ Some stages were skipped" hint to the stepper header **only when** `visibleStages.length < enabled_stages.length`, with a tooltip listing the dropped stages and the reason (`no_reviewer_mapped`, `self_assignment`, `reviewer_inactive`, `duplicate_reviewer`). Uses the data already returned by `resolveEffectiveChain`.

### 3. Reviewer-name map stays as-is

`buildReviewerNamesByStage` still produces all 6 entries; the stepper only looks up entries for the stages it actually renders, so dropped stages aren't queried.

### 4. Tests

- Update `stageTrackerReviewerNames.test.tsx` (and add a sibling test) to verify a Self+HR-only chain renders 2 numbered steps with names "Self Review" / "HR Final" and no "Dept Head" or "BU Head".
- Add `effectiveChain.test.ts` case: enabled = [self, manager, skip, dept, bu, hr], reviewers = {manager: null, skip: null, dept: null, bu: null, hr: 'jaspal'}, employee = ankit → `effectiveStages` returns `['self', 'hr']`.

### 5. Docs / Policy

- `DOCUMENTATION.md` → "Annual Review > Stepper" section: state that the stepper shows the **effective** chain (auto-skipped stages are hidden) and reference the four skip reasons.
- `POLICY.md` → reaffirm: an unmapped reviewer slot = stage auto-skipped, both in execution AND in the UI.

## Technical Details

- Affected files:
  - `src/components/annual-review/AnnualReviewStageTracker.tsx` — accept optional `skippedStagesInfo` prop for the info hint (no behaviour change otherwise).
  - `src/pages/annual-review/EmployeeAnnualReview.tsx` — compute & pass `visibleStages`.
  - `src/components/annual-review/TeamReviewDetailContent.tsx` — same.
- SSOT used: existing `resolveEffectiveChain` / `effectiveStages` from `src/lib/annualReview/effectiveChain.ts` (already mirrors the SQL contract).
- No DB migration. No new RPC. No new setting.

## Rollback

- Pure UI change. Revert the two call sites to pass `instance.enabled_stages` and the stepper goes back to the current behaviour. No data to undo.
