---
name: Annual Review — Head Master Authoritative + Cascade
description: dept_head_id/bu_head_id must always mirror Organization Settings; self-is-head short-circuits; manager is never a fallback; org-master edits cascade pre-approval only
type: feature
---

POLICY §AR-HEAD-MASTER-AUTHORITATIVE (revised 2026-07-13).

Rules:
1. Employee IS BU head → chain ends after `skip_manager`. Drop `dept_head`, `bu_head`, `hr` from `enabled_stages`. `dept_head_id=NULL`, `bu_head_id=NULL`.
2. Employee IS Dept head → drop `dept_head` from `enabled_stages`, `dept_head_id=NULL`.
3. Otherwise `dept_head_id=departments.head_user_id` and `bu_head_id=business_units.head_user_id` at all times.
4. Manager is NEVER a fallback for dept/BU stage. Missing configured head = stage skipped.
5. Triggers `trg_cascade_department_head_change` / `trg_cascade_bu_head_change` propagate org-master edits pre-approval only (dept: status ≤ pending_dept; BU: status ≤ pending_bu). Post-approval rows are frozen — HR must do explicit re-mapping.
6. Completed instances are frozen; correction requires explicit reopen.
7. Every change (sweep or trigger cascade) audited into `annual_review_head_remap_audit_YYYY_MM`.

Seeder code (`seedInstances*`) and `hierarchyGuard.ts` must produce the same output as the trigger; drift here is the root cause of stale reviewer chains.