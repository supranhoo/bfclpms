
## Add Search to All Dropdowns in "Add New User" Dialog

### Context (verified from screenshot + codebase)
The "Add New User" dialog (`UserDialog` / similar in `src/pages/admin/UserManagement.tsx` or `src/components/admin/`) currently uses plain `<Select>` (Radix Select) for:
- Company
- Division
- Department
- PMS Grade
- Designation
- Level
- Sub-Branch
- Location (newly added)
- Role

With long lists (262 designations, 86 departments, 24 BUs, etc.), scrolling is painful. The Reporting Manager field already uses the searchable `ManagerCombobox` — we need parity across every other dropdown.

### Change
Replace each `<Select>` in the Add/Edit User dialog with the existing **`OrgFilterCombobox`** (single-select mode) from `src/components/admin/OrgFilterCombobox.tsx`. It already provides:
- Built-in search (`<CommandInput>`)
- Keyboard navigation
- "— None —" clear option
- Same h-9 / text-sm sizing matching current selects

**Dropdowns converted** (single-select, with search):
1. Company
2. Division
3. Department (cascades on Division — keep existing dependency)
4. Sub-Branch (if present)
5. PMS Grade
6. Designation
7. Level
8. Location
9. Role (small list, but consistency wins)

**Cascading behavior preserved**: Department options still filter by selected Division; clearing Division resets Department (existing logic untouched — only the renderer changes).

**Reporting Manager**: already searchable — no change.

### UI (after change)
```text
Division                          
┌──────────────────────────────┐  
│ All Divisions          ⌄    │ ← click
└──────────────────────────────┘
        ┌──────────────────────┐
        │ 🔍 Search...        │
        ├──────────────────────┤
        │ ✓ — None —          │
        │   CLU                │
        │   CPP                │
        │   DRI                │
        │   Ferro              │
        │   HR                 │
        └──────────────────────┘
```

### Files Touched
- `src/pages/admin/UserManagement.tsx` (or wherever `AddUserDialog` / `EditUserDialog` lives — confirmed at edit time)
- Possibly `src/components/admin/UserDialog.tsx` / `BulkUpdateDialog.tsx` for parity
- No changes to `OrgFilterCombobox.tsx` (already supports this exact use case)

### Risk & Impact
| Area | Impact |
|---|---|
| Data | None. Pure UI swap; same value contract (`onValueChange(string)`). |
| Workflow | None. Cascading + validation logic untouched. |
| UI/UX | Every dropdown becomes type-to-filter. Matches existing Manager picker pattern. |
| Regression | Very low. `OrgFilterCombobox` is already battle-tested in reports/filters. |
| Mitigation | Keep existing form-state keys; only the input component changes. Apply same pattern to Edit User + Bulk Update dialogs to avoid divergence. |

### Out of Scope
- Multi-select on any of these fields (single-select only).
- Changing the underlying data sources or cascading rules.
- Restyling the dialog layout.
