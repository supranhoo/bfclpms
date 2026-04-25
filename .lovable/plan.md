## Plan — Add "Assigned Workflow" column to KPI Journey Excel export only

### Goal
Add an **Assigned Workflow** column to the **Excel export** of the KPI Journey Timeline report. The on-screen table is **unchanged** (kept dense by request).

The cell value is a **compact stage-chain string per employee**, e.g.:
- `Self → L1 → HR PMS → Audit → Mgmt`
- `Self → L1 → Skip → HR PMS → Audit → Mgmt`
- `Self → L1` (short workflow)

### How the chain is resolved
Per **employee + period**, using the same hierarchy as the existing `get_bulk_employee_workflows` RPC:

```text
period-specific employee → ongoing employee
  → period-specific department → ongoing department
    → period-specific pms_grade → ongoing pms_grade
      → global employee → global department → global pms_grade
        → system default workflow_template (is_default = true)
```

The resolved template's `stages` array is mapped to compact labels:

| DB stage             | Compact label |
|----------------------|---------------|
| `self_review`        | Self          |
| `manager_check`      | L1            |
| `skip_level_check`   | Skip          |
| `hr_pms_review`      | HR PMS        |
| `audit`              | Audit         |
| `management_review`  | Mgmt          |
| `approved`           | *(omitted — terminal)* |

Joined with `→`. Falls back to `'—'` when no workflow resolves.

### Changes

**1. Database — extend `get_kpi_journey_report` RPC (migration)**
- Add a `resolved_workflow` CTE that, for the **paged** KPIs only, joins through the hierarchy and returns the `stages` array per `employee_id`.
- Each output row gains `'workflowChain': text` — the pre-formatted compact chain string built in SQL using the label map above.
- Backward-compatible: existing fields untouched, RPC signature unchanged.

**2. Hook — `src/hooks/useKpiJourneyReport.ts`**
- Extend `KpiJourneyRow` with `workflowChain: string`.
- `fetchKpiJourneyExportData` already paginates the same RPC in 500-row batches — no signature change.

**3. UI — `src/pages/reports/KpiJourneyReport.tsx`**
- **No table changes.** No new `<TableHead>` / `<TableCell>`.
- In `handleExport`, insert one new field into the export object, immediately after `'Frequency'` and before `'Month'`:
  ```ts
  'Assigned Workflow': r.workflowChain,
  ```

**4. Tests — `src/test/bugBountyFixes.test.ts`**
- Add **BUG-024** asserting:
  - `KpiJourneyRow` type carries `workflowChain`.
  - `KpiJourneyReport.tsx` source includes the `'Assigned Workflow'` export key.
  - On-screen `<TableHeader>` block does **not** contain "Assigned Workflow" (regression guard so the column stays export-only).

**5. Documentation**
- `DOCUMENTATION.md` → bump to **v2.66.7.26**, document the new export-only column and the stage-label mapping.
- `POLICY.md` → add **§97**: *"The KPI Journey Timeline Excel export must surface the resolved workflow as a compact stage chain (e.g. `Self → L1 → HR PMS → Audit → Mgmt`) per employee, using the same workflow-resolution hierarchy as the workflow engine. The on-screen table remains unchanged to preserve column density."*

### Risk & Impact
| Area | Impact |
|------|--------|
| Data | Read-only RPC extension; no schema, no RLS, no column changes. |
| Workflow | None — resolution mirrors `get_bulk_employee_workflows`. |
| UI/UX | None — on-screen table unchanged. |
| Performance | Resolution runs on paged subsets only (≤500 per export batch); negligible cost. Payload gains one short string per row. |
| Regression | Low — RPC remains backward-compatible; no rendering paths altered. |

### Out of Scope
- No on-screen column.
- No filter on workflow.
- No change to the workflow engine or `get_bulk_employee_workflows`.
- No changes to other reports.
