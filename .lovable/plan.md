
# Plan: Make Org KPI Data Entry Accessible to Data Owners

## Overview

Currently, the "Org KPI Data Entry" page is restricted to admin-only access. This plan updates the access control so that:
1. **Employees assigned as data owners** can access the page
2. **Data owners only see their assigned KPIs** (not all org-level KPIs)
3. **Admins retain full access** to all KPIs and can assign owners

---

## Current State Analysis

| Component | Current Behavior |
|-----------|------------------|
| Route (`App.tsx` line 150-154) | `allowedRoles={['admin']}` - Admin only |
| Sidebar (`AppSidebar.tsx` line 72) | Listed under Admin section with `roles: ['admin']` |
| Page (`OrgKpiDataEntry.tsx`) | No filtering by ownership; shows all KPIs |
| Ownership Hook | `useOrgKpiOwnershipMap()` already provides ownership data |

---

## Implementation Changes

### Part 1: Create Hook to Check if User is ANY Data Owner

Need a new hook to check if the current user has at least one data owner assignment (for route access).

**File**: `src/hooks/useOrgKpiDataOwner.ts`

Add new hook:
```typescript
/**
 * Check if current user is a data owner for any org-level KPI
 */
export function useIsAnyOrgKpiDataOwner() {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ['is-any-org-kpi-owner', user?.id],
    queryFn: async () => {
      // Admins always have access
      if (role === 'admin') {
        return true;
      }

      if (!user?.id) {
        return false;
      }

      // Check if user is designated owner for any KPI
      const { data, error } = await supabase
        .from('org_kpi_data_owners')
        .select('id')
        .eq('owner_id', user.id)
        .limit(1);

      if (error) return false;
      return data && data.length > 0;
    },
    enabled: !!user?.id,
  });
}
```

---

### Part 2: Create Custom Route Guard Component

Since `ProtectedRoute` only checks static roles, we need a new component that also checks dynamic data owner status.

**File**: `src/components/layout/DataOwnerRoute.tsx` (NEW)

```typescript
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIsAnyOrgKpiDataOwner } from '@/hooks/useOrgKpiDataOwner';
import { Loader2 } from 'lucide-react';

interface DataOwnerRouteProps {
  children: React.ReactNode;
}

export function DataOwnerRoute({ children }: DataOwnerRouteProps) {
  const { role, loading: authLoading } = useAuth();
  const { data: isDataOwner, isLoading: ownerLoading } = useIsAnyOrgKpiDataOwner();

  if (authLoading || ownerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Admin always has access
  if (role === 'admin') {
    return <>{children}</>;
  }

  // Data owners have access
  if (isDataOwner) {
    return <>{children}</>;
  }

  // Otherwise redirect to dashboard
  return <Navigate to="/dashboard" replace />;
}
```

---

### Part 3: Update Route in App.tsx

**File**: `src/App.tsx`

Change from:
```tsx
<Route path="/admin/org-kpi-data" element={
  <ProtectedRoute allowedRoles={['admin']}>
    <OrgKpiDataEntry />
  </ProtectedRoute>
} />
```

To:
```tsx
<Route path="/admin/org-kpi-data" element={
  <DataOwnerRoute>
    <OrgKpiDataEntry />
  </DataOwnerRoute>
} />
```

---

### Part 4: Add Sidebar Link for Data Owners

Currently the link is only in the Admin section. Need to add it to a section visible to data owners.

**File**: `src/components/layout/AppSidebar.tsx`

**Option A**: Add to Main section with dynamic visibility

Add new menu item to the `main` section that shows conditionally based on data owner status:
```typescript
// In menuItems.main, add:
{ 
  title: 'Org KPI Data Entry', 
  icon: Building2, 
  path: '/admin/org-kpi-data', 
  roles: ['admin', 'employee', 'manager', 'management'], // All roles that could be owners
  requiresDataOwner: true // New flag
}
```

Then filter items that require data owner status and only show if user is a data owner.

**Option B**: Create separate "Data Entry" section for data owners

