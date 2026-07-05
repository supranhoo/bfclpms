## HR Finalization — required-stage guard should follow the employee's actual workflow

**Problem.** `HrFinalizationSheet` hardcodes the required locked responses as `self, manager, skip_manager, bu_head`. For an employee whose annual-review chain is `self → dept_head → bu_head → hr` (no manager, no skip-level), the guard falsely reports "Missing locked responses for: manager, skip_manager" and blocks finalization.

**Root cause.** The component ignores `instance.enabled_stages` (already resolved per-employee by the workflow engine) and uses a hardcoded stage list.

### Fix (UI-only, surgical)

`src/components/annual-review/HrFinalizationSheet.tsx`
1. Derive an `effectiveChain` from `instance.enabled_stages`, pruning stages whose reviewer slot on the instance is unmapped (mirrors `effectiveStages` auto-skip). Never hardcode the chain.
2. `missingStages` = `effectiveChain` minus `hr` (HR is the finalizer), filtered by `is_locked`.
3. Align the `sumCriteria` cascade to iterate only stages present in `effectiveChain` (high → low).

Nothing else changes: template config, DB schema, RLS, `enabled_stages` population, finalize RPC, and workflow engine stay intact. Alert copy stays the same — only the required-stage set becomes dynamic.

### Tests
Add `src/test/hrFinalizationRequiredStages.test.ts`:
- Full 5-stage chain → requires self/manager/skip/bu locked.
- Chain `self, dept_head, bu_head, hr` with `manager_id`/`skip_id` null → requires only self/dept_head/bu_head (regression case).
- Chain including `bu_head` but `bu_head_id` null → bu_head auto-dropped.

### Risk & impact
- Data: none.
- Workflow: none — corrects the UI gate to match already-resolved stages.
- Regression: low. Existing full-chain templates keep the same required set because their `enabled_stages` still contain self/manager/skip/bu.
- Rollback: revert the single component file.

### Docs
Append a one-liner to the annual-review overview mem noting: HR Finalization required-stage set is derived from `instance.enabled_stages` minus `hr` and minus unmapped reviewers — never hardcoded.