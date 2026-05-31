# Consolidate Workflow Config, Organization, Review Periods into System Settings

## Goal

Reduce sidebar clutter by folding three admin-only entries — **Workflow Config**, **Organization**, **Review Periods** — into the existing **System Settings** page as new tabs/sections. Sidebar then drops from 3 separate links to a single entry-point.

## Risk & Impact

- **Data impact:** None. Pages, queries, RPCs unchanged.
- **Workflow impact:** Admins reach the same screens one click deeper (Settings → tab). All existing routes remain valid so deep links / bookmarks keep working via redirect.
- **Menu Access:** `menuKey` entries (`admin-workflow`, `admin-organization`, `admin-review-periods`) are now controlled inside Settings; we keep the keys alive so existing role profiles don't break and continue to gate the new tabs.
- **Regression risk:** Low — pure navigation/composition change, no edits to the page bodies.
- **Rollback:** Restore the three sidebar entries; the standalone routes still work.

## Implementation

### 1. Settings page — add three sections

`src/pages/admin/SystemSettings.tsx`

Add to `SETTINGS_SECTIONS` (near the top, after Branding/General — most-used admin config):

```ts
{ key: 'workflow',        label: 'Workflow Config', icon: GitBranch },
{ key: 'organization',    label: 'Organization',    icon: Building2 },
{ key: 'review-periods',  label: 'Review Periods',  icon: Calendar },
```

In `renderSectionContent()` switch, add three cases that render the existing page bodies (no inline duplication — import and reuse):

```tsx
case 'workflow':       return <WorkflowConfigPage embedded />;
case 'organization':   return <OrganizationPage embedded />;
case 'review-periods': return <ReviewPeriodsPage embedded />;
```

Each page accepts an optional `embedded` prop that, when true, hides its own outer `container/p-6` wrapper and page `<h1>` (since SystemSettings already provides the heading frame). Implementation = a single conditional wrapper at the top of each page component. No business logic touched.

### 2. Sidebar — remove the 3 entries

`src/components/layout/AppSidebar.tsx`

Delete the three items (`Workflow Config`, `Organization`, `Review Periods`) from the admin section. Keep `System Settings`.

### 3. Routing — keep deep links working

`src/App.tsx`

Keep `/admin/workflow-config`, `/admin/organization`, `/admin/review-periods` routes as redirects to the new section URLs:

- `/admin/workflow-config`  → `/admin/settings?section=workflow`
- `/admin/organization`     → `/admin/settings?section=organization`
- `/admin/review-periods`   → `/admin/settings?section=review-periods`

Use `<Navigate to="…" replace />` so bookmarks, in-app links, and notification deep links continue to land users on the right tab.

### 4. Menu Access compatibility

`src/components/admin/MenuAccessTab.tsx` already keys access by `menuKey`. The three keys (`admin-workflow`, `admin-organization`, `admin-review-periods`) are kept and consulted inside SystemSettings to hide the corresponding section for roles/profiles that lack access. Add a small `useMenuAccess` guard around the three new section entries and route cases.

### 5. Tests

- `src/test/sidebarConsolidation.test.tsx` — assert the three labels are no longer rendered in `AppSidebar` for an admin.
- `src/test/systemSettingsSections.test.tsx` — assert the three new section keys exist and that switching to each renders without throwing.
- Route redirect test — visiting `/admin/workflow-config` lands on `/admin/settings?section=workflow`.

### 6. Documentation

- DOCUMENTATION.md → Navigation: note the consolidation and redirect map.
- POLICY.md → unchanged (no access policy change; menuKey contract preserved).

## Files Touched

- `src/components/layout/AppSidebar.tsx` (remove 3 items)
- `src/pages/admin/SystemSettings.tsx` (add 3 sections + cases)
- `src/pages/admin/WorkflowConfig.tsx`, `src/pages/admin/Organization.tsx`, `src/pages/admin/ReviewPeriods.tsx` (add optional `embedded` prop — chrome only)
- `src/App.tsx` (three routes → `<Navigate>` redirects)
- Tests + docs as above

## UI Outcome

- Sidebar (admin section): **Workflow Config**, **Organization**, **Review Periods** gone.
- System Settings: existing tabs + three new ones near the top.
- Existing bookmarks/notifications still work via redirect.
