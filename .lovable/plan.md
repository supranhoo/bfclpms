

## Multi-Select with "Select All" + Location Field for Org Scope Dropdowns

### Problem
1. Org-Level Scope comboboxes allow only single selection — admins need multi-select with "Select All"
2. "Location" (sub_branches table) is missing from org scope filters

### UI Design

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Org-Level Scope                                                     │
│                                                                     │
│ Company: [3 selected ▾]    Division: [All (5) ▾]                    │
│ Bus Unit: [▾ Search...]    Dept: [▾ Search...]                      │
│ Location: [▾ Search...]    Designation: [▾ Search...]               │
│ Grade: [▾ Search...]       Level: [▾ Search...]                     │
│                                              [+ Add Scope]         │
│                                                                     │
│  Dropdown expanded:                                                 │
│  ┌───────────────────────┐                                          │
│  │ 🔍 Search...          │                                          │
│  ├───────────────────────┤                                          │
│  │ ☑ Select All (3)      │  ← toggles all visible/filtered items   │
│  ├───────────────────────┤                                          │
│  │ ☑ Bihar Foundry       │                                          │
│  │ ☑ Saibal Kunar        │                                          │
│  │ ☐ ABC Corp            │                                          │
│  └───────────────────────┘                                          │
└─────────────────────────────────────────────────────────────────────┘
```

### Implementation

**1. Database migration** — Add `location` text column to `access_profile_org_scope`:
```sql
ALTER TABLE access_profile_org_scope ADD COLUMN location text;
-- Update CHECK constraint to include location
```

**2. `OrgFilterCombobox.tsx`** — Add multi-select mode:
- New props: `multiSelect`, `values`, `onValuesChange`
- "Select All (N)" checkbox at top — toggles all search-filtered items
- Trigger shows "N selected" or single name
- Popover stays open on item click
- Backward compatible (existing single-select unchanged)

**3. `AccessProfilesManager.tsx`** — Update Mapping tab:
- Add `useSubBranches()` import and Location combobox
- Change `scopeForm` state to arrays: `company_id: string[]`, etc.
- Switch all comboboxes to `multiSelect` mode
- Cascading: Division filters by any selected company, BU by any selected division, Dept by any selected BU, Location by any selected dept
- On "Add Scope": generate cartesian product rows (one `access_profile_org_scope` row per combination)
- Update `getScopeLabel` to show location

**4. `useAccessProfiles.ts`** — Add `location` to `AccessProfileOrgScope` type

**5. Documentation** — Version bump in `DOCUMENTATION.md` and `POLICY.md`

### Risk Assessment
- **Data impact**: One new nullable column; no existing data affected
- **Regression risk**: Low — OrgFilterCombobox backward compatible; existing single-select callers unaffected
- **Performance**: Cartesian product insertion capped by practical org hierarchy sizes

