

# Add Target Column to Org KPI Scoped Entry Table

## Problem

When data entry users (admins or data owners) are entering employee/department-level achieved values in the Org KPI Data Entry page, the **target value** is only visible in the card header above. With 14+ employee rows, this forces users to scroll up or memorize the target -- inefficient and error-prone.

## Solution

Add a read-only **"Target"** column to the scoped entry table, positioned between the Employee/Department name column and the N/A toggle. This gives both admins and data owners immediate inline reference while entering data.

## Layout Change

**Current:** | Employee | N/A | Achieved | Remark | File |

**Proposed:** | Employee | Target | N/A | Achieved | Remark | File |

## Changes

### File: `src/components/admin/OrgKpiScopedEntryTable.tsx`

1. **Table Header**: Add a "Target" column header (narrow, `w-24`) between the name column and N/A column.
2. **EmployeeRow**: Add a read-only cell showing the target value and UOM in muted text. Dim it further when the row is N/A.
3. **DepartmentRow**: Same treatment for consistency.
4. **Department group header row**: Update `colSpan` from 5 to 6 to span the new column.

### File: `DOCUMENTATION.md`

Version bump to **1.45.77** with changelog entry.

## Technical Details

| Aspect | Detail |
|--------|--------|
| Files changed | `OrgKpiScopedEntryTable.tsx`, `DOCUMENTATION.md` |
| Data impact | None -- purely UI display |
| Props needed | `targetValue` and `uom` are already passed to the component |
| Visible to | Both admins and data owner users (via DataOwnerRoute) |
| Regression risk | None -- adding a read-only column with no logic changes |

