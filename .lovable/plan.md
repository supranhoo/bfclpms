

## Remove Role Access and Employee Overrides Tabs

### Rationale
The profile-based system (Profiles → Profile Mapping → Assignment) fully replaces the legacy role-based and individual override approaches. Keeping them creates confusion with two competing access control systems.

### Changes

**File: `src/components/admin/MenuAccessTab.tsx`**
1. Remove the "Role Access" tab trigger and content (lines 182, 247-327)
2. Remove the "Employee Overrides" tab trigger and content (lines 183, 329-444)
3. Remove unused state variables and handlers related to role-access editing (`editedConfigs`, `savingKey`, `toggleRole`, `handleSave`, `getEditedRoles`, `hasChanges`) and overrides UI (`overrideSearch`, `selectedUserId`, `selectedMenuKey`, `handleGrantAccess`, `handleRevokeAccess`, `filteredProfiles`, `enrichedOverrides`)
4. Remove unused imports (`UserPlus`, `Search`, `Input`, `Select*`, `Menu` if no longer used)

**File: `src/hooks/useMenuAccess.ts`**
- Keep the `canAccess()` priority chain intact (layers 5-7 remain as silent fallbacks for any existing data), but no UI changes needed here — the hooks still work for backward compatibility

**File: `DOCUMENTATION.md`** — Version bump  
**File: `POLICY.md`** — Version bump, note that Role Access and Employee Overrides UI removed; profile-based system is the sole admin interface

### Risk Assessment
- **Data impact**: None — existing `menu_access_config` and `menu_access_user_overrides` tables remain; data is preserved as fallback layers
- **Regression risk**: Low — any existing role-based or override entries continue to function via `canAccess()` logic; only the UI to manage them is removed
- **UX improvement**: Cleaner 3-tab interface (Profiles, Profile Mapping, Assignment) eliminates admin confusion

