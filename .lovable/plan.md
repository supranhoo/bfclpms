

# Add "Mark as Org-Level KPI" Toggle to Assign New KRA Dialog

## What's Missing

The `AdminKpiCreateDialog` currently hardcodes `is_org_level: false` and `org_level_scope: 'organization'` when creating a KPI (line 281-282). There is no UI toggle to let the admin mark the KPI as org-level during creation.

## Changes

### `src/components/admin/AdminKpiCreateDialog.tsx`

1. **Add state variables** (after line 98):
   - `isOrgLevel` (boolean, default `false`)
   - `orgLevelScope` (string, default `'organization'`)

2. **Reset state** in the `handleClose` function — reset both new fields.

3. **Use state in submit** (lines 281-282): Replace hardcoded values with the state variables.

4. **Add UI toggle** in the Advanced section (after the "Require Reason for Resubmission" block, before the closing `</div>`):
   - A switch labeled **"Organization-Level KPI"** with description text
   - When toggled on, show a scope selector dropdown (Organization / Department / Employee) — same pattern used in `MarkOrgLevelDialog`

### UI Layout (in Advanced section)

```text
┌──────────────────────────────────────────────────┐
│  ADVANCED                                         │
│ ┌──────────────────────────────────────────────┐  │
│ │ Require Reason for Resubmission     [toggle] │  │
│ └──────────────────────────────────────────────┘  │
│ ┌──────────────────────────────────────────────┐  │
│ │ Organization-Level KPI              [toggle] │  │
│ │ Mark as centrally managed org KPI            │  │
│ │                                              │  │
│ │ Scope: [Organization ▾]  (shown when on)     │  │
│ └──────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

No database changes needed — the `kpis` table already has `is_org_level` and `org_level_scope` columns.

