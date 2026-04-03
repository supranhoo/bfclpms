

## Fix: Unreadable Expanded KPI Details in Bundle Editor

### Problem
The expanded KPI details in the right-panel browser are nearly unreadable — dark background clashes with muted text colors, tiny font sizes, and the rating scale cards use light backgrounds (e.g., `bg-green-50`) that don't work on dark-themed cards. The screenshot confirms: text is barely visible, ratings are washed out.

### Fix — 1 file: `src/pages/admin/BundleEditor.tsx`

**Both `BrowserTemplateCard` (right panel) and `SelectedTemplateRow` (left panel) expanded sections will be improved:**

#### Right Panel — `BrowserTemplateCard` expanded section (lines 640-663)
1. Use a **light background container** (`bg-card rounded-lg border`) for the expanded details so text is always readable regardless of parent card theme
2. Increase text to `text-sm` for key fields (UOM, Target, Criteria, etc.)
3. Rating Scale cards: use **opaque, high-contrast backgrounds** with larger padding and non-truncated values — matching the reference screenshot style (colored header row with label, value below)
4. Add `R0` support (already partially there)
5. Add a proper section layout: metadata grid on top, rating scale grid below with clear "Rating Scale" label

#### Left Panel — `SelectedTemplateRow` expanded section (lines 559-586)
1. Same light-background treatment for consistency
2. Rating scale: switch from inline `R5: value` text to the same colored card grid used in right panel — much easier to scan
3. Slightly larger text (`text-xs` → `text-sm` for values)

#### `RatingCell` component (lines 679-685)
1. Increase padding from `p-1.5` to `p-2`
2. Remove `truncate` — show full value
3. Ensure min-width so cells don't collapse on short values

### Visual Result
Both panels will show expanded KPI details with:
- Clear white/light card background for the details section
- 2-column metadata grid (UOM, Target, Frequency, Source, Criteria)
- 3-column rating scale grid with colored, high-contrast cards (matching the uploaded screenshot style)
- Readable font sizes throughout

