# Fix: "new row violates row-level security policy for table annual_review_instances" on self-review submit

## What is happening
Anil Rajwar (100406) fills his self review, presses Submit, and the save is rejected by the database access rules. Verified against live data — not a form/validation problem.

## Root cause (verified)
Two different rules decide "what stage comes next", and they disagree:

- The submit routine computes the next stage from the **effective** chain, which removes duplicate reviewers. For this employee the Dept Head and BU Head are the **same person**, so Dept Head is skipped and the next stage is `pending_bu`.
- The access rule (`instances_stage_update` WITH CHECK) computes the next stage from the raw **enabled_stages** list, which still contains Dept Head, so it only permits `pending_dept`.

The submit writes `pending_bu`; the access rule allows only `pending_dept` → rejected.

```text
enabled_stages : self -> dept_head -> bu_head   (policy expects pending_dept)
effective chain: self -> bu_head                (engine writes pending_bu)
```

Live check: 2 in-flight reviews currently sit on a stage where the two disagree; any review with the same person in consecutive stages will hit this at that stage.

## 5 Whys
1. Submit failed → the row's new status was refused by the access rule.
2. Why refused → the rule only allows the next status derived from `enabled_stages`.
3. Why is that wrong → the workflow engine skips duplicate/absent reviewers via the effective chain.
4. Why the divergence → duplicate-reviewer auto-skip was added to the engine but the access rule was never moved to the same source of truth.
5. Why not caught → no test asserts that the access rule and the advance routine resolve the next status identically.

## Fix
1. **Migration** — recreate the `instances_stage_update` policy so its WITH CHECK derives the next status from `annual_review_effective_chain(id)` (same SSOT as the advance routine) for every reviewer slot (self, manager, skip, dept, bu, hr, management). USING clause unchanged; who may act is not widened — only the permitted destination status is corrected.
2. **Regression test** — add an SSOT contract test asserting the policy body references `annual_review_effective_chain` and covers all reviewer slots, mirroring `stageForReviewer.test.ts`.
3. **Docs/Policy** — `docs/adr/ADR-216.md`, POLICY entry `§AR-STAGE-UPDATE-EFFECTIVE-CHAIN` (access rules must resolve stage transitions through the effective chain), DOCUMENTATION.md version-history line.

## Risk & impact
- **Data**: no data or schema change. Policy replace only; rollback = restore the previous definition (kept verbatim in the migration comment).
- **Workflow**: unblocks submissions where consecutive stages share a reviewer; nothing else changes.
- **Security**: no widening — the destination set becomes the correct one; actor gating untouched.
- **UI**: none.
- **Regression risk**: low, contained to one policy, guarded by the new contract test.

## Verification
- Re-run the mismatch query (expect 0 rows where policy and engine disagree).
- Confirm Anil Rajwar's instance advances `pending_self → pending_bu` cleanly.