## Goal

Reshape the annual-review reviewer chain to **self → manager → skip → dept_head → bu_head → hr**, make the default configurable per cycle, and skip any stage whose reviewer is missing / inactive / equals the employee — both at seed time and at every advance.

## Assumptions

- `departments.head_user_id` is already populated (work shipped last turn).
- `pending_dept` is a brand-new status; we add it to `annual_review_status`.
- `dept_head` is a brand-new role; we add it to `annual_reviewer_role`.
- `annual_review_instances.dept_head_id` already exists.
- "Customisable for all users" = one default chain per cycle (admin sets it on the Cycle dialog). Per-employee overrides keep winning.

## Risk & Impact

- **Data:** Enum additions are non-destructive. Backfill **rewrites `enabled_stages`** on every non-completed instance in active cycles to insert `dept_head` in its canonical slot. Existing self/manager/skip/bu/hr selections are preserved verbatim; we only insert `dept_head` if it was not previously present.
- **Workflow:** A stage formerly Pending BU could now stop at Pending Dept first. We narrow the blast radius by only flipping the instance into `pending_dept` on the **next** advance, not retroactively.
- **UI/UX:** New stepper segment; one new checkbox in workflow & cycle dialogs.
- **Regression risk:** Medium. Stepper / stage-labels / reviewer-dashboard `.or()` filters / send-back chain / notification recipient resolver all read the stage list — every one must be updated together.
- **Scalability:** No new heavy queries. Auto-skip resolver runs once per advance.
- **Mitigation:** SSOT lives in `stageChain.ts` + matching SQL helpers; updating those two files cascades everywhere. Migrations are additive (enum + column) plus one bounded UPDATE.

## Step-by-step plan

### 1. DB migration `annual_review_dept_head_stage`

1. `ALTER TYPE public.annual_reviewer_role ADD VALUE IF NOT EXISTS 'dept_head' AFTER 'skip_manager';`
2. `ALTER TYPE public.annual_review_status ADD VALUE IF NOT EXISTS 'pending_dept' AFTER 'pending_skip';`
   (Both enum changes must commit before any function references them — done in a `DO $$ ... $$` block then `COMMIT;` then the rest.)
3. `ALTER TABLE annual_review_cycles ADD COLUMN default_enabled_stages jsonb NOT NULL DEFAULT '["self","manager","skip_manager","dept_head","bu_head","hr"]'::jsonb;` + reuse the existing validator pattern via a CHECK-free trigger (mirrors instance validator, allows `dept_head`).
4. Update **default** on `annual_review_instances.enabled_stages` to the same 6-element array and **extend the validator trigger** to accept `dept_head`.
5. Replace `annual_review_next_status`, `annual_review_prev_status`, `annual_review_prev_role` with the new canonical order `(self,1)…(dept_head,4)(bu_head,5)(hr,6)` and a `pending_dept ↔ dept_head` mapping.
6. New helper `public.annual_review_effective_chain(p_inst_id uuid) RETURNS text[]` — returns the enabled stages further filtered to drop any stage whose reviewer slot resolves to NULL, points at an `is_active=false` profile, or equals `employee_id`. `self` is never dropped (employees can always self-review).
7. Rewrite `advance_annual_review_status` and `send_back_annual_review_status` to compute `v_chain := effective_chain(inst_id)` and walk that chain instead of `enabled_stages`. Auth check stays gated on `enabled_stages` membership (auto-skipped stages are never callable). Add `dept_head` arm to the auth `CASE`.
8. Backfill (still inside the same migration — bounded by status):
   ```sql
   UPDATE annual_review_instances
      SET enabled_stages = (
        SELECT jsonb_agg(s ORDER BY ord)
          FROM (VALUES ('self',1),('manager',2),('skip_manager',3),
                       ('dept_head',4),('bu_head',5),('hr',6)) t(s,ord)
         WHERE enabled_stages ? s OR s = 'dept_head'
      )
    WHERE overall_status NOT IN ('completed')
      AND NOT (enabled_stages ? 'dept_head');
   ```
   Active cycles also get `default_enabled_stages` re-stamped to include `dept_head`.
9. Audit row in `system_audit_logs` whenever advance auto-skips a stage (action `annual_review.stage_auto_skipped`, payload `{ skipped, reason: 'null'|'inactive'|'self_loop' }`).

