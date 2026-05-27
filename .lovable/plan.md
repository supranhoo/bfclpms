## Goal

Add a new collapsible action **"Copy KPI to Other Employees"** in the Admin KPI Editor (`AdminKpiEditorForm.tsx`), placed directly below the existing **"Copy KPI to Other Months"** collapsible. Reuse existing primitives (`EmployeeCombobox`, `fetchAllPaged`, duplicate-detection map) so behavior matches `CopyKrasDialog`.

## Scope

- Single new UI section in `src/components/admin/AdminKpiEditorForm.tsx`. No new files, no schema changes, no RPC changes.
- Uses the **current edited form values** as the source payload (matches the existing months-copy semantics — copy reflects unsaved edits).
- Target period = same `review_period` + `review_year` as the source KPI (employees-only copy; cross-period copy stays in the global `CopyKrasDialog`).

## UI changes (exact location)

Inside `AdminKpiEditorForm`, after the `Copy KPI to Other Months` Collapsible (~line 952), add a sibling Collapsible:

```text
[ Copy KPI to Other Months  v ]
[ Copy KPI to Other Employees v ]   ← NEW
   ├─ EmployeeCombobox (multi, excludes current employee, shows duplicate badge per target)
   ├─ "X employee(s) selected · Y duplicate(s) will be skipped" line
   └─ [ Copy to N employee(s) ] button
```

Visual parity: same `Button variant="outline"` trigger, same `Copy` lucide icon, same chevron, same muted info panel inside.

## Reuse (no duplication)

- `EmployeeCombobox` from `src/components/admin/EmployeeCombobox.tsx` (already supports `multiple`, `excludeIds`, `duplicateCounts`).
- `fetchAllPaged` from `src/lib/fetchAll.ts` for full active-roster paging (POLICY §94 / `mem://architecture/profiles-query-policy`).
- Same duplicate-detection algorithm as `CopyKrasDialog` (composite key `kra_name|||kpi_name` scoped to employee + period + year).
- Same `formatKpiInsertError` for error toasts.
- Same `kpi_audit_logs` insert pattern as `handleCopyToMonths`, with new `action = 'admin_copy_to_employee'`.

## Validation rules

1. **Source KPI must be saved** (i.e. `kpi?.id` exists) — disable trigger otherwise.
2. **At least one target employee** selected → otherwise Copy button disabled.
3. **Duplicate guard** — for each target employee, query `kpis` where `employee_id IN targets AND kra_name = … AND kpi_name = … AND review_period = … AND review_year = …`. Skip those rows; show amber warning when count > 0 (mirrors `CopyKrasDialog` lines 394–401).
4. **Current employee excluded** from picker via `excludeIds={[kpi.employee_id]}`.
5. **Org-KPI scope safety** — if `is_org_level && org_level_scope === 'employee'`, also upsert `org_kpi_values` placeholder rows (same logic as `CopyKrasDialog` lines 224–255). Org-level `organization`/`department` scoped KPIs copy `is_org_level=true` with the existing scope (no new okv rows needed — value is shared).
6. **Form dirty-state** — if user has unsaved structural edits and clicks Copy, show a `toast.warning` requiring Save first OR explicitly use the in-form values. Decision: **use current form values** (same as months-copy already does at lines 311–340) for consistency; document with a small helper text "Uses current form values".
7. **kpis table unique constraint** (`mem://infrastructure/database/duplicate-kpi-prevention-constraint`) acts as final server-side safety net — any race-condition duplicate surfaces via `formatKpiInsertError`.

## Implementation outline

State (alongside existing copy-to-months state, ~line 80):
```ts
const [copyToEmployeesOpen, setCopyToEmployeesOpen] = useState(false);
const [copyTargetEmployeeIds, setCopyTargetEmployeeIds] = useState<string[]>([]);
const [copyTargetExisting, setCopyTargetExisting] = useState<Map<string, Set<string>>>(new Map());
const [copyingToEmployees, setCopyingToEmployees] = useState(false);
const [employeesForCopy, setEmployeesForCopy] = useState<EmployeeOption[]>([]);
```

Two new effects:
- Fetch active employees via `fetchAllPaged` when `copyToEmployeesOpen` first becomes true (cached for dialog lifetime).
- Fetch existing target KPIs (same period+year, same kra_name+kpi_name) whenever `copyTargetEmployeeIds` changes; build duplicate map.

Handler `handleCopyToEmployees`:
- Build insert payload from current `formData` (same shape as `handleCopyToMonths` lines 311–340) replacing `employee_id` per target and using the **current** `review_period`/`review_year`.
- Filter out duplicates per target using the map.
- Batch `supabase.from('kpis').insert(rows)`.
- For employee-scoped org KPIs, upsert into `org_kpi_values` (reuse logic from `CopyKrasDialog`).
- Per-row `kpi_audit_logs` insert with `action: 'admin_copy_to_employee'`, `metadata: { source: 'admin_copy_to_employee', target_employee_id, source_kpi_id }`.
- Invalidate the same query keys as `CopyKrasDialog` `onSuccess` (lines 260–272).
- Toast success/skip counts; collapse on success.

## Risk & Impact

| Area | Impact | Mitigation |
|---|---|---|
| Data | New `kpis` inserts only; no schema change | Server-side uniqueness constraint already enforces no duplicates |
| Workflow | None — copies create `status='kra_set'` rows | Matches months-copy behavior |
| UI/UX | Adds one collapsible; no existing layout shifts | Mirrors styling of months-copy collapsible |
| Regression | Low — isolated to AdminKpiEditorForm | Existing months-copy untouched |
| Performance | Picker uses paged fetch | Same pattern as CopyKrasDialog |

## Out of scope

- Cross-period copy (already covered by `CopyKrasDialog` "Copy KRAs" admin tool).
- Bulk copy of multiple source KPIs (this dialog is single-KPI by definition).
- Notifications/emails on copy (deferred — matches months-copy, which is also silent).

## Tests

New test file `src/test/adminKpiEditorCopyToEmployees.test.tsx`:
- Renders the new collapsible only when `kpi.id` exists.
- Excludes the source employee from the picker.
- Disables Copy button when no targets selected.
- Shows duplicate warning when target already has the KPI.
- Calls `supabase.from('kpis').insert` with N target rows minus duplicates.

## Docs

- `DOCUMENTATION.md` → Admin → KPI Editor: add "Copy to Other Employees" subsection.
- `POLICY.md` §94 (paged roster) — no change; reuse compliant.
- `mem://features/admin/copy-kras-org-kpi-integrity` → append note that the editor-level employee copy follows the same Org KPI integrity rules.

## Rollback

Pure additive change — remove the new state block, the new Collapsible JSX, the new effect, and the new handler. No migrations to revert.
