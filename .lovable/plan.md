## Goal
Add **Department Head** with the same model as BU Head: an Auto/Manual head per department, inline column on the Departments tab, audited mutation RPCs, and wired into the Annual Review reviewer chain plus available to notifications/reports.

## Risk & Impact
- **Data**: Additive only. Adds 4 columns to `public.departments` and a `dept_head_id` snapshot column to `annual_review_instances`. Rollback = drop columns; no data loss for existing rows (defaults NULL / `'auto'`).
- **Workflow**: Annual Review seeders (`seedInstancesForCycle`, `seedInstancesByRules`) gain a new snapshot field `dept_head_id`. Existing instances are unaffected (column nullable). New cycles populate it. UI / stage chain that uses it is a follow-up surface; the seed write is non-breaking.
- **UI**: New "Head" column on the Departments tab — same `BuHeadColumn`-style control (badge + Recalculate + Change picker with searchable combobox). One new admin action; no other screens change.
- **Regression**: Low. Pattern is a 1:1 copy of the proven BU Head pipeline. Reviewer chain change is additive (new column, new seeded value); consumers that don't read it keep working.
- **Scalability**: Lookups are O(department). One extra SELECT per seed batch (mirrors the existing BU head map).

## What changes visually
**Admin → Organization → Departments tab**: a new **Head** column to the right of `Sub-branches` / before actions, showing:
- Employee name + employee code, or "—" if unset
- Auto/Manual badge
- "Recalculate" icon button (admin/hr_pms only)
- "Change" button → opens the same searchable combobox dialog used for BU heads (any active employee, shows `Department · BU`, reason required ≥3 chars for manual override)

No other screens change in this delivery. (Annual Review UI surfacing of `dept_head_id` is out of scope below.)

## Plan

### 1. Migration `add_department_heads`
```sql
-- 1a. Columns on departments
ALTER TABLE public.departments
  ADD COLUMN head_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN head_source text NOT NULL DEFAULT 'auto' CHECK (head_source IN ('auto','manual')),
  ADD COLUMN head_updated_at timestamptz,
  ADD COLUMN head_updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX idx_departments_head_user_id ON public.departments(head_user_id);

-- 1b. Resolver — department-only scope, mirrors resolve_bu_head tie-break
CREATE OR REPLACE FUNCTION public.resolve_department_head(p_dept_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_winner uuid;
BEGIN
  WITH scope AS (
    SELECT p.id, p.reporting_manager_id, p.doj, p.level_id
    FROM public.profiles p
    WHERE p.department_id = p_dept_id
      AND COALESCE(p.is_active,true) = true
      AND COALESCE(p.is_dummy_employee,false) = false
  ),
  roots AS (
    SELECT s.* FROM scope s
    LEFT JOIN scope mgr ON mgr.id = s.reporting_manager_id
    WHERE s.reporting_manager_id IS NULL OR mgr.id IS NULL
  )
  SELECT r.id INTO v_winner
  FROM roots r
  LEFT JOIN public.levels lv ON lv.id = r.level_id
  ORDER BY
    CASE lv.name
      WHEN 'M0' THEN 0 WHEN 'M1' THEN 1 WHEN 'M2' THEN 2 WHEN 'M3' THEN 3
      WHEN 'M4' THEN 4 WHEN 'M5' THEN 5 WHEN 'M6' THEN 6 WHEN 'M7' THEN 7
      WHEN 'W1' THEN 8 WHEN 'W2' THEN 9 WHEN 'W3' THEN 10 WHEN 'W4' THEN 11
      WHEN 'W5' THEN 12 ELSE 99 END ASC,
    r.doj ASC NULLS LAST, r.id ASC
  LIMIT 1;
  RETURN v_winner;
END $$;

-- 1c. RPCs: set_department_head / recalculate_department_head
-- (admin or hr_pms only; reason ≥3 chars; writes system_audit_logs
--  with actions 'org_heads.dept_head_set' and 'org_heads.dept_head_recalculated')

-- 1d. Snapshot column on annual_review_instances
ALTER TABLE public.annual_review_instances
  ADD COLUMN dept_head_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
```
Grants already cover `departments` and `annual_review_instances`; no new GRANT needed (columns inherit table-level privileges).

### 2. Service layer (`src/services/orgHeads/orgHeadsService.ts`)
Add parallel functions:
- `listDepartmentHeads(): Promise<DeptHeadRow[]>`
- `setDepartmentHead(deptId, userId, reason)`
- `recalculateDepartmentHead(deptId): Promise<string | null>`

### 3. UI — generalise `BuHeadColumn` or add `DeptHeadColumn`
Refactor `src/components/admin/BuHeadColumn.tsx` into a generic `OrgHeadColumn` driven by `{ scope: 'bu' | 'department', id }` so we don't duplicate the searchable picker / dialog. Mount it on the Departments tab in `src/pages/admin/Organization.tsx` as a new "Head" column. The Business Units tab keeps the exact same behaviour through the new generic component.

### 4. Annual Review seeders
In `seedInstancesForCycle` and `seedInstancesByRules` (`src/services/annualReview/annualReviewService.ts`):
- Fetch a `deptHead[dept_id]` map alongside the existing `buHead` map.
- Add `dept_head_id: deptHead[p.department_id] ?? null` to each seeded row.
- No change to existing `bu_head_id` / `hr_id` logic.

### 5. Tests
- Unit test for the resolver (mocked rows): department-only scope, level tie-break, NULL when no candidates.
- Service test: `setDepartmentHead` writes manual + audit row; `recalculateDepartmentHead` writes auto.
- Seeder test: rows include `dept_head_id` matching the department's head; unaffected when head is null.

### 6. Docs / memory
- `mem/features/admin/org-heads.md`: add "Department Head" section with storage, resolver, RPCs, UI mount point.
- `src/modules/annual-review/POLICY.md`: add `dept_head_id` to the snapshot definition list.
- `DOCUMENTATION.md` change log entry.

## Out of scope (future)
- Surfacing `dept_head_id` as an explicit reviewer stage in the Annual Review stage chain UI / overrides.
- Notifications wired to `dept_head_id` (column is available; no event triggers added yet).
- Migrating existing instances backwards to populate `dept_head_id`.
