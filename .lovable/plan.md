
## Add "Location" as a First-Class Master in Organization Structure

### Context (verified)
- The Organization Structure page (`src/pages/admin/OrganizationStructure.tsx`) currently exposes 7 tabs: Divisions, Business Units, Departments, Sub-Branches, Designations, PMS Grades, Levels.
- A `locations` table already exists in the DB (used by the recent Employee Master Backfill + Location import field).
- There is **no UI** to create / edit / delete location masters today — admins can only reference locations that magically appear, which is why imports soft-resolve to NULL.

### Change — Add a "Locations" tab (8th tab)

**Tab placement** (between Sub-Branches and Designations, since location is a physical-place master like sub-branch):

```text
Divisions (7) | Business Units (24) | Departments (86) | Sub-Branches (0) | Locations (N) | Designations (262) | PMS Grades (5) | Levels (13)
```

**Tab contents** (mirrors the existing Designations / Levels tab pattern for consistency):

```text
┌─ Locations ───────────────────────────────────────────────┐
│  [+ Add Location]                          [Search ____]  │
│ ┌───────────────────────────────────────────────────────┐ │
│ │ Name              │ Code     │ Company         │ ⋯    │ │
│ ├───────────────────────────────────────────────────────┤ │
│ │ Mumbai HO         │ MUM      │ Bihar Foundry   │ ✎ 🗑 │ │
│ │ Patna Plant       │ PAT      │ Bihar Foundry   │ ✎ 🗑 │ │
│ │ Kolkata Office    │ KOL      │ —               │ ✎ 🗑 │ │
│ └───────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

**Add / Edit dialog** (reuses `Dialog` + `Form` patterns from `LevelsTab`):
- Name * (text, max 100)
- Code (text, max 20, optional, auto-uppercased)
- Company (existing `CompanyCombobox`, scoped to current company by default)

**Delete** → routed through the standard `ConfirmDestructiveDialog` (per `mem://design/destructive-action-governance`). Block delete if any `profiles.location_id` references the row; show toast "Cannot delete — N employees assigned".

### Files Touched
- `src/pages/admin/OrganizationStructure.tsx` — register new `<TabsTrigger value="locations">` + `<TabsContent>`.
- `src/components/admin/LocationsTab.tsx` (new) — table + dialogs, modeled on `LevelsTab.tsx`.
- `src/hooks/useOrganization.ts` — add `useLocations(companyId)`, `useCreateLocation`, `useUpdateLocation`, `useDeleteLocation` (mirroring the `useLevels` family).
- `src/hooks/useCompanies.ts` — extend `CloneStructure` to optionally clone locations (new checkbox `cloneLocations`).
- `src/components/admin/CloneStructureDialog.tsx` — add the checkbox.
- **Clone-structure migration**: none — `locations` already has `company_id`; only the hook gains a 9th step.
- `DOCUMENTATION.md` Version History + `POLICY.md` Org Structure section + `mem://features/admin/multi-company-governance` update.

### RLS / Security
- `locations` already has RLS (it's been used by imports). Verify policies allow Admin full CRUD; read for all authenticated users (matches Designations / Levels). If missing, add a migration with the standard `has_role(auth.uid(),'admin')` pattern.

### Risk & Impact
| Area | Impact |
|---|---|
| Data | Additive UI on existing table. No schema change. |
| Workflow | Admins can finally seed/maintain the `locations` master, unblocking import soft-resolve warnings. |
| UI/UX | One extra tab — same visual weight as Levels / PMS Grades. Tab bar already wraps (`flex-wrap`). |
| Regression | Very low. New tab is isolated; clone flow gains an optional step that defaults OFF. |
| Mitigation | Delete is reference-checked; `ConfirmDestructiveDialog` enforced; mirrors proven `LevelsTab` patterns. |

### Out of Scope
- Geographic fields (lat/long, address) — kept lean, can be added later.
- Bulk import of locations (existing import paths already accept location names; admins can add masters here).
- Linking locations to sub-branches (locations remain a flat company-scoped master for now).
