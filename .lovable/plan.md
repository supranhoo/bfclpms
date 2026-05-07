## Root Cause

The previous fix attached the `paste` listener to the row's `<div>` itself. Browsers only dispatch `paste` events to elements that are content-editable or to inputs/textareas with focus. A plain `<div tabIndex={0}>` can receive focus but **will not fire `paste`** — so Ctrl+V now does nothing.

## Fix

Keep the row-scoped "armed" model, but attach the `paste` listener to **`window`** (not the row div) while the row is armed. Only one row is armed at a time (last hovered/focused), so the paste reliably routes to the intended row without the original "first row in DOM wins" bug.

### Changes — `src/components/admin/OrgKpiFileUpload.tsx`

1. Replace the `target.addEventListener('paste', …)` on `containerRef` with `window.addEventListener('paste', …)`, gated by `isArmed`.
2. Track the currently-armed row via a module-level `Symbol`/ref so that if two rows somehow think they are armed (rapid mouse movement), only the most-recent one handles the paste. Simple approach: a module-scoped `let activeArmedId` + `useId()` per instance; on `mouseenter/focus` set `activeArmedId = myId`; the window handler bails if `activeArmedId !== myId`.
3. Keep the visible focus ring + dynamic hint text exactly as today so the user always sees which row will receive the paste.
4. Also arm on `click` of the container (in addition to hover/focus) for keyboard/touch users.
5. No changes to upload logic, naming, size validation, callers, or other paste consumers.

### Why this is safe

- `window`-level listener is added/removed per row only while armed → no global leak.
- `activeArmedId` guard prevents duplicate uploads if multiple rows briefly overlap arming.
- Behaviour for already-uploaded rows (`existingUrl`) is unchanged.
- No schema, RLS, or storage changes.

## Risk

Low. Single-file presentation change. Manual QA: hover row A → Ctrl+V uploads to A; move to row B → Ctrl+V uploads to B; move mouse outside any row → Ctrl+V is a no-op.
