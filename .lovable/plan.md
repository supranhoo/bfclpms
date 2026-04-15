

## Sticky Table Headers for Menu Access Rights

### Problem
When scrolling down on tables with many rows (Menu Access Rights in Role Access tab, and any future CRUD rights grid), the table headers (Section, Menu Item, View, Add, Update, Delete) scroll out of view, making it hard to identify which column is which.

### Solution
Apply sticky positioning to `TableHeader` rows so they remain visible while scrolling, similar to "Freeze Panes" in Excel.

### Implementation

**File: `src/components/admin/MenuAccessTab.tsx`**

1. **Role Access tab (Tab 4, lines 260-324)**: Wrap the table in a container with `max-height` and `overflow-y-auto`, then apply `sticky top-0 z-10 bg-background` to the `TableHeader` so it stays pinned while the table body scrolls.

2. **Employee Overrides tab (Tab 5)**: Apply the same sticky header pattern if the table is long.

**File: `src/components/admin/AccessProfilesManager.tsx`**

3. **Profiles tab table** and **Assignment tab table**: Apply the same sticky header treatment for consistency across all tables.

### Technical Detail

```text
<div className="rounded-md border max-h-[60vh] overflow-y-auto">
  <Table>
    <TableHeader className="sticky top-0 z-10 bg-background">
      <TableRow> ... </TableRow>
    </TableHeader>
    <TableBody> ... </TableBody>
  </Table>
</div>
```

The `max-h-[60vh]` constrains the table height so the outer page doesn't scroll — instead the table body scrolls while headers stay fixed. The `bg-background` ensures headers aren't transparent over scrolling content.

### Files Changed
- `src/components/admin/MenuAccessTab.tsx` — sticky headers on Role Access and Overrides tables
- `src/components/admin/AccessProfilesManager.tsx` — sticky headers on Profiles and Assignment tables
- `DOCUMENTATION.md` — version bump
- `POLICY.md` — version bump

### Risk Assessment
- **Data impact**: None — CSS-only change
- **Regression risk**: None — purely visual enhancement
- **UX improvement**: Headers stay visible while scrolling through long menu lists

