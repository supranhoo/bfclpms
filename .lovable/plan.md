

## Plan — Define the Org KPI Data Entry process end-to-end, then schedule audited fixes

### Goal
Before touching any more code, produce a single canonical specification of the Org KPI Data Entry pipeline — every stage, every actor, every status transition, every storage artifact, every UI surface, and every change shipped since the feature's inception. Then, with that spec as the authoritative reference, sequence the audited fixes (Buckets B/C/F/I + RPC patch) in safe order.

This is an inspection + writing loop. No code, no DB changes, no repair execution.

---

### Deliverable 1 — `docs/specs/org-kpi-data-entry-spec.md` (canonical SSOT)

A single markdown spec organized into 9 sections:

**1. Purpose & scope**
What an "Org KPI" is, how it differs from individual KPIs, who the actors are (Admin, Data Owner, Employee, Manager, Auditor, Management, HR PMS), and which periods/companies are in scope.

**2. Data model**
Every table touched, with column-by-column purpose:
- `kra_categories` (the `is_org_level` flag)
- `kpis` (org-level rows: `is_org_level=true`, employee_id present, status field semantics)
- `org_kpi_values` (the data-owner-entered values; `status`, `achieved_value`, `sub_factors`, scoping by `department_id` / `employee_id`)
- `org_kpi_data_owners` (ownership mapping per category+kra+kpi)
- `review_submissions` (the per-employee workflow row created by propagation)
- `kpi_audit_logs` (every transition)
- Plus how `org_kpi_values` ↔ `kpis` ↔ `review_submissions` join via `(category_id, kra_name, kpi_name, review_period, review_year)`.

**3. Lifecycle state machine**
The full state diagram — for both the **definition** (`org_kpi_values.status`) and the **per-employee instance** (`kpis.status`):
```
DEFINITION:  draft → propagated → (sent_back) → propagated → approved
INSTANCE:    kra_set → self_review → manager_check → … → approved
```
Plus the cross-table contract: when definition is `propagated`, every assigned employee's `kpis.status` MUST have advanced past `kra_set`. Violation = bug.

**4. End-to-end happy-path flow**
Step-by-step narrative with the exact actor, UI, RPC, and storage write at each step:
1. Admin enables `is_org_level=true` on KRA category
2. Admin assigns data owners (`org_kpi_data_owners`)
3. KRA rollover creates per-employee `kpis` rows in `kra_set`
4. Data owner opens Org KPI Data Entry, enters value → `org_kpi_values` row created (status=`draft`)
5. Data owner clicks Propagate → `propagate_org_kpi_value` RPC runs → for each assigned employee: insert `review_submissions` + advance `kpis.status` to `self_review` + audit log
6. Definition row advances to `propagated`
7. Employee sees pre-filled self-review, submits
8. Workflow continues per resolved template
9. Final approval → percolation to multi-month siblings (if applicable)

**5. UI surface map**
Every page that touches Org KPIs and what it shows:
- `OrgKpiDataEntry.tsx` — definition-centric grid
- `OrgKpiPendingReport.tsx` — owner action queue
- `OrgKpiEntryCard.tsx` — single-KPI editor
- Scorecard Detail report — instance-centric
- Employee Dashboard / Self Review Sheet — instance-centric
- Admin Data Repair tab — repair tooling
For each: classification predicates (Pending / Entered / Propagated / Stuck), counting unit, who can see it.

**6. Counting & classification rules**
Authoritative table reconciling all 4 surfaces using a single vocabulary. This locks in v2.65.7+v2.65.8 dual-count and "Stuck" definitions and codifies them so future surfaces inherit the same rules.

**7. Repair tooling reference**
Every signature in the data integrity census (Buckets A–I from the audit) mapped to the tool that handles it, the trigger condition, and what it does.

**8. Version history (since inception)**
Chronological log of every behaviour change shipped — pulled from `DOCUMENTATION.md`, `mem://features/admin/copy-kras-org-kpi-integrity`, `mem://features/admin/org-kpi-management-suite`, `mem://features/admin/data-repair-engine`, `mem://features/admin/compliance-kpi-sub-factors`, and the recent v2.65.x patches. Each entry: version, date, what changed, why, files touched, residual gaps.

**9. Known gaps & open work**
Direct copy of the ranked fix list from the 2026-04 audit (Buckets B/C/F/I + RPC patch + audit-trail completeness), each tagged with current status (repaired / pending / not yet implemented).

### Deliverable 2 — `docs/specs/org-kpi-fix-roadmap.md` (sequenced fix plan)

After the spec is written, produce a **safe execution order** for the audited fixes — because some fixes depend on others:

| # | Fix | Why this order | Dependencies |
|---|---|---|---|
| 1 | Run existing repair tools (Buckets B + C) | Clears 14 + 6 known-bad rows; zero code; gives clean baseline. | None. |
| 2 | Add Bucket F repair pass (87 rows) | Largest impact; same pattern as existing tool; data-only, no UI behaviour change. | Step 1 done so we don't repair against drifting data. |
| 3 | Patch `propagate_org_kpi_value` RPC | Stops new B/C/F from being created. Ships with audit-log-inside-loop. | Step 2 done so historical mess is cleared before behaviour change. |
| 4 | Bucket I orphaned-ownership UI | Surfaces 44 unowned KPIs; data owner UX. | Independent. |
| 5 | Pre-flight propagation preview | UX polish on the now-correct RPC. | Step 3. |
| 6 | Unit labels on remaining count tiles | Pure UI clarity. | Independent. |

Each entry includes effort, files touched, and rollback plan.

---

### Out of scope (this loop)
- No code edits.
- No DB migrations.
- No edge function changes.
- No data repair execution.
- No memory file updates yet (those happen alongside the actual fixes in later loops).

### Risk & impact
- **Data:** read-only.
- **Workflow:** none.
- **Output:** two markdown specs in `docs/specs/`.
- **Why this is the right next step:** without a single canonical spec, every subsequent fix risks contradicting an earlier patch. The audit told us *what's broken*; the spec tells us *what "correct" looks like* so fixes converge instead of drifting.

### After approval
Loop 1 (next) writes Deliverable 1 + 2. Then you pick which roadmap step to execute first — recommended order is the table above, starting with the zero-code repair-tool click.

