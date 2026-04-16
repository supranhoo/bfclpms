

## Pre-Populate Org Scope Dropdowns with Saved Profile Selections

### Problem
When an admin selects a profile in the Profile Mapping tab, the Org-Level Scope dropdowns always appear empty — even if that profile already has saved scope entries. The admin has no visual indication of what's currently configured and must mentally track existing scopes from the badge/list below. This makes editing (adding/removing individual scope values) error-prone.

### Target UI

```text
Profile: [Payroll HASP ▼]

Org-Level Scope
┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│ Company...   ▼ │  │ Division...  ▼ │  │ Business U.. ▼ │  │ Department.. ▼ │
└────────────────┘  └────────────────┘  └────────────────┘  └────────────────┘

  When dropdown opens:
  ┌──────────────────────┐
  │ 🔍 Company...        │
  │ ─────────────────── │
  │ — None —             │
  │ ☑ Select All (2)     │
  │ ✅ Bihar Foundry &   │   ← pre-ticked (already saved)
  │    Casting Limited   │
  │ ☐ Saibal Kunar      │
  └──────────────────────┘

  ✓ 3 scope entries configured          🗑 Clear All
     ┌──────────────────────────────────────────────┐
     │ Bihar Foundry & Casting Limited         [x]  │  ← individual remove
     │ Division: Manufacturing                 [x]  │
     │ Grade: A1                               [x]  │
     └──────────────────────────────────────────────┘

  [Save Scope]  ← replaces "Add Scope"; saves the full state
```

### Solution
In `handleProfileChange`, after setting `selectedProfileId`, extract the saved `profileScopes` and pre-populate `scopeForm` arrays so the multi-select dropdowns reflect the current state. This way:
- Existing selections appear **ticked** in the dropdowns
- Admin can **untick** to remove or **tick** to add new values
- The "Add Scope" button becomes "Save Scope" and performs a **replace** operation (delete old scopes, insert new ones)

### Changes

**File: `src/components/admin/AccessProfilesManager.tsx`**

1. **`handleProfileChange`** — Instead of resetting `scopeForm` to empty, derive initial values from `profileScopes`:
   ```tsx
   const handleProfileChange = (id: string) => {
     setSelectedProfileId(id);
     setEditedRights({});
     // Pre-populate scopeForm from saved scopes
     const saved = orgScopes.filter((s: any) => s.profile_id === id);
     setScopeForm({
       company_id: saved.filter((s: any) => s.company_id).map((s: any) => s.company_id),
       division_id: saved.filter((s: any) => s.division_id).map((s: any) => s.division_id),
       business_unit_id: saved.filter((s: any) => s.business_unit_id).map((s: any) => s.business_unit_id),
       department_id: saved.filter((s: any) => s.department_id).map((s: any) => s.department_id),
       location: saved.filter((s: any) => s.location).map((s: any) => s.location),
       designation: saved.filter((s: any) => s.designation).map((s: any) => s.designation),
       pms_grade: saved.filter((s: any) => s.pms_grade).map((s: any) => s.pms_grade),
       level: saved.filter((s: any) => s.level).map((s: any) => s.level),
     });
   };
   ```

2. **"Add Scope" → "Save Scope"** — Change the button label and logic:
   - Compare current `scopeForm` with existing `profileScopes`
   - Delete removed scopes, insert new ones (or do a full replace: delete all existing, insert all current)
   - This makes the dropdowns a true **edit** interface, not just an "add" interface

3. **Track dirty state** — Add a `useMemo` that compares `scopeForm` values vs saved scopes to enable/disable the Save button and show a "modified" indicator.

4. **Also re-populate on orgScopes refetch** — Add a `useEffect` that syncs `scopeForm` when `orgScopes` data changes (e.g., after a save), so the UI stays in sync.

**Files: `DOCUMENTATION.md`, `POLICY.md`** — Version bump

### Risk Assessment
- **Data impact**: The save operation replaces scope rows (delete + insert), but the net result is the same as the admin's dropdown selections — no data loss risk
- **Regression risk**: Low — the `OrgFilterCombobox` already supports multi-select with pre-populated `values`; we're just feeding it saved data instead of empty arrays
- **UX improvement**: Admins can now see and modify existing scope configurations directly from the dropdowns without guessing what's already saved