Add a new sidebar section visible only to data owners (non-admins):
```typescript
dataEntry: [
  { 
    title: 'Org KPI Data Entry', 
    icon: Building2, 
    path: '/admin/org-kpi-data', 
    roles: ['employee', 'manager', 'management'] 
  },
]
```

And conditionally render based on `isDataOwner` status.

**Recommended**: Option B - cleaner separation and explicit visibility.

---

### Part 5: Filter KPIs by Ownership in the Page

**File**: `src/pages/admin/OrgKpiDataEntry.tsx`

Currently `filteredKpis` shows all org-level KPIs. Need to filter based on ownership for non-admins.

**Current flow:**
```text
orgLevelKpis → filteredKpis (by category) → displayRows (expanded by scope)
```

**Updated flow:**
```text
orgLevelKpis → ownershipFilteredKpis (by owner) → filteredKpis (by category) → displayRows
```

**Implementation:**

```typescript
// Get KPIs the current user owns (for non-admins)
const ownershipFilteredKpis = useMemo(() => {
  if (!orgLevelKpis) return [];
  
  // Admins see all KPIs
  if (isAdmin) return orgLevelKpis;
  
  // Non-admins only see KPIs they own
  return orgLevelKpis.filter(kpi => {
    const ownerKey = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}`;
    const ownership = ownershipMap.get(ownerKey);
    return ownership?.canEdit === true;
  });
}, [orgLevelKpis, isAdmin, ownershipMap]);

// Then use ownershipFilteredKpis instead of orgLevelKpis for category filtering
const filteredKpis = useMemo(() => {
  if (selectedCategoryId === 'all') return ownershipFilteredKpis;
  return ownershipFilteredKpis.filter(k => k.category_id === selectedCategoryId);
}, [ownershipFilteredKpis, selectedCategoryId]);
```

---

### Part 6: Conditional UI for Admin-Only Features

Hide admin-only features from data owners:
- **Actions column** (owner assignment button) - already hidden for non-admins
- Keep filters visible for all users

---

## File Changes Summary

| File | Changes |
|------|---------|
| `src/hooks/useOrgKpiDataOwner.ts` | Add `useIsAnyOrgKpiDataOwner()` hook |
| `src/components/layout/DataOwnerRoute.tsx` | NEW - Custom route guard component |
| `src/App.tsx` | Change route guard from `ProtectedRoute` to `DataOwnerRoute` |
| `src/components/layout/AppSidebar.tsx` | Add conditional sidebar link for data owners |
| `src/pages/admin/OrgKpiDataEntry.tsx` | Filter KPIs by ownership for non-admins |
| `DOCUMENTATION.md` | Update access control documentation |

---

## User Experience After Implementation

### For Admins:
- No change - full access to all KPIs and owner assignment

### For Data Owners:
1. See "Org KPI Data Entry" link in sidebar (under "Data Entry" section)
2. Click to access the page
3. Only see KPIs they are assigned to own
4. Can enter/edit values, remarks, and upload supporting files for their KPIs
5. Cannot assign owners (no Actions column visible)

### For Non-Owners:
- No sidebar link visible
- Direct URL access redirects to dashboard

---

## Data Flow Diagram

```text
User accesses /admin/org-kpi-data
           ↓
   DataOwnerRoute checks:
   ├─ Is admin? → Allow all
   ├─ Has any ownership? → Allow (filtered view)
   └─ Neither? → Redirect to /dashboard
           ↓
   OrgKpiDataEntry loads:
   ├─ Admin: See all org KPIs + Actions column
   └─ Owner: See only assigned KPIs, no Actions column
```

---

## Security Considerations

- Route access controlled by `DataOwnerRoute` component
- Database RLS should already restrict `org_kpi_data_owners` access
- Page-level filtering prevents unauthorized KPI visibility
- Admin-only UI elements conditionally rendered

---

## Validation Checklist

After implementation:
- [ ] Data owners can access the page via sidebar
- [ ] Data owners only see their assigned KPIs
- [ ] Data owners can edit values for assigned KPIs
- [ ] Data owners cannot see Actions column
- [ ] Admins retain full access to all features
- [ ] Non-owners are redirected to dashboard
- [ ] Sidebar link only visible to admins and data owners
