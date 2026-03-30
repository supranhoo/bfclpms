

## RCA: Admin N/A Toggle Clears All Levels' Scores

### Root Cause

**File: `src/hooks/useAdminDataEntry.ts` lines 144-164**

When the admin toggles N/A for **any** role level (e.g., management), the code unconditionally clears **every** scoring field across **all** levels:

```typescript
if (is_na) {
  updateFields.final_score = null;
  updateFields.self_score = null;      // ← WRONG: wipes self
  updateFields.self_rating = null;
  updateFields.manager_score = null;   // ← WRONG: wipes manager
  updateFields.auditor_score = null;   // ← WRONG: wipes auditor
  // ... ALL levels cleared
}
```

This is a **KPI-level** applicability flag (`is_na` on `review_submissions`), not a role-level flag. The original design intent was: "marking N/A means the entire KPI is excluded from scoring." But the problem is the admin dialog **always passes `is_na`** (line 539: `is_na: isNa`), even when the toggle hasn't changed. So if admin enters a management score with the N/A toggle left ON from a previous state, it re-clears everything.

**Additionally**: The N/A toggle in the dialog initializes from `existingSubmission.is_na` (line 300), which is a **KPI-wide** flag. If an admin previously marked N/A at any level, the toggle shows ON for all subsequent role entries, causing unintentional score wipes.

### The Two Bugs

1. **Blast-radius bug**: When `is_na = true`, all levels' scores are cleared — not just the level being edited. If admin intends to mark only management as N/A, self/auditor scores should be preserved.

2. **Sticky toggle bug**: The N/A toggle reflects the KPI-wide `is_na` state, not the role being edited. Admin opening the dialog for management sees N/A toggled ON because a previous entry set it — and submitting passes `is_na: true` again, re-wiping everything.

### Fix

**File: `src/hooks/useAdminDataEntry.ts`**

1. **Only clear the current role's fields when marking N/A** — not all levels. Use `buildUpdateFields` with null values for the active role only.
2. **Only send `is_na` when it actually changed** — compare against `oldSubmission.is_na` and only include it in updateFields if toggled.
3. When `is_na` is being set to `true`, clear the **current role's** score/rating/achieved fields and set `final_score`/`final_rating` to null. Do NOT touch other roles' fields.
4. When `is_na` is being set to `false` (un-marking), only clear the `is_na` flag itself.

**File: `src/components/admin/AdminDataEntryDialog.tsx`**

5. Track the **original** `is_na` state on dialog open. Only pass `is_na` to the mutation when it differs from the original, preventing accidental re-clears.

### Exact Code Changes

**`useAdminDataEntry.ts` lines 144-167** — Replace the N/A handling block:

```typescript
if (is_na !== undefined) {
  updateFields.is_na = is_na;
  updateFields.na_marked_by_role = is_na ? 'admin' : null;
  if (is_na) {
    // Only clear the CURRENT role's fields + final score
    const roleClearFields = buildUpdateFields(role_level, {
      achieved_value: null,
      rating: null,
      score: null,
      remarks: null,
    });
    Object.assign(updateFields, roleClearFields);
    updateFields.final_score = null;
    updateFields.final_rating = null;
  }
}
```

**`AdminDataEntryDialog.tsx`** — Track original N/A state:

```typescript
const [originalIsNa, setOriginalIsNa] = useState(false);
// On load: setOriginalIsNa(existingSubmission.is_na === true);
// On submit: only include is_na if isNa !== originalIsNa
```

### Data Repair

SQL to restore the wiped self and auditor scores for this specific KPI from audit logs (the `old_value` JSON contains the pre-wipe data).

### Impact Assessment

| Surface | Impact |
|---------|--------|
| Normal score entry (no N/A) | Zero — `is_na` block not entered |
| Marking entire KPI as N/A | Still clears current role + final — correct |
| Editing a different role after N/A | No longer wipes other roles' scores |
| Dashboard/Reports | Correct — final_score reflects actual state |
| Weighted averages | Correct — `is_na` exclusion logic unchanged |

### Files Modified

| File | Change |
|------|--------|
| `src/hooks/useAdminDataEntry.ts` | Scope N/A clearing to current role only |
| `src/components/admin/AdminDataEntryDialog.tsx` | Track original N/A state; conditional `is_na` pass |
| DB data repair | Restore wiped scores from audit log for affected KPI |
| `DOCUMENTATION.md` | v2.15.8 changelog |
| `POLICY.md` | Add invariant: N/A toggle must not clear unrelated role scores |

