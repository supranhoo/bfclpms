

## Fix: Null Email Crashes Across the Application

### Root Cause
The previous migration made `profiles.email` nullable (`DROP NOT NULL`), but multiple components still call `p.email.toLowerCase()` or `p.email.trim()` without null-checking. When a profile with `null` email is encountered during search filtering, the app crashes with a `TypeError: Cannot read properties of null`.

### Affected Files (6 files, ~10 call sites)

1. **`src/pages/admin/UserManagement.tsx`** (3 sites)
   - Line 146: `p.email.toLowerCase()` in search filter → `p.email?.toLowerCase()`
   - Line 451: `selectedUser.email.trim().toLowerCase()` in edit save → add null guard
   - Lines 528-529, 778, 832, 880, 905, 917: various `user.email` references → add `|| ''` fallbacks

2. **`src/components/admin/AssignTabContent.tsx`** (1 site)
   - Line 38: `p.email.toLowerCase()` → `p.email?.toLowerCase()`

3. **`src/components/admin/BulkTemplateAssignDialog.tsx`** (1 site)
   - Line 112: `p.email.toLowerCase()` → `p.email?.toLowerCase()`

4. **`src/components/admin/OrgKpiOwnerDialog.tsx`** (1 site)
   - Line 43: `p.email.toLowerCase()` → `p.email?.toLowerCase()`

5. **`src/components/review/EmployeeSelectorGrid.tsx`** (1 site)
   - Line 464: `p.email.toLowerCase()` → `p.email?.toLowerCase()`

6. **`src/pages/admin/ImportData.tsx`** (already safe — has `p.email &&` guards)

### Changes
- Add optional chaining (`?.`) to all `.email.toLowerCase()` / `.email.includes()` calls
- Add `|| ''` fallbacks where email is used as display text (e.g., `profile.full_name || profile.email || 'Unknown'`)
- Guard the email-changed check in UserManagement edit flow with `if (!selectedUser.email && !editEmail.trim()) skip; else compare`
- Version bump `DOCUMENTATION.md` and `POLICY.md`

### Risk Assessment
- **Data impact**: None — read-only display fixes
- **Regression risk**: None — adds null safety without changing behavior for existing non-null emails
- **UX improvement**: User Management and all search filters stop crashing when profiles have null emails

