

# Replace Designation & PMS Grade Text Inputs with Dropdowns

## Current State
Both the **Edit User** and **Create User** dialogs use free-text `<Input>` fields for Designation and PMS Grade. The system already has master tables (`designations` and `pms_grades`) with hooks (`useDesignations` and `usePmsGrades` in `useOrganization.ts`).

## Changes — `src/pages/admin/UserManagement.tsx`

### 1. Import the master data hooks
Add `useDesignations, usePmsGrades` to the existing import from `@/hooks/useOrganization`.

### 2. Call the hooks
```ts
const { data: designationsList } = useDesignations();
const { data: pmsGradesList } = usePmsGrades();
```

### 3. Edit User dialog — Replace Designation Input (lines 990-997)
Replace the `<Input>` with a `<Select>` dropdown populated from `designationsList`. Include a "None" option to allow clearing.

### 4. Edit User dialog — Replace PMS Grade Input (lines 998-1005)
Same pattern — `<Select>` from `pmsGradesList`.

### 5. Create User dialog — Replace Designation Input (lines 1137-1144)
Same dropdown replacement for the create form.

### 6. Create User dialog — Replace PMS Grade Input (lines 1145-1152)
Same dropdown replacement for the create form.

The `Select` stores the **name** string (e.g. "Asst. Manager", "JM-SM") since `designation` and `pms_grade` are text columns on `profiles`, not foreign keys.

