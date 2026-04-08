

## Fix: Show Observation Replies by Default

### Problem
The `ObservationReplyThread` component starts collapsed (`isOpen = false`) and only fetches replies when opened. All replies remain hidden until the user manually clicks to expand.

### Solution
Two changes in `src/components/review/ObservationReplyThread.tsx`:

1. **Always fetch replies** — remove the conditional from the query so replies load regardless of collapse state (line 39: change `isOpen ? observationId : undefined` → `observationId`)
2. **Default to open** — change `useState(false)` to `useState(true)` on line 33 so the thread is expanded by default

### Files to Change

| File | Change |
|------|--------|
| `src/components/review/ObservationReplyThread.tsx` | Set `isOpen` default to `true`; always pass `observationId` to the query |
| `DOCUMENTATION.md` | Version bump |

### Risk Assessment
- **Data Impact**: None — read-only change
- **Performance**: Minimal — replies are lightweight; query was already cached by react-query
- **Regression Risk**: None — collapsible still works for toggling; just starts open

