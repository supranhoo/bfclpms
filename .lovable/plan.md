

## Brainstorm: KRA Summary Dedup + Admin JD & Competency Management

### 1. KRA Summary — Show Unique KRAs Only

**Current Problem**: The KRA Summary tab shows every individual KPI row (same as Dashboard). This is redundant.

**Proposed Change**: Group KPIs by unique `kra_name` and show a KRA-level summary instead:

| # | Category | KRA Name | KPIs Count | Total Weightage | Status |
|---|----------|----------|------------|-----------------|--------|

- **Grouping logic**: Deduplicate by `kra_name` (or `category_id + kra_name` combo)
- **KPIs Count**: Number of KPIs under that KRA
- **Total Weightage**: Sum of all KPI weightages under that KRA
- **Status**: Derived — "Completed" if all KPIs approved, "In Progress" if mixed, "Pending" if none started
- **Expandable rows** (optional): Click a KRA row to expand and see its child KPIs inline (accordion style)
- Stats cards update: "Total KRAs" instead of "Total KPIs", plus "Total KPIs" as secondary stat

**File**: `KraSummaryTab.tsx` — add `useMemo` grouping logic, update table columns

---

### 2. Admin Hub for JD & Skill Competency Management

**Current Gap**: The `employee_job_descriptions` and `skill_competencies` tables exist but there's no admin UI to manage them.

**Proposed New Admin Page**: `/admin/employee-profiles` or add as a tab in an existing admin page (e.g., User Management or a new "Employee Development" page)

**Two sections/tabs**:

#### A. Job Descriptions Manager (designation-based)
- **Table view**: List all designations with JD status (configured / not configured)
- **CRUD dialog**: Create/Edit JD per designation
  - Role Purpose (textarea)
  - Key Responsibilities (dynamic list — add/remove items)
  - Required Skills (tag input)
  - Qualifications (textarea)
- **Bulk import** (future): CSV upload for JDs
- **Coverage indicator**: "X of Y designations have JDs configured"

#### B. Skill Competency Manager (employee-based)
- **Employee selector**: Search/filter employees
- **Per-employee competency grid**: Add/edit skills with Required Level and Current Level (1-5 sliders)
- **Category grouping**: Technical, Behavioral, Leadership, etc.
- **Bulk assessment**: Assess multiple employees on the same skill set
- **Import from designation**: Auto-populate required skills from the employee's JD as competency rows

**Route**: `/admin/employee-development` — new page accessible to `admin` and `hr_pms` roles
**Sidebar entry**: Under Admin section, "Employee Development" with a GraduationCap icon

### Files to Change

1. **`src/components/profile/KraSummaryTab.tsx`** — Group by unique KRA, show KRA-level summary with expandable KPI details
2. **`src/pages/admin/EmployeeDevelopment.tsx`** (new) — Admin page with JD + Competency tabs
3. **`src/components/admin/JdManagerTab.tsx`** (new) — CRUD for job descriptions by designation
4. **`src/components/admin/CompetencyManagerTab.tsx`** (new) — Per-employee competency assessment
5. **`src/components/admin/JdFormDialog.tsx`** (new) — Create/Edit JD dialog
6. **`src/components/admin/CompetencyAssessmentDialog.tsx`** (new) — Assess skills for an employee
7. **`src/App.tsx`** — Add route for `/admin/employee-development`
8. **`src/components/layout/AppSidebar.tsx`** — Add sidebar link
9. **`DOCUMENTATION.md`** + **`POLICY.md`** — Update

### Risk Assessment
- **Data Impact**: None — reads/writes to existing `employee_job_descriptions` and `skill_competencies` tables with existing RLS
- **Workflow Impact**: None — new admin functionality, no changes to existing flows
- **Regression Risk**: Low — KRA Summary change is cosmetic grouping only; admin page is entirely new

