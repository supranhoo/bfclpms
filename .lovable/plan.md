

## Plan: Dynamic Program Configuration Tabs (Replace Hardcoded Tabs)

### Problem
The 7 tabs inside each program (Mapping, Slabs, DQ Rules, Fields, BU Sub-Units, Allocation, Vessel Rates) are hardcoded in `IncentiveConfig.tsx`. Adding a new configuration section requires code changes. The user wants admins to add custom tabs from the frontend, where each custom tab can define its own data entry fields (like vessel rates, production achieved, etc.).

### Design Approach

**Two-tier system:**
1. **Core tabs** (Mapping, Slabs, DQ Rules, Fields) — always present, cannot be removed (they have dedicated components)
2. **Custom tabs** — admin-configurable, stored in a new DB table, each with its own set of custom data entry columns

Each custom tab acts as a **per-employee data entry grid** — similar to how Vessel Rates works today (employee + value columns). Admins define the tab name + the columns (fields) within it, and users enter data per employee.

### UI

```text
Program: Metal Sizing
┌─────────────────────────────────────────────────────────────────────┐
│ Mapping │ Slabs │ DQ Rules │ Fields │ BU Sub-Units │ Allocation │  │
│ Vessel Rates │ Production Achieved │ [+ Add Tab]                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  When [+ Add Tab] is clicked:                                       │
│  ┌─────────────────────────────────────────────────────┐           │
│  │ Tab Name: [___________________]                      │           │
│  │ Tab Key:  [auto_generated_from_name]                 │           │
│  │                                                      │           │
│  │ Data Entry Fields:                                   │           │
│  │ ┌──────────────┬──────────┬──────────────┐          │           │
│  │ │ Field Label   │ Type ▼   │ Default      │ [×]     │           │
│  │ ├──────────────┼──────────┼──────────────┤          │           │
│  │ │ Rate Per Unit │ number   │ 0            │ [×]     │           │
│  │ │ Remarks       │ text     │              │ [×]     │           │
│  │ └──────────────┴──────────┴──────────────┘          │           │
│  │ [+ Add Field]                                        │           │
│  │                                        [Cancel][Save]│           │
│  └─────────────────────────────────────────────────────┘           │
│                                                                     │
│  When a custom tab is selected:                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Tab: Vessel Rates                        [Edit Tab] [Delete] │  │
│  │                                                              │  │
│  │ Employee         │ Rate Per Unit │ Remarks │ Actions         │  │
│  ├──────────────────┼───────────────┼─────────┼─────────────────│  │
│  │ [Select Employee]│ [___]         │ [___]   │ [Save]          │  │
│  │ Jaspal Singh     │ 5000          │ Senior  │ [Edit] [Del]    │  │
│  │ Ravi Kumar       │ 3500          │         │ [Edit] [Del]    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Database Changes

**New table: `incentive_program_custom_tabs`**
```sql
CREATE TABLE public.incentive_program_custom_tabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES incentive_programs(id) ON DELETE CASCADE,
  tab_key TEXT NOT NULL,
  tab_label TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  fields JSONB NOT NULL DEFAULT '[]',
  -- fields structure: [{ key, label, type (number|text|boolean|date), default_value }]
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(program_id, tab_key)
);
ALTER TABLE public.incentive_program_custom_tabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage custom tabs" ON public.incentive_program_custom_tabs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

**New table: `incentive_custom_tab_data`**
```sql
CREATE TABLE public.incentive_custom_tab_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_id UUID NOT NULL REFERENCES incentive_program_custom_tabs(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES incentive_programs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  field_values JSONB NOT NULL DEFAULT '{}',
  -- field_values structure: { "rate_per_unit": 5000, "remarks": "Senior" }
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tab_id, employee_id)
);
ALTER TABLE public.incentive_custom_tab_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage custom tab data" ON public.incentive_custom_tab_data
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

### Code Changes

**`src/hooks/useIncentiveCustomTabs.ts`** (new)
- `useCustomTabs(programId)` — fetch tabs for a program
- `useUpsertCustomTab()` — create/update tab definition (name + fields)
- `useDeleteCustomTab()` — remove a tab
- `useCustomTabData(tabId)` — fetch employee data rows for a tab, joined with profiles
- `useUpsertCustomTabData()` — save employee field values
- `useDeleteCustomTabData()` — remove an employee row

**`src/components/incentive/CustomTabManager.tsx`** (new)
- Dialog for adding/editing a custom tab: tab name, and a dynamic list of field definitions (label, type, default)
- Field types: `number`, `text`, `boolean`, `date`

**`src/components/incentive/CustomTabDataGrid.tsx`** (new)
- Generic data entry grid for any custom tab
- Renders columns dynamically based on tab's `fields` JSONB
- Employee selector + field inputs per row
- Supports add/edit/delete rows

**`src/pages/admin/IncentiveConfig.tsx`**
- Fetch custom tabs per program via `useCustomTabs(p.id)`
- Render core tabs (Mapping, Slabs, DQ Rules, Fields, BU Sub-Units, Allocation) as before
- Append custom tabs dynamically from DB
- Move existing "Vessel Rates" to be a **migration candidate** — existing vessel rate data stays, but new programs would use custom tabs instead
- Add `[+ Add Tab]` button at end of tab list

**`DOCUMENTATION.md`** — v2.15.20
**`POLICY.md`** — §42: Program configuration tabs must be database-driven; no new hardcoded tabs

### Migration Strategy for Existing Tabs
- BU Sub-Units and Allocation remain as core tabs (they have dedicated logic)
- Vessel Rates tab remains for backward compatibility but new similar needs use custom tabs
- No data migration needed — additive only

### Files Modified

| File | Change |
|------|--------|
| DB migration | Create `incentive_program_custom_tabs` and `incentive_custom_tab_data` tables |
| `src/hooks/useIncentiveCustomTabs.ts` | New hooks for custom tabs CRUD + data entry |
| `src/components/incentive/CustomTabManager.tsx` | Tab creation/editing dialog |
| `src/components/incentive/CustomTabDataGrid.tsx` | Generic per-employee data grid |
| `src/pages/admin/IncentiveConfig.tsx` | Render dynamic tabs from DB, add [+ Add Tab] button |
| `DOCUMENTATION.md` | v2.15.20 |
| `POLICY.md` | §42 — dynamic tabs invariant |

### Risk Assessment
- **Regression**: Zero — core tabs unchanged, custom tabs are additive
- **Data**: New tables only, no modifications to existing schema
- **Performance**: One extra query per program to fetch custom tabs (lightweight)
- **Flexibility**: JSONB `fields` array allows unlimited field definitions per tab without schema changes

