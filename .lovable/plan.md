

## Remove Lengthy Scope & Menu Rights Lists from Profile Mapping

### Problem
After adding org scopes, a long table of every scope row is displayed, followed by the full Menu Access Rights grid — making the page unnecessarily lengthy. The user prefers to simply select a profile, set the filters, and add scope without seeing the accumulated list.

### Changes

**File: `src/components/admin/AccessProfilesManager.tsx`** (MappingTab)

1. **Remove the Org Scope table** (lines 392-415) — the `profileScopes.map(...)` table showing every saved scope row with delete buttons. Instead, show a compact summary badge like "12 scope entries configured" with a small "Clear All" button if needed.

2. **Remove the Menu Access Rights grid** (lines 418-469) — the full View/Add/Update/Delete checkbox table. This is already available in the "Role Access" tab and is redundant here.

3. **Add a minimal scope summary** — after "Add Scope" succeeds, show a brief count badge (e.g., "✓ 15 org scope entries") so the admin knows scopes exist, without listing each one.

### UI After Fix

```text
┌─────────────────────────────────────────────────────────────┐
│ Profile: [Auditor ▾]                                        │
│                                                             │
│ Org-Level Scope                                             │
│ Company [▾]  Division [▾]  Business Unit [▾]  Department [▾]│
│ Location [▾] Designation [▾] Grade [▾]  Level [▾]           │
│                                                             │
│ [+ Add Scope]          ✓ 15 scope entries configured  [🗑]  │
│                                                             │
│ (No lengthy table or menu rights grid below)                │
└─────────────────────────────────────────────────────────────┘
```

**Files: `DOCUMENTATION.md`, `POLICY.md`** — Version bump

### Risk Assessment
- **Data impact**: None — scope data still saved in DB, just not displayed in a long list
- **Regression risk**: None — removal of display-only elements
- **UX improvement**: Page stays compact; admin can re-select profile and remap anytime

