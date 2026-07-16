# Standardize every Worker (W) template to the reference reviewer-stage settings

## Goal
Apply the exact settings shown in your screenshot to **every criterion** of **every active Worker template** (templates whose name contains the "W" cadre marker):

- Reviewer Stages **enabled**: `self`, `dept_head`, `bu_head`, `hr`
- Reviewer Stages **disabled**: `manager`, `skip_manager`
- Toggles **off**: `enable_remarks = false`, `enable_evidence = false`, `evidence_required = false`

## Scope discovered
Active Worker templates matched (name pattern `- W -`, `W Plant`, `W -`, `W with`, `W without`): **28 templates**, e.g. CLU/CPP/DRI/FAD/SMS "- W -" variants, HK/Pol/Dust/hort - W, Generic W (With/Without KRA), Generic W with env (Functional), Generic W without Env, Generic - W Plant (Purchase/Store).

Current state (sampled from criterion #1 only):
- 26/28 already match the target shape.
- **1 template** ("Generic W without Env") has drifted stages `['self','manager','skip_manager','bu_head','hr']` and `enable_remarks = true`.
- **1 template** ("Generic W - (With KRA)") has 0 criteria — safely skipped.
- Full-criteria audit will still be enforced by the migration (rewrites every criterion, not only #1), which catches per-criterion drift like the 11 "missing dept_head" rows found earlier.

Manager ("M") templates and any non-W templates are **not** touched.

## What will change (build phase)
1. **Migration — one transactional UPDATE.**  
   For each row in `annual_review_templates` where `is_active = true` AND `name` matches the Worker pattern, rewrite `sections.criteria` so every element sets:
   ```
   reviewer_stages   = ['self','dept_head','bu_head','hr']
   enable_remarks    = false
   enable_evidence   = false
   evidence_required = false
   ```
   All other criterion fields (id, key, name, weight, options, translations, sort order) are preserved verbatim. `updated_at = now()`, `version = version + 1` only on rows that actually changed.
2. **Audit trail.** Insert one row per changed template into `template_change_logs` with change_type `w_reviewer_stages_normalized`, capturing the previous `sections` snapshot and the list of criterion keys touched. Enables one-line rollback.
3. **Regression test.** Add `src/services/annualReview/wTemplateStageContract.test.ts` — asserts every active W template has criteria with exactly the target `reviewer_stages` set and the three flags = false.
4. **Docs & memory.**
   - New memory `mem/features/annual-review/w-template-stage-contract.md` codifying the W-cadre invariant.
   - Append to POLICY as §AR-W-CADRE-STAGE-CONTRACT.
   - `DOCUMENTATION.md` version bump line.
5. **Verification query** post-migration: assert that no active W template has any criterion whose `reviewer_stages` ≠ `['self','dept_head','bu_head','hr']` or whose flags ≠ false.
6. **No UI code changes** — Template Editor already writes/reads these fields; scoring SSOT already respects `reviewer_stages`.

## Impact on in-flight instances
- **Pre-manager instances (still at `pending_self`).** No visible impact — when they advance, the manager/skip stages are simply skipped for criteria scoring (per existing `reviewer_stages` gate). If the *instance* still lists `manager`/`skip_manager` in `enabled_stages`, the manager will see the qualitative section (comments/goals) but no criteria block — mirrors what the setting already implies.
- **Instances currently at `pending_manager` / `pending_skip`.** Same effect — criteria disappear for those roles going forward. Anything already submitted stays as-is; no response rows deleted.
- **Instances past dept_head.** dept_head/bu_head criteria contributions already recorded stay; new criteria enabled don't retroactively force re-scoring.
- **Completed / cycle-closed instances.** Frozen; not touched.
- **`enabled_stages` on instances is NOT modified** by this change. If you also want to strip `manager`/`skip_manager` from the workflow chain for Worker instances, that is a separate bulk action via `set_annual_review_enabled_stages` — say the word and I'll add it as Step 1b.

## Risk & Impact Report
- **Data:** JSON rewrite on ~28 template rows. Idempotent for the 26 already at the target. Reversible via `template_change_logs` snapshot.
- **Workflow:** Only per-criterion visibility for manager/skip is removed. No response data touched.
- **UI:** Template Editor pop-over will now show the target checkbox pattern for every W template.
- **Scalability:** Single UPDATE, negligible.
- **Regression risk:** Any code path that assumes W templates expose criteria to manager — searched, none found; scoring SSOT reads `reviewer_stages` at runtime.
- **Rollback:** UPDATE from `template_change_logs.previous_snapshot` per row.

## Decision needed before I ship
1. Confirm the "W" scope: 28 active Worker templates as listed above — anything to include or exclude?
2. Do you also want the same normalization applied to **instances' `enabled_stages`** (drop `manager` + `skip_manager` from the workflow chain for currently-in-flight Worker reviews), or just the template criteria as above?

## Not applicable
- No schema changes, no new RLS, no edge functions, no dependencies.