### 2. TypeScript SSOT — `src/lib/annualReview/stageChain.ts` & `constants.ts`

- `ALL_STAGES = ['self','manager','skip_manager','dept_head','bu_head','hr']`.
- Add `dept_head: 'pending_dept'` to `STAGE_TO_STATUS` and reverse map.
- Add `effectiveChain(instance)` helper mirroring the SQL resolver for client-side stepper rendering (null / inactive / self-loop filter — needs `dept_head_id`, profile activity, and `employee_id`).
- Update `enabledChain` validator to accept `dept_head`.

### 3. Service & seeder — `src/services/annualReview/annualReviewService.ts`

- Both `seedInstancesForCycle` and `seedInstancesByRules` already fetch `deptHead`; just **stamp `enabled_stages` from `cycle.default_enabled_stages`** instead of the hardcoded default. Override-safe writer is unchanged.
- Reviewer-dashboard `.or(...)` filters add `dept_head_id.eq.${reviewerId}`.

### 4. UI

- **Admin → Cycles dialog:** add a "Workflow stages" section (6 checkboxes; `self` disabled-checked). Writes `default_enabled_stages`. _Visual: new fieldset under the existing cycle date fields. Mobile: stacks under the date column. Self checkbox shown but disabled (always-on)._
- **Admin → Progress → Change workflow dialog:** add the `Dept Head` checkbox in canonical order.
- **Bulk workflow XLSX:** add `Dept (Y/N)` column; preserve other columns; update template, parser, validator, applyer.
- **Stepper / stage badges / send-back menus:** read from `effectiveChain(instance)` so a stage that will auto-skip is rendered greyed-out with a tooltip ("No reviewer mapped").
- **HR Finalization & reviewer dashboards:** wire the new `dept_head` queue (mirrors BU queue layout).

### 5. Tests

- `stageChain.test.ts` — new order, dept_head insertion, `effectiveChain` skips null / inactive / employee-self.
- `annualReviewService.seed.test.ts` — seeded `enabled_stages` matches the cycle's `default_enabled_stages`; `dept_head_id` populated.
- New `advance_auto_skip.test.ts` (vitest hitting a mocked Supabase client) — when `dept_head_id` is null, advancing `skip_manager` lands on `pending_bu` and writes the audit row.
- Update existing chain-ordering tests + the `templateEditorWeightGuard` suite stays untouched.

### 6. SSOT docs

- `src/modules/annual-review/POLICY.md`:
  - "Reviewer chain" section gets the new canonical order and auto-skip rules (null / inactive / self-loop).
  - "Per-employee workflow override" expands the checkbox list and references the cycle-level default.
  - New version history entry dated today.
- `src/modules/annual-review/DOCUMENTATION.md`: stage list, RPC signatures, new `annual_review_effective_chain` helper, `default_enabled_stages` column.
- `mem/features/annual-review/overview.md`: one-liner pointing at the new dept_head stage.
- `mem/features/annual-review/per-employee-workflow.md`: add `dept_head` to the enabled-stage list.

## UI Changes (summary)

| Where | What |
| --- | --- |
| Cycle editor | New "Workflow stages" fieldset, 6 checkboxes, `self` fixed-on. |
| Per-employee workflow dialog | +1 checkbox `Dept Head`. |
| Bulk workflow XLSX | +1 column `Dept (Y/N)`. |
| Stepper (Employee + Team + HR pages) | New segment between Skip and BU. Auto-skipped stages render dim with tooltip. |
| Admin → Progress filter | "Stage" filter dropdown gets `Pending Dept`. |
| Reviewer dashboard queues | New "Pending Dept Head" tab parity with BU. |

## Rollback

- `enabled_stages` backfill is reversible via a sibling UPDATE removing `dept_head` from non-completed instances; new column / enum values can stay (additive, no consumer if UI rolls back).
- All UI changes are pure React; revert the commit.

## Out of scope

- Notification email copy for the dept-head stage (uses existing reviewer template — copy tweak is a follow-up).
- Reordering stages beyond inserting `dept_head` (we keep manager → skip → dept → bu fixed).
- Cross-cycle backfill of historical, already-completed instances.
