

# CAPA: Employee Re-Import -- Role Updates for Existing Employees

## Problem

When re-importing the Employee Master with updated details, the system correctly updates profile fields (designation, department, pmsGrade, level, manager) for existing employees. However, **role changes are silently ignored** for existing employees. Roles are only assigned during initial creation (new employees).

## Root Cause

In `src/pages/admin/ImportData.tsx` lines 1171-1196, the existing-employee branch updates the `profiles` table but has **no role-update logic**. The role handling code (lines 1226-1236) only runs inside the `else if (row.email)` branch for new employee creation.

## Fix

### File: `src/pages/admin/ImportData.tsx`

After the profile update succeeds (line 1195), add role update logic for existing employees:

```typescript
if (error) throw error;

// Update role for existing employee if provided in import
if (row.role) {
  const newRole = normalizeRole(row.role);
  const { data: existingRole } = await supabase
    .from('user_roles')
    .select('id, role')
    .eq('user_id', existingEmployee.id)
    .maybeSingle();

  if (existingRole) {
    if (existingRole.role !== newRole) {
      await supabase.from('user_roles')
        .update({ role: newRole })
        .eq('id', existingRole.id);
    }
  } else {
    await supabase.from('user_roles')
      .insert({ user_id: existingEmployee.id, role: newRole });
  }
}

return { success: true, userId: existingEmployee.id };
```

This mirrors the same pattern already used for new employees (lines 1226-1236) and the second-pass manager promotion (lines 1300-1312).

### File: `DOCUMENTATION.md`

Add a note under the Employee Import section documenting that role updates now apply to existing employees on re-import.

## What This Does NOT Change

- **Second-pass manager promotion** (lines 1276-1314) continues to work as before -- it promotes employees to "manager" if they appear as someone's `managerEmployeeId`, unless they already have an explicit higher role from the import.
- **Blank role column** still defaults to "employee" via `normalizeRole()`, but the role update only triggers when `row.role` is truthy (non-empty). So leaving the role column blank in the Excel will NOT downgrade an existing admin/manager to employee.
- **No "field clearing" change** -- intentional clearing of profile fields (e.g., removing a manager assignment) remains unsupported. That is a separate enhancement if needed.

## Summary

| File | Change |
|---|---|
| `src/pages/admin/ImportData.tsx` | Add role update logic after profile update for existing employees |
| `DOCUMENTATION.md` | Document role update behavior on re-import |

