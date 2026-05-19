
# Per-File Employee Targeting for Org KPI Supporting

## Goal
Make it explicit and controllable **which supporting file goes to which employee** on an Org KPI — without breaking the current "everyone gets the same file" default and without inventing a new scope concept. Targeting is always *within* the KPI's existing scope (organization / department / per-employee).

## Behaviour by Org KPI scope

| KPI scope | Default | Targeting allowed? | Whom can a file be targeted to? |
|---|---|---|---|
| `organization` | File goes to **all mapped employees** | Yes (optional) | Any subset of the mapped employees (resolved via `useOrgKpiMappedEmployees`) |
| `department` | File goes to **all mapped employees in the mapped departments** | Yes (optional) | Any subset of mapped employees, OR any subset of mapped departments (department selection expands to its members at propagation time) |
| `per-employee` / `scoped` | File belongs to **that one employee's OKV row** | N/A — already 1:1 | n/a |

Empty targeting = "applies to everyone in scope" (today's behaviour). This keeps the simple case one click and only adds friction when an admin actually needs targeting.

## Data model

Extend each entry in `org_kpi_values.evidence_files` (JSONB) with two optional fields — no new tables, fully backward compatible:

```jsonc
{
  "url": "...",
  "label": "Q1 Safety Cert",
  "added_by": "uuid",
  "added_at": "2026-05-19T...",
  // NEW (both optional, both empty = applies to all in scope)
  "applies_to_employee_ids": ["uuid", "uuid"],
  "applies_to_department_ids": ["uuid"]   // only meaningful for department-scope KPIs
}
```

Rules enforced in the propagate / resync RPCs:
- If both arrays empty → file applies to every mapped employee (current behaviour).
- Else → file applies to `union(applies_to_employee_ids, members_of(applies_to_department_ids))` **intersected with the KPI's mapped employee set** (defensive: stale IDs are ignored).
- Per-employee scope KPIs: targeting fields are not exposed in the UI and are ignored if present.

## Backend changes

1. **Migration**
   - No schema change to the column (it's JSONB). Add a CHECK/validation trigger on `org_kpi_values` that, when `evidence_files` is set, validates each element shape (url required; arrays are uuid[] if present).
   - Update `resync_org_kpi_evidence(p_okv_id, p_mode)`:
     - Compute the per-employee file list = filter `evidence_files` where `(applies_to_employee_ids = [] AND applies_to_department_ids = [])` OR employee is in `applies_to_employee_ids` OR employee's department is in `applies_to_department_ids`.
     - Push that *filtered* array (urls + labels) into each `review_submissions.evidence_urls` / `evidence_url`.
     - `append_only` still only adds URLs not already present per employee.
     - `replace_with_stepback` replaces with the filtered list and steps back rows past `self_review`.
   - Update `propagate_org_kpi_value` similarly so initial propagation respects targeting (uses the same overwrite policy ladder from ADR-053 — no change to that ladder).
   - Update `org_kpi_evidence_parity` to compute drift against the **filtered expected list per employee**, not the raw OKV array. Add a sibling RPC `org_kpi_evidence_targeting(p_okv_id)` that returns `{ employee_id, expected_urls[], current_urls[], drift_kind }` for the matrix view.

2. **Audit**
   - Every change to targeting arrays emits `ORG_KPI_EVIDENCE_TARGETING_CHANGED` to `kpi_audit_logs` with diff of added/removed employee/department IDs per file. Honors the System Performer Attribution rule (`performed_by = NULL` when triggered by automated rules).

## UI changes (Evidence Manager Sheet)

Inside `OrgKpiEvidenceManagerSheet.tsx`, each file row gains a compact "Applies to" control:

- **Org-scope KPI:** badge showing `All mapped employees (N)` by default. Click → popover with a searchable multi-select of mapped employees. Selecting any subset switches the badge to `N of M employees` with a small "× clear" to revert to default.
- **Department-scope KPI:** badge showing `All mapped departments (N)` by default. Popover has two tabs: **Departments** (multi-select) and **Employees** (multi-select within mapped departments). Effective coverage count shown live ("Will reach 14 employees").
- **Per-employee scope:** no targeting control (file is implicitly 1:1).

New small panel below the file list: **"Distribution preview"** — a read-only table:

```
Employee            Dept       Files this employee will receive
─────────────────────────────────────────────────────────────
Asha Patel          Plant A    Q1 Cert, Plant-A Audit
Ravi Kumar          Plant B    Q1 Cert
…                                                          [Show 12 more]
```

Driven by `org_kpi_evidence_targeting` RPC. This is the direct answer to "which supporting is attached with which employee".

Resync buttons unchanged in label; their behaviour now respects targeting.

## Files to touch

- New migration: `evidence_files` shape validation trigger + updated `propagate_org_kpi_value`, `resync_org_kpi_evidence`, `org_kpi_evidence_parity`, new `org_kpi_evidence_targeting`.
- `src/hooks/useOrgKpiEvidenceFiles.ts` — extend `OrgKpiEvidenceFile` type; add `useOrgKpiEvidenceTargeting(okvId)`.
- `src/components/admin/OrgKpiEvidenceManagerSheet.tsx` — per-row targeting popover + distribution preview panel.
- New `src/components/admin/EvidenceTargetPopover.tsx` — reusable employee/department multi-select bound to mapped scope.
- `src/components/admin/OrgKpiParityBadge.tsx` — tooltip lists per-employee drift detail from the new RPC (no visual chrome change).
- `src/pages/admin/OrgKpiEvidenceDemo.tsx` — add a third mock card showing a targeted file.
- `DOCUMENTATION.md` + `POLICY.md` — add "Per-file targeting" section under Org KPI Evidence; bump Version History.
- New ADR `docs/adr/ADR-064.md` — record the decision and the "empty targeting = applies to all in scope" default.
- Memory: append a new entry under "Multi-File Evidence Storage" or add a sibling `mem://features/admin/org-kpi-evidence-targeting`.

## Risk & Impact Report

- **Data impact:** Additive JSONB fields, no destructive schema change. Existing rows continue to mean "applies to all". Validation trigger could reject malformed historical rows — migration includes a one-time normalise pass to coerce missing fields to `[]`.
- **Workflow impact:** Targeting changes that *narrow* the audience for an already-propagated file behave like "replace_with_stepback" for newly-excluded employees (their evidence is removed and they are sent back to self_review if past it). Targeting changes that *broaden* audience behave like "append_only" for newly-included employees. Both branches are audited.
- **UI/UX:** Default path is unchanged (zero clicks for the common org-wide certificate). Popover is opt-in. Distribution preview is collapsible.
- **Regression risk:** `propagate_org_kpi_value` is shared with non-evidence flows; changes are gated behind a new internal helper `_filter_files_for_employee(...)` invoked only inside the evidence projection block. Score/value propagation paths are untouched.
- **Security:** RLS unchanged — `evidence_files` continues to live on `org_kpi_values` (admin-managed). Per-employee read access continues via `review_submissions` RLS.
- **Mitigation:** Unit tests for `_filter_files_for_employee` (empty arrays = all; subset; department expansion; stale id ignored; per-employee scope ignores targeting). Integration test on `resync_org_kpi_evidence` covering append vs replace with mixed targeted/untargeted files. Mock fixtures in `OrgKpiEvidenceDemo.tsx` cover all three scope types.
