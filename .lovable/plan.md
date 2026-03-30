

## Plan: Redesign Employee Mapping — Unified Table with Multi-Select + Architect Guidance

### Current State
The `ProgramEmployeeMapping` component uses 5 tabs (Division, Dept/BU, Designation, Grade, Individual) where each tab shows a checkbox list of that entity type. Mappings are stored in `incentive_program_mappings` as `(program_id, mapping_type, mapping_value)`.

### What Changes

**Replace tabs with a single sortable employee table + multi-select checkboxes.**

The table shows ALL active employees with columns: `☑ | Employee Name (Code) | Designation | Department | Business Unit | Division | Level | PMS Grade`. Each column header is sortable. A search bar filters across name/code. The admin selects employees via checkboxes — each selected employee creates a `mapping_type: 'employee'` row.

Above the table, keep the **summary badges** showing counts, and add **bulk filter controls** (optional dropdowns for Division, BU, Department, Designation, Grade) so the admin can narrow the list and then "Select All Filtered" in one click.

### UI Layout

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 👥 Employee Mapping                                                         │
│ Define which employees are enrolled in this program.                        │
│ [3 selected]  [Badge: 2 dept(s)]  [Badge: 1 individual]                    │
├──────────────────────────────────────────────────────────────────────────────┤
│ Filters: [Division ▼] [BU ▼] [Department ▼] [Designation ▼] [Grade ▼]      │
│ [🔍 Search name or code...]                [☑ Select All Filtered] [Clear] │
├────┬─────────────────────┬────────────┬──────────┬─────────┬────────┬───────┤
│ ☑  │ Employee (Code) ↕   │ Desig ↕    │ Dept ↕   │ BU ↕    │ Div ↕  │Grade↕│
├────┼─────────────────────┼────────────┼──────────┼─────────┼────────┼───────┤
│ ☑  │ Abhas Sharma (100020)│ Operator  │ Smelter  │ Ops     │ Prod   │ G3   │
│ ☐  │ Ravi Kumar (100045) │ Supervisor │ Port     │ Port BU │ Logist │ G4   │
│ ☑  │ Meera Singh (100061)│ Engineer   │ Maint    │ Maint BU│ Prod   │ G5   │
│    │  ... (all active employees, paginated or virtualized)                  │
├────┴─────────────────────┴────────────┴──────────┴─────────┴────────┴───────┤
│ Showing 142 of 350 employees │ Page [1] [2] [3] ...                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Architect Guidance: What a Robust Incentive Mapping Should Have

Beyond the UI redesign, here are architectural considerations for a production-grade incentive mapping system:

1. **Mapping Modes** — Keep support for both:
   - **Rule-based** (division/dept/BU/designation/grade): Auto-includes future hires matching criteria. Good for broad programs.
   - **Individual** (employee-level): Explicit inclusion/exclusion overrides. Good for port incentive where rates are per-person.
   
   The current DB schema (`mapping_type` + `mapping_value`) already supports both. The new UI should allow admins to **see the resolved list** (all employees matching rules) and **manually add/remove overrides**.

2. **Exclusion List** — An admin should be able to explicitly exclude an employee even if they match a rule. This requires a new `mapping_type: 'exclude_employee'` value. The resolution logic in `useResolvedProgramEmployees` would subtract exclusions.

3. **Effective Date Range on Mappings** — For employees who join/leave a program mid-year, each mapping row should optionally carry `effective_from` and `effective_to` dates. This prevents retroactive recalculations.

4. **Preview Before Save** — Show a "Preview Enrolled Employees" count that resolves all rules + individual overrides in real-time before the admin commits.

5. **Audit Trail** — Log who added/removed each mapping and when (already partially covered by `created_at`; needs `created_by`).

### Proposed Implementation Scope (This Iteration)

Only the **UI redesign** — replace tabs with unified table. No schema changes needed since we continue using `mapping_type: 'employee'` for individual selections, and the existing rule-based types remain functional.

### Changes

**`src/components/incentive/ProgramEmployeeMapping.tsx`** — Full rewrite:
- Remove `Tabs` component entirely
- Fetch all active profiles with joins: `profiles → departments → business_units → divisions`
- Build a sortable, filterable table with checkboxes
- Multi-select: header checkbox for "select all filtered"
- Filter dropdowns for Division, BU, Dept, Designation, Grade above the table
- Pagination (20 per page) to handle large employee counts
- Each checkbox toggle calls `addMapping` / `removeMapping` with `mapping_type: 'employee'`
- Keep existing summary badges

**`src/hooks/useIncentivePrograms.ts`** — Update `useAddProgramMapping` to support bulk insert:
- Add `useBulkAddProgramMappings()` for "Select All Filtered" (inserts multiple rows in one call)

**`DOCUMENTATION.md`** — v2.15.12 changelog

**`POLICY.md`** — Add note: employee mapping UI must show resolved employee list, not abstract entity pickers

### Files Modified

| File | Change |
|------|--------|
| `src/components/incentive/ProgramEmployeeMapping.tsx` | Replace tabs with unified sortable table + multi-select |
| `src/hooks/useIncentivePrograms.ts` | Add `useBulkAddProgramMappings` for select-all |
| `DOCUMENTATION.md` | v2.15.12 changelog |
| `POLICY.md` | Mapping UI invariant |

### Risk Assessment
- **Regression**: Zero — same DB table, same `mapping_type`/`mapping_value` schema
- **Data**: No schema changes; existing mappings of type `department`, `division` etc. remain valid and continue working in calculation logic
- **Performance**: Profile query with joins is lightweight; pagination prevents DOM overload

### Future Iterations (Not in This PR)
- Exclusion list (`mapping_type: 'exclude_employee'`)
- Effective date range per mapping
- `created_by` audit field on mappings
- Preview panel showing resolved count before save

