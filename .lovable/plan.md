## Diagnosis

All three instances are stuck in `pending_dept` even though there is no Dept Head assigned. Biswajit Sahoo is the BU Head (and is also the reporting manager for 101805 and 101865). The self review is locked, but the workflow can't advance because `enabled_stages` still lists `dept_head` while `dept_head_id` is NULL — so nobody can act, and Biswajit's BU queue never receives them.

| Code | Employee | Reporting Mgr | Dept Head | BU Head | Status | Enabled Stages |
|------|----------|---------------|-----------|---------|--------|----------------|
| 101805 | Alok Kumar Singh | Biswajit Sahoo | — | Biswajit Sahoo | pending_dept | self, dept_head, bu_head |
| 101865 | Brajkishore Kumar Sinha | Biswajit Sahoo | — | Biswajit Sahoo | pending_dept | self, dept_head, bu_head |
| 101940 | Prashant Kumar | Chandan Kumar Pandit | — | Biswajit Sahoo | pending_dept | self, dept_head, bu_head |

Root cause is the same pattern as **ADR-155 (collapsed Dept/BU)** — the normalisation trigger did not strip `dept_head` when `dept_head_id` was NULL (as opposed to equal to `bu_head_id`). Self-review is locked, so it's safe to skip straight to the BU Head.

## Plan

### 1. Repair (data migration)
For the three instances:
- Set `enabled_stages = ["self", "bu_head"]`
- Set `overall_status = 'pending_bu'`
- Log entries in `annual_review_access_audit` (action `management_stage.backfilled` reused per ADR-155b convention, with reason "collapsed dept-head skip — ADR-155c")

### 2. Preventive guard (ADR-155c)
Extend `trg_enforce_collapsed_dept_bu_normalise` (or add a sibling trigger) so that whenever `dept_head_id IS NULL` on an active instance whose `enabled_stages` contains `dept_head`, the stage is automatically stripped and status collapses from `pending_dept` → `pending_bu` (when self is locked).

### 3. Verification
- Confirm all three instances appear in Biswajit's `get_my_annual_review_queue` result.
- Sweep for any other current-cycle instances where `overall_status = 'pending_dept'` AND `dept_head_id IS NULL` and repair them the same way (report the list before applying).

No UI changes. No template/scoring changes.