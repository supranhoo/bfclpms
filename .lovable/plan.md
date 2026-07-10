## Add "Pending With" column to KPI Scorecard Detail

Add a new column between **Status** and existing columns that answers "who is this KPI currently sitting with?" — a person's name when the next actor is a specific user, or a role label when it's a functional queue.

### Resolution rules (per row)

Driven by the KPI's current `status` (= last completed stage) plus the employee's resolved workflow chain (`get_employee_workflow`) to know the **next** stage:

| Current `status` | Next stage / owner | Displayed value |
|---|---|---|
| `approved` | none | `—` |
| `kra_set` + Org KPI | Org KPI Data Owner(s) | Data Owner name(s), comma-joined (already in `dataOwnerNames`) |
| `kra_set` + Individual KPI | Self review | Employee name (self) |
| `self_review` | Manager check | Reporting Manager's name |
| `manager_check` | next per workflow | If next = `skip_level_check` → Skip Manager name; if `hr_pms_review` → "HR PMS"; if `audit` → "Audit"; if `management_review` → "Management" |
| `skip_level_check` | next per workflow | Same rule as above (person name for skip fallback, role label otherwise) |
| `hr_pms_review` | next per workflow | "Audit" / "Management" / `—` if terminal |
| `audit` | next per workflow | "Management" / "HR PMS" / `—` if terminal |
| `management_review` | next per workflow | Usually terminal → `—` |

Person-name stages: **Self, Manager, Skip-Level**. Queue-label stages: **HR PMS, Audit, Management** (no individual name — those are role-wide queues).

### Technical details

1. **Data fetch** (`fetchScorecardForPeriod` in `src/pages/reports/KpiScorecardDetail.tsx`):
   - Extend the `profiles` select to include `reporting_manager_id, functional_manager_id`.
   - Batch-call `get_bulk_employee_workflows(employee_ids, period, year)` once per fetch to get each employee's resolved stage chain (per POLICY §105 / `per-employee-workflow-resolution` memory — never hardcode).
   - Build lookup maps: `managerNameByEmpId`, `skipManagerNameByEmpId`, `stageChainByEmpId`.

2. **Derivation helper** (new `src/lib/kpiPendingWith.ts` — pure function, testable):
   ```ts
   resolvePendingWith({ status, isOrgKpi, dataOwnerNames, employeeName, managerName, skipManagerName, stageChain }): string
   ```
   Encapsulates the rules table above. Returns `—` for terminal / unknown, string otherwise.

3. **UI additions** in `KpiScorecardDetail.tsx`:
   - Add `pendingWith: string` to the `FlatRow` interface, populated inside `fetchScorecardForPeriod` via the helper.
   - Add `{ field_key: 'pending_with', default_label: 'Pending With', default_sort: 295 }` after `status` in `KSD_DEFAULT_FIELDS` so it appears in table + Excel export + Report Builder field manager.
   - Add a matching `TableHead` (sortable) + `TableCell` in the rendered table.
   - Add a case in `ksdValueFor` returning `r.pendingWith`.
   - Optional: an Excel-style column filter (`pendingWithFilter`) mirroring the existing status filter pattern.

4. **Tests** (`src/test/kpiPendingWith.test.ts` — vitest):
   - `approved` → `—`
   - `kra_set` + org KPI with 2 owners → joined names
   - `kra_set` + individual → employee name
   - `self_review` → manager name
   - `manager_check` with next=`skip_level_check` → skip name; next=`audit` → "Audit"; next=`hr_pms_review` → "HR PMS"; next=`management_review` → "Management"
   - `hr_pms_review` on `self_hr_pms` workflow (terminal) → `—`
   - Missing manager (null) with next=Manager → `—` fallback

### Risk & impact

- **Data impact:** Read-only. No schema/RLS/migration.
- **Workflow impact:** None — purely a display column derived from existing status + workflow chain.
- **Regression risk:** Low. All logic centralised in a pure helper with tests; existing fields untouched.
- **Perf:** One extra bulk RPC call per Load (already used by other reports; batched at 25). Payload grows by two profile columns. Negligible on the 2,700-row scale shown.
- **Zero-hardcoding:** Uses `get_bulk_employee_workflows` — no hardcoded stage arrays.
