## Issue

Add New User for **Kusum Sinha (101818)** under **Aruna Industries** fails with:
`Unknown employee category: 'Retainership'`

## Root cause (verified)

- `employee_categories` is company-scoped master data.
- `Retainership` exists only under **Bihar Foundry & Casting Limited** (BFCL). Aruna Industries has zero categories seeded.
- The `create-employee` edge function correctly validates category against the selected company (`company_id` match) and rejects the mismatch — behaviour is right.
- The Add/Edit User dialog calls `useEmployeeCategories()` with **no company argument**, so the dropdown lists categories from every company. Admin was able to pick BFCL's "Retainership" for an Aruna user, guaranteeing a server-side rejection.

Files: `src/pages/admin/UserManagement.tsx` line 263 + 568-570 (dropdown), `src/hooks/useOrganization.ts` (`useEmployeeCategories(companyId?)` already supports scoping — memory `employee-category-and-status`).

## Fix (UI-only, surgical)

1. Pass the currently selected company into the hook for each dialog context:
   - Add User dialog → `useEmployeeCategories(newCompanyId)`
   - Edit User dialog → `useEmployeeCategories(editCompanyId)`
2. Since the two dialogs need different scopes, either:
   - call the hook twice (add + edit variants) and build two `options` memos, OR
   - keep one hook call but derive `companyId` from whichever dialog is open.
   Prefer two hook calls — clearer and avoids re-fetch churn when switching dialogs.
3. When the user changes Company in the dialog, clear the selected `employeeCategory` if it is not present in the new company's list (prevents stale invalid selections).
4. If the resulting list is empty for the chosen company, show a helper text under the field: "No categories configured for this company. Add them in Admin → Organization." (no behaviour change, just guidance).

No edge function change. No schema change. No policy change.

## Out of scope

- Seeding Aruna Industries categories — that's an admin/data task, not a code fix.
- `employment_status` (global master) is unaffected.

## Verification

- Open Add User, select Aruna Industries → Employee Category dropdown lists only Aruna's categories (currently empty, helper text shown).
- Select BFCL → dropdown lists BFCL's 7 categories including Retainership.
- Switching company after picking a category clears the stale value.
- Submit succeeds; the "Unknown employee category" toast no longer appears for legitimate selections.
