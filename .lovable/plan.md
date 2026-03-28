

## Add Employee-Level Menu Access Overrides

### What You Asked For
Allow admins to grant specific menu items to individual employees, similar to how Report Access has per-user overrides alongside role-based defaults.

### Approach
Mirror the exact `report_access_user_overrides` pattern for menu access.

### Implementation

#### 1. Database Migration
Create `menu_access_user_overrides` table:
```sql
CREATE TABLE public.menu_access_user_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_key TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (menu_key, user_id)
);
-- RLS: authenticated read, admin-only write
```

#### 2. Hook Update: `useMenuAccess.ts`
- Fetch `menu_access_user_overrides` (same pattern as `useReportAccess`)
- Update `canAccess()`: check user overrides first — if user has an override for that menu_key, grant access regardless of role
- Add `grantUserMenuAccess` and `revokeUserMenuAccess` mutations
- Export `userOverrides` data

#### 3. UI Update: `MenuAccessTab.tsx`
Add a second card below the role-based grid (same layout as ReportAccessTab's user override section):
- **Grant form**: Employee search + menu item selector + "Grant Access" button
- **Active overrides table**: Shows user name, menu item, granted date, with revoke button

#### 4. Sidebar Integration
`AppSidebar.tsx` — update `canAccess` check (already delegated to hook) — no sidebar code changes needed since the hook handles it.

### Files Changed
| File | Action |
|------|--------|
| Migration SQL | Create `menu_access_user_overrides` table + RLS |
| `src/hooks/useMenuAccess.ts` | Add user override queries, mutations, and canAccess logic |
| `src/components/admin/MenuAccessTab.tsx` | Add employee override grant/revoke UI section |
| `DOCUMENTATION.md` | Update menu access docs |

### Risk Assessment
- **Data**: Additive — new table, no existing data affected
- **Regression**: Zero — existing role-based logic unchanged; user overrides are additive (grant-only)
- **Security**: RLS admin-only write, authenticated read. Safety guard for admin-settings unchanged.

