

## Restore Menu Access Rights Grid on Profile Mapping Tab

### Problem
The Menu Access Rights grid was removed from the Profile Mapping tab, leaving no way to configure per-profile menu permissions. It needs to be restored below the Org Scope section.

### UI After Fix

```text
┌─────────────────────────────────────────────────────────────┐
│ Profile: [Auditor ▾]                                        │
│                                                             │
│ Org-Level Scope                                             │
│ [Company ▾] [Division ▾] [BU ▾] [Dept ▾]                   │
│ [Location ▾] [Designation ▾] [Grade ▾] [Level ▾]           │
│ [+ Add Scope]     ✓ 225 scope entries configured  [🗑]      │
│                                                             │
│ ── Menu Access Rights ──────────────────────────────────────│
│ ┌──────────┬────────────┬──────┬─────┬────────┬────────┐   │
│ │ Section  │ Menu Item  │ View │ Add │ Update │ Delete │   │
│ ├──────────┼────────────┼──────┼─────┼────────┼────────┤   │
│ │ Main     │ Dashboard  │  ☑   │  ☐  │   ☐    │   ☐   │   │
│ │ Main     │ Scorecard  │  ☑   │  ☑  │   ☑    │   ☐   │   │
│ │ ...      │ ...        │ ...  │ ... │  ...   │  ...   │   │
│ └──────────┴────────────┴──────┴─────┴────────┴────────┘   │
│                                        [💾 Save Rights]     │
└─────────────────────────────────────────────────────────────┘
```

### Implementation

**File: `src/components/admin/AccessProfilesManager.tsx`**

Add back the Menu Access Rights table JSX inside the `selectedProfileId` block (after the scope summary, before closing `</>`). The logic (`sections`, `getRights`, `toggleRight`, `handleSaveRights`) already exists — only the rendering was removed. Specifically:

1. After the scope summary `div` (line ~416), add:
   - An `<h4>` heading "Menu Access Rights"
   - A scrollable table container with sticky headers (`max-h-[60vh] overflow-auto`)
   - Table with columns: Section, Menu Item, View, Add, Update, Delete
   - Rows iterating `SECTION_ORDER` → `sections[section]` → checkboxes calling `toggleRight`
   - A "Save Rights" button calling `handleSaveRights`

2. Apply sticky header pattern (`sticky top-0 z-10 bg-background`) consistent with the other tabs.

**Files: `DOCUMENTATION.md`, `POLICY.md`** — Version bump

### Risk Assessment
- **Data impact**: None — restoring UI only; all data hooks/handlers already exist
- **Regression risk**: None — re-adding previously working grid
- **UX improvement**: Admins can configure menu rights per profile again

