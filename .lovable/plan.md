

## Profile-Based Menu Access Rights System (Revised)

### Problem
Menu access is limited to role-based checkboxes and individual employee overrides. No way to scope access by Company, Division, BU, Grade, etc. Additionally, there's no built-in default rights hierarchy — employees should automatically see their own data, managers their direct reportees' data, without manual configuration.

### Default Rights Hierarchy

```text
LAYER 1 — IMPLICIT (no configuration needed)
├── Employee: Always has View rights to own menus (Dashboard, Inbox, Self-Review, Profile)
├── Reporting Manager: Inherits View rights for all direct reportees' relevant menus
│   (Team Reviews, KPI details of reportees)
└── Admin: Full access to everything (existing behavior)

LAYER 2 — PROFILE-BASED (configured by admin)
├── Access Profiles scoped by Company/Division/BU/Dept/Grade/Level
├── Granular View/Add/Update/Delete per menu item
└── Assigned to specific users

LAYER 3 — EXISTING (unchanged)
├── Role-based config (7-role checkboxes)
└── Individual employee overrides
```

### Access Resolution Priority

```text
1. Admin + admin-settings → always allowed
2. Employee self-access → own menus always visible (implicit)
3. Manager reportee access → reportee menus visible (implicit)
4. Access Profile match (user assigned to profile + org scope + menu right)
5. User-level override (existing employee overrides)
6. Role-based config (existing role checkboxes)
7. Hardcoded fallback
```

### Data Model

```sql
-- Named access profiles
CREATE TABLE access_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Org-level scope for each profile (AND logic, nulls = wildcard)
CREATE TABLE access_profile_org_scope (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES access_profiles(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id),
  division_id uuid REFERENCES divisions(id),
  business_unit_id uuid REFERENCES business_units(id),
  department_id uuid REFERENCES departments(id),
  designation text,
  pms_grade text,
  level text,
  CONSTRAINT at_least_one_filter CHECK (
    company_id IS NOT NULL OR division_id IS NOT NULL OR
    business_unit_id IS NOT NULL OR department_id IS NOT NULL OR
    designation IS NOT NULL OR pms_grade IS NOT NULL OR level IS NOT NULL
  )
);

-- Granular menu permissions per profile
CREATE TABLE access_profile_menu_rights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES access_profiles(id) ON DELETE CASCADE,
  menu_key text NOT NULL REFERENCES menu_access_config(menu_key),
  can_view boolean DEFAULT false,
  can_add boolean DEFAULT false,
  can_update boolean DEFAULT false,
  can_delete boolean DEFAULT false,
  UNIQUE (profile_id, menu_key)
);

-- Assign users to profiles
CREATE TABLE access_profile_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES access_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (profile_id, user_id)
);
```

### Default Rights Constants (Code-Level)

```typescript
// Menus every employee can always view (own data)
const EMPLOYEE_DEFAULT_MENUS = ['dashboard', 'inbox', 'pms-policy'];

// Menus a reporting manager can view for direct reportees
const MANAGER_DEFAULT_MENUS = ['team-reviews'];

// canAccess() logic:
// 1. If menuKey in EMPLOYEE_DEFAULT_MENUS → always true for any authenticated user
// 2. If menuKey in MANAGER_DEFAULT_MENUS && user has direct reports → true
// 3. Check access_profile_assignments → profile → org_scope match + menu_rights.can_view
// 4. Existing: user override, role-based config, fallback
```

### UI Design

Three-tab interface inside Menu Access settings:

**Tab 1: Access Profiles** — Create/edit named profiles with description and active toggle.

**Tab 2: Profile Mapping** — For a selected profile:
- Org Scope section: searchable comboboxes (Popover + Command pattern) for Company, Division, BU, Department, Designation, Grade, Level
- Menu Rights grid: all menu items grouped by section, with View/Add/Update/Delete checkboxes per row

```text
┌──────────────────────────────────────────────────────┐
│ Profile: [▼ Search profiles...]                      │
│                                                      │
│ ── Org Scope ──                                      │
│ Company: [▼ Search...]  Division: [▼ Search...]      │
│ Bus Unit: [▼ Search...]  Dept:    [▼ Search...]      │
│ Grade:   [▼ Search...]  Level:   [▼ Search...]       │
│                                                      │
│ ── Menu Rights ──                                    │
│ ┌──────────┬──────────────┬─────┬────┬──────┬──────┐ │
│ │ Section  │ Menu Item    │View │Add │Update│Delete│ │
│ ├──────────┼──────────────┼─────┼────┼──────┼──────┤ │
│ │ Main     │ Dashboard    │ ☑   │ ☐  │ ☐    │ ☐    │ │
│ │          │ Inbox        │ ☑   │ ☑  │ ☑    │ ☐    │ │
│ │ Manager  │ Team Reviews │ ☑   │ ☑  │ ☑    │ ☐    │ │
│ │ Admin    │ User Mgmt    │ ☑   │ ☑  │ ☑    │ ☑    │ │
│ └──────────┴──────────────┴─────┴────┴──────┴──────┘ │
│                                [Save Mapping]        │
└──────────────────────────────────────────────────────┘
```

**Tab 3: Profile Assignment** — Assign users to profiles with searchable employee selector.

All dropdowns use **searchable combobox** (Popover + Command + CommandInput pattern, same as ManagerCombobox).

### Implementation Files

1. **Database migration** — 4 new tables with RLS (admin CRUD, authenticated read)
2. **`src/hooks/useAccessProfiles.ts`** (new) — CRUD hooks for profiles, org scopes, menu rights, assignments
3. **`src/components/admin/OrgFilterCombobox.tsx`** (new) — Reusable searchable combobox
4. **`src/components/admin/AccessProfilesManager.tsx`** (new) — Three-tab management UI
5. **`src/components/admin/MenuAccessTab.tsx`** — Integrate AccessProfilesManager
6. **`src/hooks/useMenuAccess.ts`** — Extend `canAccess()` with default rights (employee self-menus, manager reportee-menus) + profile-based access; add `canPerform(menuKey, action)` for granular CRUD checks
7. **Documentation** — Update `DOCUMENTATION.md` and `POLICY.md`

### Risk Assessment
- **Data impact**: 4 new tables only; no changes to existing tables
- **Regression risk**: Low — default rights add implicit allows that match current behavior; existing role/override logic untouched
- **Performance**: Profile data cached (5-min staleTime); reportee check uses existing AuthContext data
- **Security**: RLS on all new tables (admin CRUD, authenticated read); default rights are read-only implicit grants

