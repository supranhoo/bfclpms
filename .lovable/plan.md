

## Fix Tab Content Bleed: Separate Profiles, Assignment from Menu Access Rights

### Problem
Currently, `MenuAccessTab.tsx` renders `AccessProfilesManager` (with its 3 inner tabs: Profiles, Mapping, Assignment) and then **always** renders the "Menu Access Rights" role grid and "Employee-Level Overrides" below it — regardless of which inner tab is active. This means the Profiles tab and Assignment tab both show the unrelated role-based grid beneath them.

### UI Design (After Fix)

```text
┌─────────────────────────────────────────────────────────┐
│ [Profiles] [Profile Mapping] [Assignment] [Role Access] [Employee Overrides] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  (Only the selected tab's content is visible)           │
│                                                         │
│  Profiles tab    → Profile CRUD only                    │
│  Profile Mapping → Org scope + menu rights per profile  │
│  Assignment      → Employee ↔ profile assignments only  │
│  Role Access     → Role-based checkbox grid (current    │
│                    "Menu Access Rights" card)            │
│  Employee Overrides → Individual employee overrides     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Implementation

**File: `src/components/admin/MenuAccessTab.tsx`**
1. Remove `<AccessProfilesManager />` as a standalone component call
2. Create a unified 5-tab layout at the top level:
   - **Profiles** — reuse `ProfilesTab` content from `AccessProfilesManager`
   - **Profile Mapping** — reuse `MappingTab` content from `AccessProfilesManager`
   - **Assignment** — reuse `AssignmentTab` content from `AccessProfilesManager`
   - **Role Access** — the existing role-based checkbox grid (currently the "Menu Access Rights" card)
   - **Employee Overrides** — the existing employee-level overrides card

**File: `src/components/admin/AccessProfilesManager.tsx`**
1. Export `ProfilesTab`, `MappingTab`, and `AssignmentTab` as named exports so `MenuAccessTab` can import them directly
2. Keep `AccessProfilesManager` as a wrapper but it will no longer be used inside `MenuAccessTab` (it can remain for backward compatibility or be removed)

**Files: `DOCUMENTATION.md`, `POLICY.md`** — Version bump

### Risk Assessment
- **Data impact**: None — purely UI restructuring
- **Regression risk**: Low — same components, just reorganized into a single tab container
- **UX improvement**: Each tab now shows only its own content, no unrelated grids bleeding through

