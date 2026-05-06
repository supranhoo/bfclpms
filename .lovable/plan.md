## Issue
The "Confirm propagation" dialog table only shows ~5 rows and cannot be scrolled. Although the wrapper uses `<ScrollArea className="max-h-64">`, Radix's `ScrollArea` requires an explicit height on its root and `h-full` on the viewport to scroll — `max-h` on the root alone does not propagate, so the table renders at full height and overflows silently.

## Fix (UI only, `src/components/admin/PropagationPreviewDialog.tsx`)
1. Replace `<ScrollArea className="max-h-64 rounded-md border">` with a sized container:
   - Wrap the table in a `<div className="rounded-md border">` and use `<ScrollArea className="h-72">` (fixed height) inside it, OR
   - Simpler: use a plain `<div className="max-h-72 overflow-y-auto rounded-md border">` around the `<table>`. The sticky `<thead>` already works with native overflow.
2. Keep sticky header (`sticky top-0 bg-muted/60 z-10`) so column titles stay visible while scrolling 50 rows.
3. No logic, data, or RLS changes.

## Validation
- Open Org KPI Data Entry → Propagate on a tile mapped to 50 employees → confirm dialog now scrolls through all rows with header pinned.
- Verify dialog itself doesn't grow past viewport on 1366px height.
