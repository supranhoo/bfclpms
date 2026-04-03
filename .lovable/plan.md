

## Plan: Hide Inactive Employees from All Dashboards + Add Company Name to Organization Structure

### Problem 1: Inactive Employees Visible Everywhere
Several hooks fetch profiles without filtering `is_active`, causing inactive employees (e.g., 100003) to appear on Team Reviews, HR PMS, Audit, Management dashboards, and filter dropdowns.

### Problem 2: No Company Name in Organization Structure
The Organization Structure page has no company name display. `company_name` already exists in `system_settings` (used in reports) — we just need to surface it on this page.

---

### Changes

**1. `src/hooks/useOrganization.ts`** — Add `is_active` filter to 3 hooks:
- `useProfiles()`: Add `.eq('is_active', true)` — this is the main hook used by EmployeeSelectorGrid and most admin views. User Management has its own separate query, so this won't affect that page.
- `useProfilesByWorkflowStage()`: Add `.eq('is_active', true)` to the profiles fetch at line 280
- `useSkipLevelTeamMembers()`: Add `.eq('is_active', true)` to both the direct reports query and the final subordinates query

**2. `src/hooks/useEmployeeFilterOptions.ts`** — Add `is_active` filter to all 3 profile queries:
- Designations query: `.eq('is_active', true)`
- Grades query: `.eq('is_active', true)`
- Managers list query: `.eq('is_active', true)` — ensures inactive managers don't appear in filter dropdown

**3. `src/pages/admin/Organization.tsx`** — Add company name header:
- Import `useSystemSetting` and fetch `company_name`
- Display company name above the "Organization Structure" heading as a subtle label (e.g., bold company name with a Building2 icon)
- Make it editable inline or via a small edit button that updates `system_settings`

**4. `DOCUMENTATION.md`** — v2.15.60

**5. `POLICY.md`** — Add invariant noting that `useProfiles()` must always filter `is_active` except in User Management context

---

### Verification: User Management Not Affected
User Management page uses its own profile fetch (not `useProfiles()` from useOrganization), so inactive employees will still be visible there for admin management purposes.

### Files Modified

| File | Change |
|------|--------|
| `src/hooks/useOrganization.ts` | Add `is_active: true` filter to `useProfiles`, `useProfilesByWorkflowStage`, `useSkipLevelTeamMembers` |
| `src/hooks/useEmployeeFilterOptions.ts` | Add `is_active: true` filter to designations, grades, managers queries |
| `src/pages/admin/Organization.tsx` | Show editable company name from `system_settings` above page title |
| `DOCUMENTATION.md` | v2.15.60 |
| `POLICY.md` | New invariant: active-employee filtering requirement |

### Risk
- **Low** — Adding `.eq('is_active', true)` is additive filtering; no data mutations
- **User Management**: Unaffected — uses separate query
- **Reports**: Unaffected — most reports have their own profile fetches; historical data preserved via KPI records

