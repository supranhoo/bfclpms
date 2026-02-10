

# Add Full Name and Email to Edit User Dialog

## Problem
The "Edit User" dialog only has 6 fields (Employee Code, Role, Department, Reporting Manager, Designation, PMS Grade), while the "Add New User" dialog also includes Full Name and Email. The Edit dialog should have all the same fields.

## Changes

**File:** `src/pages/admin/UserManagement.tsx`

1. **Add state variables** for `editFullName` and `editEmail`
2. **Populate them** in `openEditDialog` from the selected user
3. **Add Full Name and Email input fields** to the Edit dialog (at the top, before Employee Code)
4. **Include them in the update mutation** so `full_name` and `email` are saved to the `profiles` table
5. **Update DOCUMENTATION.md** to reflect the change

The Full Name field will be editable. The Email field will be shown but read-only (since email is tied to auth and cannot be changed from the profile alone).

## Technical Details

### New state (around line 55)
```typescript
const [editFullName, setEditFullName] = useState('');
const [editEmail, setEditEmail] = useState('');
```

### Populate in openEditDialog (line 350)
```typescript
setEditFullName(user.full_name || '');
setEditEmail(user.email || '');
```

### Update mutation (line 156) -- add full_name
```typescript
.update({
  full_name: fullName,  // NEW
  reporting_manager_id: ...,
  ...
})
```

### Add fields to dialog UI (before Employee Code, around line 744)
- Full Name input (editable)
- Email input (read-only, shown for reference)

