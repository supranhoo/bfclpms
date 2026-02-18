
# Bug Fix: Values Vanishing in Org KPI Data Entry "Achieved" Input

## Root Cause (Confirmed)

In `src/components/admin/OrgKpiEntryCard.tsx`, lines 110–117:

```typescript
useEffect(() => {
  setAchievedValue(data.achievedValue?.toString() ?? '');   // ← OVERWRITES user input
  setRemarks(data.remarks);
  setEvidenceUrl(data.evidenceUrl);
  setScopedValues(data.scopedRows || []);
  isDirtyRef.current = false;  // ← clears dirty flag too
}, [data.achievedValue, data.remarks, data.evidenceUrl, data.scopedRows]);
```

**The timeline of the bug:**

1. Firoz types a value into the Achieved input (e.g. `"37560"`)
2. The `triggerAutoSave` debounce fires after 2 seconds — saves to DB
3. `bulkUpsert.mutateAsync` completes → calls `queryClient.invalidateQueries(['org-kpi-values'])`
4. React Query refetches `existingOrgValues` → `existingValuesMap` is rebuilt → `buildCardData` returns new `data` prop
5. The `useEffect` dependency `data.achievedValue` changes (even if the DB returned the same number) OR briefly passes through `null` during the refetch
6. `setAchievedValue(data.achievedValue?.toString() ?? '')` fires — **resetting the input while Firoz may still be typing**
7. The input value vanishes (or flickers back to the old value)

The session replay confirms the symptom: blur → immediate refocus cycle on the input, which is React unmounting/remounting the controlled input due to state reset.

---

## The Fix

### Strategy: Guard the sync effect so it only runs when the card is NOT dirty (i.e. user has no unsaved changes in-flight)

The existing `isDirtyRef` already tracks whether local edits are pending — it's set to `true` on every change and `false` only after a successful save. We need to respect this flag in the sync effect.

**Change 1 — `OrgKpiEntryCard.tsx` lines 110–117: Add dirty guard to the sync useEffect**

```typescript
// BEFORE (broken):
useEffect(() => {
  setAchievedValue(data.achievedValue?.toString() ?? '');
  setRemarks(data.remarks);
  setEvidenceUrl(data.evidenceUrl);
  setScopedValues(data.scopedRows || []);
  isDirtyRef.current = false;
  setSaveStatus('idle');
}, [data.achievedValue, data.remarks, data.evidenceUrl, data.scopedRows]);

// AFTER (fixed):
useEffect(() => {
  // Only sync from props when the card has no local unsaved edits.
  // If isDirty, the user is actively editing — DO NOT overwrite their input.
  if (isDirtyRef.current) return;
  setAchievedValue(data.achievedValue?.toString() ?? '');
  setRemarks(data.remarks);
  setEvidenceUrl(data.evidenceUrl);
  setScopedValues(data.scopedRows || []);
  setSaveStatus('idle');
}, [data.achievedValue, data.remarks, data.evidenceUrl, data.scopedRows]);
```

This is safe because:
- When the card is first mounted, `isDirtyRef.current` is `false` → initial population works normally
- When Firoz types, `isDirtyRef.current` becomes `true` → the effect is skipped on refetch → **input is preserved**
- After the auto-save succeeds, `isDirtyRef.current` is reset to `false` → the next refetch can sync cleanly from DB
- The `isDirtyRef.current = false` line inside the effect is removed (it was incorrectly clearing the dirty flag mid-sync)

**Change 2 — Also protect the auto-save from the re-save loop**

There is a secondary risk: after the auto-save sets `isDirtyRef.current = false` and the DB value refetches, the `useEffect` now correctly syncs. But if the DB returned value differs slightly (e.g. float precision), another `setAchievedValue` call could trigger an unintended re-render. The guard already handles this — no additional change needed here.

**Change 3 — `OrgKpiEntryCard.tsx` line 87: Use a stable initial value**

The `achievedValue` state initialises from `data.achievedValue` on mount. This is fine and doesn't need changing. The bug is only the ongoing sync effect.

---

## Files to Change

| File | Lines | Change |
|---|---|---|
| `src/components/admin/OrgKpiEntryCard.tsx` | 110–117 | Add `if (isDirtyRef.current) return;` guard at top of sync useEffect; remove `isDirtyRef.current = false` from inside the effect |
| `DOCUMENTATION.md` | — | Version bump to 1.45.8 + bug fix note |

## Before vs After

```text
BEFORE — Race Condition:
User types "37560"
  → isDirtyRef = true
  → auto-save fires (2s debounce)
  → DB write succeeds
  → React Query invalidates → refetch
  → data.achievedValue changes
  → useEffect fires → setAchievedValue("37560") [or null if refetch is mid-flight]
  → isDirtyRef = false  ← RESET TOO EARLY
  → user is still typing "0" to make it "375600"
  → next refetch: setAchievedValue("37560") overwrites "375600" ← BUG

AFTER — Guarded:
User types "37560"
  → isDirtyRef = true
  → auto-save fires (2s debounce)
  → DB write succeeds → isDirtyRef = false
  → React Query invalidates → refetch
  → data.achievedValue changes
  → useEffect fires → isDirtyRef.current is false → sync runs safely
  → No overwrite during active typing
```

## Impact Assessment

- Zero logic changes to save/propagate/rollback flows
- No database changes
- No API changes
- The fix only affects when the local state sync runs — it does NOT prevent syncing; it defers it until the user is done editing
- Works correctly for both org-scope and department/employee-scope cards
