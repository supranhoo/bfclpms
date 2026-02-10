
# Fix: Employee Import Name-Match Bug Causing Silent Errors

## Root Cause

When importing employee "101730", the import logic at line 1135-1139 checks for existing employees by **email OR employee_code OR fullName**. If the uploaded row's `fullName` matches any existing profile (e.g., a common name like "Avinash Kumar"), the code silently updates that existing profile instead of creating a new one -- showing "success" with no error.

This means:
- Employee "101730" was never created
- Some other profile may have had its data silently overwritten
- No error was displayed because the update succeeded

## Fix

**File:** `src/pages/admin/ImportData.tsx`

Change the existing employee lookup to **prioritize employee_code** and only fall back to name/email matching when appropriate:

1. **Match by employee_code first** -- if the row has a code and it matches an existing profile, update that profile
2. **Match by email second** -- if the row has an email matching an existing profile, update that profile
3. **Do NOT match by fullName alone** -- name matching is unreliable (common names cause wrong matches). Remove the name-only match from the "existing employee" check
4. If no match found and row has email, create new user via edge function
5. If no match found and no email, show error

### Code Change (around line 1133-1139)

Replace the `existingEmployee` lookup:

```typescript
// BEFORE (buggy -- name match causes wrong updates):
const existingEmployee = profiles?.find(p =>
  (row.email && p.email.toLowerCase() === row.email.toLowerCase()) ||
  (row.employeeCode && p.employee_code && p.employee_code === String(row.employeeCode)) ||
  (row.fullName && p.full_name && p.full_name.toLowerCase() === row.fullName.toLowerCase())
);

// AFTER (safe -- match by code or email only):
const existingEmployee = profiles?.find(p =>
  (row.employeeCode && p.employee_code && p.employee_code === String(row.employeeCode)) ||
  (row.email && p.email && p.email.toLowerCase() === row.email.toLowerCase())
);
```

This removes the `fullName`-only match that causes silent overwrites of unrelated profiles.

**File:** `DOCUMENTATION.md` -- update import matching logic description.

## Impact

- Employees will only be matched by employee_code or email (reliable identifiers)
- Common names like "Avinash Kumar" will no longer cause silent cross-profile updates
- Missing employees will now correctly show "Employee not found and no email provided" errors
