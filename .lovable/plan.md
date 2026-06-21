## Goal

Extend the Annual Review effective-chain resolver so that when the same person is mapped to multiple reviewer slots (e.g. Jaspal as manager + dept_head + bu_head), they only review **once** — at the **highest** stage they qualify for. Lower duplicate stages are auto-skipped with an audit reason.

## Risk & Impact Report

- **Data impact:** No schema changes. Only the body of `public.annual_review_effective_chain(uuid)` and the mirrored TS helper `effectiveChain()` change. No backfill needed — resolver is computed on every advance.
- **Workflow impact:** In-flight instances will see lower-tier duplicate stages skipped on the next `advance_annual_review_status` call. Stages that were already completed are not retroactively touched (we only short-circuit `pending_*` transitions). 
- **UI impact:** `AnnualReviewStageTracker` already dims auto-skipped stages with a tooltip — the new skip reason `duplicate_reviewer` reuses that path. No new components.
- **Regression risk:** Low. The existing skip conditions (NULL / inactive / self) are preserved; we add one more condition evaluated **after** them. Test coverage extended.
- **Scalability:** O(n) over a fixed 6-stage chain — negligible.
- **Rollback:** Single migration replacing two functions. Revert = re-run the prior `CREATE OR REPLACE`. Additive only.

## Canonical Resolution Rules (new)

Evaluation order = **top-down by seniority**: `hr → bu_head → dept_head → skip_manager → manager → self`.

For each stage walk:

1. If the slot is NULL → skip (`reason: no_reviewer_mapped`)
2. Else if reviewer profile `is_active = false` → skip (`reason: reviewer_inactive`)
3. Else if reviewer = employee → skip (`reason: self_assignment`)
4. **NEW:** else if reviewer ID already appears at a **higher** stage in the resolved chain → skip (`reason: duplicate_reviewer`)
5. Else → keep stage

The forward execution order (`self → manager → skip → dept → bu → hr`) is unchanged for stepping; only the **de-dup pass** runs top-down so the highest tier wins.

### Worked example — Ankit / Jaspal

Slots: manager=Jaspal, skip=Jaspal's mgr, dept=Jaspal, bu=Jaspal, hr=HR-X

Top-down pass keeps Jaspal at `bu_head`; marks `dept_head` and `manager` as duplicates.

Final effective forward chain: `self → skip → bu_head → hr`.

### Highest-stage data seeding

When the self-review submits and we transition to the first reviewer stage, the payload (scores, comments, evidence pointers) is written to the row keyed by the **highest non-skipped stage** that resolves to that reviewer. This guarantees Jaspal sees the data in his single `pending_bu` action — not orphaned on a skipped `pending_manager` row.

## Implementation Steps

### 1. SQL migration — replace resolver + advance helpers

File: `supabase/migrations/<ts>_dedupe_duplicate_reviewers.sql`

- `CREATE OR REPLACE FUNCTION public.annual_review_effective_chain(p_inst_id uuid)` — returns `TABLE(stage annual_reviewer_role, reviewer_id uuid, skipped boolean, skip_reason text)`. New body does:
  1. Build raw chain in seniority order (`hr, bu_head, dept_head, skip_manager, manager, self`).
  2. Apply rules 1–4 sequentially, remembering kept reviewer IDs in a `uuid[]` accumulator.
  3. Return rows re-sorted into forward execution order for callers.
- `CREATE OR REPLACE FUNCTION public.advance_annual_review_status(...)` — unchanged logic, but iterate over forward chain from the resolver and log a `system_audit_logs` row `annual_review.stage_auto_skipped` with `skip_reason` whenever a row has `skipped = true`.
- `CREATE OR REPLACE FUNCTION public.send_back_annual_review_status(...)` — same skip-aware walk in reverse.
- Highest-stage seeding: in `advance_annual_review_status`, when transitioning out of `self`, resolve the first non-skipped reviewer stage from the **top** of the seniority list that matches the next pending stage's reviewer_id, and copy the self-submission payload into that target stage's response row.

### 2. TS SSOT mirror

File: `src/lib/annualReview/stageChain.ts`

- Update `effectiveChain(instance, profilesById)` to match the SQL contract exactly: same seniority-first de-dup pass, same skip-reason enum.
- Export `SkipReason = 'no_reviewer_mapped' | 'reviewer_inactive' | 'self_assignment' | 'duplicate_reviewer'`.

### 3. UI surface

File: `src/components/annual-review/AnnualReviewStageTracker.tsx`

- Map `duplicate_reviewer` → tooltip copy: `"Skipped — same reviewer already acts at <higher stage label>"`. Uses existing dim style; no layout change.

### 4. Tests

- `src/lib/annualReview/stageChain.test.ts` — add cases:
  - manager+dept+bu all same person → keeps only `bu_head`
  - dept+bu same person, manager different → keeps `manager` and `bu_head`, skips `dept_head`
  - self also accidentally mapped as bu_head → existing `self_assignment` still wins (rule 3 before rule 4)
- `src/test/orgHeadsSeederIntegration.test.ts` — add a duplicate-reviewer fixture asserting the resolver picks the top tier.
- New SQL parity test in `src/test/` invoking the RPC with three duplicate-mapping fixtures and asserting `skipped`/`skip_reason` rows.

### 5. Docs & memory

- `src/modules/annual-review/POLICY.md` — append a "Duplicate reviewer de-duplication" subsection with the worked Ankit/Jaspal example.
- `mem/features/annual-review/overview.md` — add bullet under auto-skip rules: top-down de-dup, highest tier wins, payload seeded to highest stage.
- `.lovable/plan.md` — append entry for this change.

## Out of Scope

- Notification template copy changes.
- Retroactive recalculation of already-completed instances.
- Any change to the forward execution order or to the cycle-level `default_enabled_stages` UI.
