
# Add Admin Dashboard to Sidebar Navigation

Add "Admin Dashboard" as the first item in the Administration section of the sidebar so admins can easily access it.

## Change

### `src/components/layout/AppSidebar.tsx`
- Add a new entry at the top of the `menuItems.admin` array:
  ```
  { title: 'Admin Dashboard', icon: LayoutDashboard, path: '/admin', roles: ['admin'] }
  ```
- This uses the existing `LayoutDashboard` icon (already imported) and points to the `/admin` route that was restored in the last edit.

### `DOCUMENTATION.md`
- Note that Admin Dashboard is accessible from the sidebar under Administration.

No other files need changes -- the route and component already exist.
