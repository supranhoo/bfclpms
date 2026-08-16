---
name: Console stage supersede
description: Performance Console worksheet uses bulk-review leapfrog semantics — a higher stage signs off and closes the stages below (ADR-290)
type: feature
---
`bu_console_kpi_advance` allows any FORWARD target stage within the employee's resolved
workflow (`get_employee_workflow`). Backwards = refused (`stage_mismatch`; use Rollback
Requests). Superseded stages are filled only when empty with the carried-forward score
(management → hr_pms → skip → audit → functional → manager → self); the target stage is
written outright. Refusals: `self_not_submitted`, `auditor_takes_precedence`,
`final_score_locked`, `kra_set_admin_only`, `no_submission`, `not_scored`.
Each closed stage logs `BU_CONSOLE_STAGE_SUPERSEDED`. UI planner: `src/lib/review/supersedeChain.ts`.
POLICY §CONSOLE-STAGE-SUPERSEDE.
