

## Fix Cramped Internal Layout in Copy KRAs Dialog

### Problem
The outer dialog is `max-w-5xl` but the inner structure crams the search input + month + year into a `sm:grid-cols-3` within a half-width `lg:grid-cols-2` column. This makes each field very narrow and unusable.

### Fix — `src/components/admin/CopyKrasDialog.tsx`

**Step 1 (Source Employee) layout changes:**
1. Make search input full-width (remove `sm:col-span-1`, use own row)
2. Put Month + Year selects on a second row as `grid-cols-2`
3. Expand search dropdown `max-h-32` → `max-h-48` for better visibility

**Step 3 (Target Employees) layout changes:**
1. Same pattern — search input full-width on its own row
2. Month + Year on a second row as `grid-cols-2`

**Both steps** currently use `grid grid-cols-1 sm:grid-cols-3 gap-2` which creates 3 cramped columns. Change to stacked rows:
- Row 1: Search input (full width)
- Row 2: Month + Year (2 columns)

This keeps the two-panel side-by-side layout but makes each panel's fields properly sized.

### Files Changed
1. **`src/components/admin/CopyKrasDialog.tsx`** — Restructure Step 1 and Step 3 internal grids from 3-column to stacked rows

