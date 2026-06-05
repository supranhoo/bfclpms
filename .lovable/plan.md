# Fix: Debounced search never commits to filter

## 1. Root cause
The debounce was placed in a `useEffect` whose deps include `setSearchQuery` from `useUrlFilterState`. React Router's `setSearchParams` identity changes on most renders, so `setSearchQuery` (a `useCallback` over it) also changes. `EmployeeSelectorGrid` re-renders frequently due to TanStack Query / `useIsFetching` polling, so the effect re-runs each render, its cleanup clears the pending 250 ms timer, and `setSearchQuery` is never called. URL `?q=` stays empty → `demographicFilteredMembers` filters against `''` → full roster is shown.

## 2. Fix
Move the debounce out of the render lifecycle and into the input handler itself, using a `useRef` for the timer.

- Drop the debounce `useEffect`.
- Keep the reconcile `useEffect` that mirrors external `searchQuery` changes (Clear All, deep-link nav) into `searchInput`.
- New `handleSearchChange(val)`:
  - `setSearchInput(val)` for instant input feedback.
  - Clear any pending timer in `debounceRef.current`.
  - If `val === ''` → call `setSearchQuery('')` immediately (flush on clear).
  - Else schedule `setSearchQuery(val)` (wrapped in `React.startTransition`) after 250 ms via `debounceRef.current = setTimeout(...)`.
- Cleanup pending timer on unmount via a separate one-shot `useEffect(() => () => clearTimeout(...), [])`.

This guarantees the timer is only ever reset by user keystrokes, not by parent re-renders.

## 3. Risk & Impact
- Data / workflow: none.
- UI/UX: search now actually filters ~250 ms after the last keystroke; typing/backspace remain instant.
- Regression risk: very low; isolated to the search handler in `EmployeeSelectorGrid.tsx`.

## 4. Verification
- Type "100360" on Team Reviews → roster collapses to matching employees within ~250 ms; URL shows `?q=100360`.
- Backspace to empty → list returns to full roster.
- Clear All → input empties and roster restores immediately.
- Same behaviour across Manager, Skip Mgr, Audit, Management, HR PMS panels (all use this grid).

## 5. Out of scope
Refactoring `useUrlFilterState` for global stability.
