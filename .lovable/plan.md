

# Plan: Unified Dashboard and Sidebar Unhide Feature

## Understanding

Based on your feedback, I'll implement two changes:

1. **Same Dashboard for all roles**: Currently there are 3 separate dashboards (Employee, Admin, Management). You want to use the main Dashboard at `/dashboard` for all roles instead of separate ones.

2. **Sidebar unhide option**: When the sidebar is collapsed/hidden, add a visible trigger button in the main content area so users can easily re-expand it.

---

## Technical Approach

### 1. Add Floating Sidebar Trigger for Collapsed State

**File**: `src/components/layout/DashboardLayout.tsx`

Add a floating `SidebarTrigger` button that appears when the sidebar is collapsed:

```tsx
// Inside DashboardLayout, using useSidebar hook to detect state
const { state } = useSidebar();

// Add a floating trigger that only shows when sidebar is collapsed
{state === 'collapsed' && (
  <div className="fixed top-4 left-4 z-50">
    <SidebarTrigger className="bg-background border shadow-sm" />
  </div>
)}
```

This creates a floating button in the top-left corner that appears only when the sidebar is hidden.

### 2. Route Management Dashboard to Main Dashboard

**File**: `src/App.tsx`

Update the `/management-dashboard` route to redirect to `/dashboard`:

```tsx
// Change from separate ManagementDashboard to redirect
<Route path="/management-dashboard" element={
  <Navigate to="/dashboard" replace />
} />
```

### 3. Update Admin Dashboard Route

**File**: `src/App.tsx`

Similarly update the `/admin` route to redirect to the main dashboard:

```tsx
// Change from separate AdminDashboard to redirect
<Route path="/admin" element={
  <Navigate to="/dashboard" replace />
} />
```

### 4. Update Sidebar Navigation

**File**: `src/components/layout/AppSidebar.tsx`

Update the sidebar menu items to point all dashboard links to `/dashboard`:

- Change Admin section's "Admin Dashboard" from `/admin` to `/dashboard`
- Change Management section's "Management Dashboard" from `/management-dashboard` to `/dashboard`

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/layout/DashboardLayout.tsx` | Add floating SidebarTrigger for collapsed state |
| `src/App.tsx` | Redirect `/management-dashboard` and `/admin` to `/dashboard` |
| `src/components/layout/AppSidebar.tsx` | Update sidebar menu paths |

---

## Result

After implementation:
- All roles (employee, manager, auditor, management, admin) will see the same unified Dashboard with charts, workflow tracker, and KPI table
- When the sidebar is collapsed, a floating button appears in the top-left corner to re-expand it
- The sidebar trigger inside the header still works for toggling

