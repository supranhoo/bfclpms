## Goal
Move "Module Hub" from a standalone admin sidebar entry into a section inside **System Settings**, matching the pattern used by other settings (Branding, Workflow, etc.).

## Changes

### 1. `src/pages/admin/SystemSettings.tsx`
- Import `ModuleHubSettings` from `@/pages/admin/ModuleHubSettings`.
- Import a suitable icon (`LayoutGrid` already imported, or use `Boxes`).
- Add a new entry to `SETTINGS_SECTIONS`:
  ```ts
  { key: 'module-hub', label: 'Module Hub', icon: LayoutGrid }
  ```
  Placed near `feature-flags` (governance/visibility group).
- Add a case in `renderSectionContent()`:
  ```ts
  case 'module-hub':
    return <ModuleHubSettings />;
  ```

### 2. `src/components/layout/AppSidebar.tsx`
- Remove the standalone `Module Hub` admin sidebar item (line 99).

### 3. `src/App.tsx`
- Keep `/admin/module-hub` route working by redirecting it to `/admin/settings?section=module-hub` (avoids broken bookmarks). Replace the existing route element with a `<Navigate>` redirect.

## UI Impact
- Sidebar: "Module Hub" entry disappears from the Admin group.
- System Settings: a new left-nav item "Module Hub" appears; selecting it renders the existing Module Hub admin UI (Safety kill switch, per-user grants, Branding Loader panel) inline within the settings shell.
- Mobile: appears in the Section selector dropdown automatically.
- Existing direct links to `/admin/module-hub` redirect into Settings.

## Out of scope
- No change to `ModuleHubSettings` component internals.
- No changes to the user-facing `/modules` (Module Hub launcher) page.
- No schema, RLS, or policy changes.

## Risk
Low — purely a navigation reshuffle; the underlying component and data hooks are reused as-is.
