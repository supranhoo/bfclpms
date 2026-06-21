---
name: Self stage value snapshot
description: KpiJourneySection Self card must reconstruct the employee's submitted achieved value, not display the shared (reviewer-mutable) achieved_value column
type: feature
---
`review_submissions.achieved_value` is a SHARED column. Downstream reviewer
stages (e.g. `BULK_STAGE_SIGNOFF_AUDITOR`, AuditScorecard edits) overwrite
it with their own value, while `self_score` / `self_rating` stay frozen
from self-submit time. The Self journey card therefore mixed a mutable
column (Value) with a frozen column (Rating) and could display nonsense
like "Value 3 / Rating 2" (RCA Jun-2026, KPI 8b6e2e67…).

**Rule:** the Self stage card in `KpiJourneySection` MUST resolve its
displayed achieved value through `resolveSelfAchievedValue`
(`src/lib/review/resolveSelfAchievedValue.ts`). Logic, in order:

1. No reviewer-stage `*_achieved_value` written → trust `achieved_value`.
2. If recomputing the rating from `achieved_value` still equals
   `self_score` → trust it (pristine).
3. Otherwise reverse-derive from the KPI's `r0…r5` thresholds (and for
   binary/tiered KPIs use `self_score` directly).
4. If unambiguous candidate found → display it (recovered).
5. Else display "—" with a tooltip referring auditors to the audit log.

**Do not** add a third UI fallback that reads `submission.achieved_value`
for the Self stage — it reintroduces this bug.

**Follow-up (Part 2, pending):** add a dedicated
`review_submissions.self_achieved_value` column, backfill from
`kpi_audit_logs` (`ORG_KPI_PROPAGATED` / self-submit events), stop
overwriting `achieved_value` from auditor/manager flows, and switch the
resolver to read the new column.
