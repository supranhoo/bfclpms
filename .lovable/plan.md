

# Fix: WeightageCellEditor Popover Not Appearing

## Root Cause Analysis

After reviewing the code, the most likely issues preventing the popover from appearing:

1. **React Fragment missing `key`** — In `EmployeeSection`, the `sortedKras.map()` uses `<>` (Fragment) without a `key` prop. React requires keys on mapped elements, and the missing key may cause the child components (including the WeightageCellEditor) to not mount or re-render correctly.

2. **Click event propagation** — The button inside a `<TableCell>` within a `<Collapsible>` component may have click events propagating unexpectedly, preventing the Popover from opening.

3. **No visual feedback** — Cells may look non-interactive, making it unclear that clicking is possible. Adding hover states, cursor, and a subtle edit icon will improve discoverability.

## Changes

### File: `src/pages/admin/KpiWeightageDashboard.tsx`

1. **Fix Fragment key** — Replace `<>` with `<React.Fragment key={kraName}>` in the `sortedKras.map()` loop (line ~305). This is required by React and can cause rendering bugs when missing.

2. **Add `stopPropagation`** — On the editor trigger button, add `onClick={(e) => e.stopPropagation()}` to prevent any parent click handlers from intercepting.

3. **Enhance cell visual indicators** — Add a small edit/pencil icon or underline on hover to signal interactivity to the user.

### File: `src/components/admin/WeightageCellEditor.tsx`

4. **Add `modal={false}`** to the Popover — This prevents the popover from trapping focus and potentially conflicting with the table's scroll container. Also add `onOpenAutoFocus` to prevent focus-stealing issues.

These are small, targeted fixes. No database or hook changes needed.

