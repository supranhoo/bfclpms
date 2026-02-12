

# Brainstorm: Making Org KPIs More Robust, Controllable, and Transparent

## Current State Summary

Today, the Org KPI system has:
- **42 unique Org KPIs** mapped across **483 employee KPI records** (all "organization" scope -- no department/employee scoping used yet)
- **0 data owners** assigned (the owner assignment feature exists but isn't being used)
- **0 org_kpi_values** saved (the pending/approved workflow has status columns but no values have been entered through the Data Entry panel)
- A propagation system that pushes achieved values to employee review_submissions
- A basic Overview page that shows KPIs grouped by category with pending/achieved status

---

## Problem Areas Identified

| Area | Gap |
|---|---|
| **Mapping Visibility** | Admin can't see which employees are linked to a specific Org KPI -- the Overview page shows KPI definitions but not who is impacted |
| **Impact Analysis** | Before entering/changing a value, admin has no way to preview "this will affect 47 employees' scores" |
| **Approval Workflow** | The `status` column exists in `org_kpi_values` but is never used -- values go straight to propagation without review |
| **Data Owner Utilization** | Owner assignment UI exists but nobody is assigned; no accountability tracking |
| **Audit Trail** | No history of who changed what Org KPI value and when |
| **Propagation Feedback** | After propagation, no summary of what changed (scores before vs after) |

---

## Proposed Enhancements (5 Features)

### Feature 1: Impact Analysis Panel -- "Who Gets Affected?"

Add an expandable "Impact Preview" to each Org KPI row in both Overview and Data Entry pages.

**What it shows:**
- Total employee count affected
- Breakdown by department
- List of affected employees (name, code, department, current score)
- When entering a new achieved value: simulated new score vs current score

**How it works:**
- Query `kpis` table where `is_org_level = true` matching the category/KRA/KPI
- Join with `profiles` for employee details and `review_submissions` for current scores
- Display in a collapsible section or a slide-out sheet

**Admin benefit:** Before saving any value, admin sees exactly who will be impacted and by how much.

---

### Feature 2: Org KPI Mapping Dashboard -- "Who Has What?"

A new dedicated view (or tab on the Overview page) showing the **reverse mapping**:

| View Mode | Shows |
|---|---|
| By KPI | Each Org KPI with a list of all employees it's assigned to, their departments, and current status |
| By Employee | Each employee with all their Org KPIs listed |
| By Department | Department-wise grouping of Org KPI coverage |

**Key metrics displayed:**
- Coverage percentage (e.g., "42/50 employees have this KPI assigned")
- Missing assignments (employees who should have it but don't)
- Duplicate detection

**Admin benefit:** Full visibility into the mapping landscape without having to check individual employee records.

---

### Feature 3: Value Entry Approval Workflow

Activate the existing `status` column on `org_kpi_values` with a proper workflow:

```text
Draft --> Submitted --> Approved --> Propagated
                  \--> Sent Back (with reason)
```

**Flow:**
1. Data Owner or Admin enters value -- status = "draft"
2. Data Owner clicks "Submit for Approval" -- status = "submitted"
3. Admin reviews and either Approves (triggers propagation) or Sends Back (with reason)
4. Propagation only happens on "Approved" status

**Admin benefit:** Values don't immediately affect employee scores. Admin retains final control before any score impact.

---

### Feature 4: Propagation Summary Report

After propagation completes, show a detailed summary:

- Total employees affected
- Score changes breakdown:
  - Employees whose score **increased**
  - Employees whose score **decreased**
  - Employees whose score **stayed the same**
- Table with: Employee Name, Department, Old Score, New Score, Change (+/-)
- Option to download as Excel

**Admin benefit:** Full post-action transparency. If something looks wrong, admin can identify affected employees immediately.

---

### Feature 5: Org KPI Change History / Audit Log

Track every change to `org_kpi_values`:

- Who changed the value
- Previous value vs new value
- When it was changed
- Whether it was propagated and to how many employees

Display as a timeline in the Overview page or as a dedicated "History" tab.

**Admin benefit:** Complete accountability trail for organizational data, essential for compliance and management reporting.

---

## Recommended Implementation Priority

| Priority | Feature | Effort | Impact |
|---|---|---|---|
| 1 | Impact Analysis Panel | Medium | High -- immediate admin visibility |
| 2 | Org KPI Mapping Dashboard | Medium | High -- solves "who has what" completely |
| 3 | Propagation Summary Report | Low | Medium -- post-action transparency |
| 4 | Value Entry Approval Workflow | High | High -- governance control |
| 5 | Change History / Audit Log | Medium | Medium -- compliance |

---

## Technical Notes

### Database Changes Required
- New table `org_kpi_value_history` for audit trail (Feature 5)
- Trigger on `org_kpi_values` to log changes automatically
- Activate `status` column workflow with proper enum values (Feature 3)

### No Database Changes Required
- Features 1, 2, and 3 can leverage existing `kpis`, `profiles`, `review_submissions`, and `org_kpi_values` tables
- Impact analysis is a read-only query joining these tables

### Key Queries for Impact Analysis
```sql
-- Count employees affected by an Org KPI
SELECT COUNT(DISTINCT k.employee_id), p.department_id, d.name
FROM kpis k
JOIN profiles p ON k.employee_id = p.id
JOIN departments d ON p.department_id = d.id
WHERE k.is_org_level = true
  AND k.category_id = ?
  AND k.kra_name = ?
  AND k.kpi_name = ?
  AND k.review_period = ?
  AND k.review_year = ?
GROUP BY p.department_id, d.name
```

---

## Next Step

Please let me know which features you'd like to prioritize, and I'll create a detailed implementation plan for those specific items. You can pick one, a few, or all five.

