# RCA: "All assigned KRA in March got removed"

## Finding: Assignments are NOT removed

I queried `audit_kpi_level_assignments` directly. **March 2026 still has all 338 KPI-level audit assignments intact**, distributed across the 4 auditors:


| Auditor        | Jan | Feb | Mar     | May |
| -------------- | --- | --- | ------- | --- |
| Auditor03      | 2   | —   | 84      | —   |
| Ayush Bansal   | 13  | 42  | 79      | —   |
| Mayank         | 13  | 49  | 108     | —   |
| Shekhar Sharad | 13  | 18  | 67      | 1   |
| **Total**      | 41  | 109 | **338** | 1   |


Earliest assignment row: `2026-02-26`, latest: `2026-05-01`. No deletion events in `system_audit_logs` or `kpi_audit_logs`. The assignment table has not been touched.

## Why the auditor sees an empty queue for March

Of the 338 March assignments, **337 KPIs are now `status = approved**` (terminal) and 1 is back at `self_review`. The Auditor Queue UI filters to KPIs whose current workflow stage is `audit` — so once KPIs progress past audit (HR PMS → Audit → Mgmt → Approved), they correctly disappear from the auditor's working list even though the assignment row still exists.

**This is expected behaviour, not data loss.** The auditor is interpreting "not in my list" as "assignment removed", but the underlying mapping is preserved (visible in reports, audit trail, KPI history).

## Separate but related issue: April has 0 assignments


| Period         | KPIs      | KPI-level audit assignments |
| -------------- | --------- | --------------------------- |
| March 2026     | 1,756     | 338                         |
| **April 2026** | **2,267** | **0**                       |


April has zero KPI-level audit assignments. Audit mappings are not auto-cloned during period rollover — each period currently requires manual (re-)assignment. With 476 KPIs already sitting in `hr_pms_review`/`audit` for April, auditors will see nothing in their queue until assignments are seeded.

## Recommended response to the auditor

1. Confirm that March assignments are intact (share the count by auditor above).
2. Explain that KPIs leave the auditor queue once they advance past the `audit` stage — this is by design, not deletion.
3. Flag the real gap: **April auditor assignments need to be created** (either via re-import, manual mapping, or by extending the period rollover to clone audit mappings forward).

## Proposed follow-up actions (require your approval before any change)

- **A. Communication-only**: Reply to auditor with the table above; no code change. Recommended first step.
- **B. UX clarity**: Add a small toggle in the Auditor Queue to "Show completed assignments" so auditors can see KPIs they audited that have since moved on. Pure frontend.
- **C. Period rollover**: Extend the KRA/period rollover engine to optionally carry forward `audit_kpi_level_assignments` to the next period (opt-in, audit-logged). Backend + admin UI.

No files will be modified until you pick A, B, C, or a combination.  
  
Lets Proceed with **C. Period rollover**: Extend the KRA/period rollover engine to optionally carry forward `audit_kpi_level_assignments` to the next period (opt-in, audit-logged). Backend + admin UI.