

## Fix: Sticky Headers Not Working on Menu Access Rights Table

### Root Cause
The `Table` component (`src/components/ui/table.tsx`) wraps every `<table>` in a `<div className="relative w-full overflow-auto">`. This creates a **nested scroll container** inside the outer `max-h-[60vh] overflow-auto` div. CSS `position: sticky` only works relative to its nearest scrolling ancestor — the inner wrapper captures the scroll, so the header never sticks against the outer container.

### Solution
Override the inner wrapper's overflow on the specific tables where sticky headers are needed. The outer `div` with `max-h-[60vh] overflow-auto` should be the sole scroll container.

### Implementation

**File: `src/components/admin/AccessProfilesManager.tsx`**

On the Menu Access Rights `<Table>`, pass a className that neutralizes the inner wrapper's overflow:

```tsx
<Table className="[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-background"
```

But more directly — add `overflow-visible` to the Table's wrapper by passing it through, or wrap a raw `<table>` instead. The cleanest fix:

Change the outer container to target the Table's inner wrapper div:

```tsx
<div className="rounded-md border max-h-[60vh] overflow-auto [&>div]:overflow-visible">
```

This sets the Table component's inner `overflow-auto` div to `overflow-visible`, making the outer div the sole scroll container so `sticky` works.

Apply the same `[&>div]:overflow-visible` pattern to **all** tables in this file and in `MenuAccessTab.tsx` that use sticky headers.

**Files affected:**
- `src/components/admin/AccessProfilesManager.tsx` — Menu Access Rights table, Profiles table, Assignment table
- `src/components/admin/MenuAccessTab.tsx` — Role Access table, Employee Overrides table
- `DOCUMENTATION.md`, `POLICY.md` — Version bump

### Risk Assessment
- **Data impact**: None — CSS-only
- **Regression risk**: None — only affects tables already wrapped in a height-constrained scroll container
- **UX improvement**: Headers stay visible while scrolling, matching Excel freeze-pane behavior

