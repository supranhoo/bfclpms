
# Bug Fix: Values Still Vanishing in Org KPI Data Entry (Second Pass)

## Root Cause Analysis — Two Separate Issues

The previous fix added `if (isDirtyRef.current) return;` to the sync `useEffect`. This guarded against overwrites **while the user is actively typing**. However, there are two remaining race conditions that bypass this guard, causing Jaspal's values to still vanish.

---

### Root Cause 1 — The `key` prop is missing `period` and `year` (Line 764 of `OrgKpiDataEntry.tsx`)

```tsx
// CURRENT — same key for all periods:
key={`${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}`}

// This means when the user changes the review period, the OrgKpiEntryCard
// component is NOT remounted. The useState keeps the previous period's
// typed value, and the sync useEffect is the only thing that updates it.
```

When Jaspal switches periods while having unsaved values, the component is not remounted (key doesn't change), and the `isDirtyRef` guard may block the correct re-sync.

---

### Root Cause 2 — `data.scopedRows` is always a new array reference, bypassing the guard

This is the **primary bug**. In `OrgKpiDataEntry.tsx` (line 761):

```tsx
const cardData = buildCardData(kpi);  // called on every render
```

`buildCardData` creates a **new `scopedRows` array** on every call. The `useEffect` dependency `[data.achievedValue, data.remarks, data.evidenceUrl, data.scopedRows]` uses `Object.is` comparison. Since `data.scopedRows !== previous data.scopedRows` (always a new array reference), the effect fires on **every single render** of the parent component.

**The exact failing sequence for Jaspal:**

```text
1. Jaspal types a value  → isDirtyRef = true
2. Auto-save fires (2s)  → save succeeds → isDirtyRef = false
3. queryClient.invalidateQueries(['org-kpi-values']) fires
4. WHILE refetch is in-flight (data still = old cached values):
   → parent re-renders (ANY parent state change: search typing,
     scrolling, toast appearing, etc.)
   → buildCardData(kpi) runs → new scopedRows array created
   → data.scopedRows !== prev ref → useEffect fires
   → isDirtyRef.current === false (reset in step 2)
   → setScopedValues(old data.scopedRows)  ← VALUE OVERWRITTEN with stale DB data
5. Refetch completes → correct data arrives
   → same thing happens again (overwrite with correct data this time)
```

Even for **organization-scope** KPIs, there's a window between when `isDirtyRef = false` and when the refetch resolves where an unrelated re-render (e.g., the "Saving..." status badge changing) triggers the effect and calls `setAchievedValue(data.achievedValue)` where `data.achievedValue` is the stale pre-save value from cache.

---

## The Fix

### Two-Part Fix

**Fix 1 — `OrgKpiDataEntry.tsx` line 764: Add `period` and `year` to the card's `key` prop**

This ensures the card fully remounts when the period changes, guaranteeing clean initial state.

```tsx
// BEFORE:
key={`${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}`}

// AFTER:
key={`${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||${selectedPeriod}||${selectedYear}`}
```

**Fix 2 — `OrgKpiEntryCard.tsx` lines 112–119: Change the sync strategy**

Instead of watching the unstable `data.scopedRows` array reference (which triggers on every render), the sync effect should only run when the **KPI identity** changes (i.e., a genuinely different KPI/period), not on every background refetch. For same-identity re-renders, we rely on the `isDirtyRef` guard AND add a **value equality check** to avoid unnecessary syncs.

```tsx
// BEFORE — fires on every render (scopedRows is always new ref):
useEffect(() => {
  if (isDirtyRef.current) return;
  setAchievedValue(data.achievedValue?.toString() ?? '');
  setRemarks(data.remarks);
  setEvidenceUrl(data.evidenceUrl);
  setScopedValues(data.scopedRows || []);
  setSaveStatus('idle');
}, [data.achievedValue, data.remarks, data.evidenceUrl, data.scopedRows]);

// AFTER — stable identity-based sync + value equality guard:
const kpiIdentityRef = useRef('');

useEffect(() => {
  const newIdentity = `${data.categoryId}||${data.kraName}||${data.kpiName}||${reviewPeriod}||${reviewYear}`;
  const identityChanged = newIdentity !== kpiIdentityRef.current;

  if (!identityChanged && isDirtyRef.current) return;

  if (!identityChanged && !isDirtyRef.current) {
    // Background refetch for same KPI — only sync if values actually differ
    const currentNumeric = achievedValue === '' ? null : parseFloat(achievedValue);
    const sameValue = currentNumeric === data.achievedValue
      || (currentNumeric === null && data.achievedValue === null)
      || (isNaN(currentNumeric as number) && data.achievedValue === null);
    const sameRemarks = remarks === data.remarks;
    const sameEvidence = evidenceUrl === data.evidenceUrl;
    if (sameValue && sameRemarks && sameEvidence) return; // no real change, skip
  }

  kpiIdentityRef.current = newIdentity;
  setAchievedValue(data.achievedValue?.toString() ?? '');
  setRemarks(data.remarks);
  setEvidenceUrl(data.evidenceUrl);
  setScopedValues(data.scopedRows || []);
  setSaveStatus('idle');
  isDirtyRef.current = false;
}, [data.achievedValue, data.remarks, data.evidenceUrl, data.categoryId, data.kraName, data.kpiName, reviewPeriod, reviewYear]);
```

Key changes in Fix 2:
- `data.scopedRows` is **removed from the dependency array** — scoped values are initialized from props on mount (via `useState(data.scopedRows || [])`) and from the identity change guard, but are NOT synced on every background refetch
- A `kpiIdentityRef` tracks when a genuinely new KPI context is loaded vs a background refetch of the same KPI
- A value equality check prevents syncing when the DB returned the same values the user already has on screen

---

## Files to Change

| File | Lines | Change |
|---|---|---|
| `src/pages/admin/OrgKpiDataEntry.tsx` | 764 | Add `\|\|${selectedPeriod}\|\|${selectedYear}` to the `key` prop |
| `src/components/admin/OrgKpiEntryCard.tsx` | 107–119 | Add `kpiIdentityRef`, change `useEffect` to identity-based sync, remove `data.scopedRows` from deps |
| `DOCUMENTATION.md` | — | Version bump to 1.45.9 + bug fix note |

## Before vs After (Jaspal's scenario)

```text
BEFORE — Still broken:
Jaspal types value → isDirtyRef = true
Auto-save (2s) → isDirtyRef = false
Any parent re-render (toast, search change, scroll):
  → buildCardData → new scopedRows ref
  → useEffect fires (isDirtyRef = false)
  → setScopedValues(stale DB value) ← VALUE ERASED

AFTER — Fixed:
Jaspal types value → isDirtyRef = true
Auto-save (2s) → isDirtyRef = false
Parent re-render → buildCardData → new data object
  → useEffect: same kpiIdentity, isDirtyRef=false, values equal → SKIP ✓
Refetch completes with real new data:
  → useEffect: data.achievedValue changed from null→37560
  → values NOT equal → sync runs → shows correct DB value ✓
```

## Impact Assessment

- Zero logic changes to save/propagate/rollback flows
- No database changes
- No API changes
- Scoped (department/employee) KPI entries are now stable during background refetches
- Period changes still correctly reset the card to DB values (identity changes)
- Works correctly for all three scope types: organization, department, employee
