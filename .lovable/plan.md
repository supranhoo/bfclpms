

## Fix: Filter & Employee State Persistence Loop on Back/Refresh

### Root Cause

**Circular effect loop between two competing `useEffect`s:**

1. **Deep-link effect** (line 87, depends on `[searchParams]`): When it sees `?employee=X`, it fetches the profile, selects the employee, then **deletes** `?employee` from URL.
2. **Persistence effect** (line 206, depends on `[selectedEmployee]`): When `selectedEmployee` is set, it **re-adds** `?employee=X` to URL.
3. This triggers `searchParams` to change → deep-link effect re-runs → sees `?employee` again → infinite loop.

**On Back click:** `setSelectedEmployee(null)` triggers persistence effect (removes `?employee`), but the deep-link effect may have already re-fired with stale params, re-selecting the employee.

### Fix — Consolidate URL ↔ State Sync

#### Part 1: Add a `useRef` guard for deep-link processing

Add a `deepLinkProcessedRef = useRef(false)` flag. The deep-link effect sets it to `true` after first processing. Subsequent `searchParams` changes skip the deep-link employee fetch.

#### Part 2: Stop deleting `employee` param in deep-link processing

The deep-link effect currently deletes `?employee` after processing (lines 168-174), then the persistence effect re-adds it — causing the loop. Instead: **don't delete `employee` in deep-link processing at all**. Let the persistence effect be the sole owner of the `employee` param. Only delete `kpi`, `panel`, `period`, `year` params (the one-time deep-link params).

#### Part 3: Fix the Back button handler

Currently `onBack` just calls `setSelectedEmployee(null)` (line 314-317). The persistence effect then async-removes `?employee`. Instead, **immediately** remove `?employee` in the same callback to avoid timing gaps:

```typescript
onBack={() => {
  setSelectedEmployee(null);
  setAutoOpenKpiId(null);
  // Immediately clear employee param — don't wait for effect
  setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.delete('employee');
    return next;
  }, { replace: true });
}}
```

#### Part 4: Guard the restoration effect

The mount-only restoration effect (line 218-236) should set the `deepLinkProcessedRef` flag so the deep-link effect doesn't double-process.

### Summary of Changes

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Add `useRef` deep-link guard; stop deleting `employee` in deep-link effect; fix `onBack` to immediately clear URL param; simplify persistence effect to avoid circular updates |
| `DOCUMENTATION.md` | Version bump |

### Risk Assessment
- **No data changes**: Pure UI state management fix.
- **Backward compatible**: Deep-links with `?employee=&kpi=` still work (kpi/panel params still cleaned up).
- **Eliminates infinite loop**: Single owner (persistence effect) for `employee` param; deep-link only processes once per mount.

