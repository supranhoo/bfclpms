
# Enhancement: "Assign New KRA" Dialog — Wider Layout, Two-Column Form, Better Readability

## Current Pain Points

1. **Too narrow**: `max-w-2xl` (42rem / ~672px) — all form fields stack in a single narrow column
2. **Scroll area too short**: `h-[60vh]` means the user sees ~60% viewport height of content at a time, constantly scrolling up and down
3. **KRA/KPI name fields side by side is confusing**: Category → KRA → KPI are stacked vertically in a `grid-cols-1`, so long KPI names get truncated in the combobox button
4. **Rating threshold grid (R0–R5)** is `grid-cols-2` which is already tight — needs more breathing room
5. **No visual hierarchy** between the "Identity" section (Category/KRA/KPI) and the "Metrics" section (UOM, Target, Frequency, Thresholds)

## Solution

### 1. Increase Dialog Width
**Change line 303:**
```tsx
// Before
className="max-w-2xl max-h-[90vh]"

// After
className="max-w-4xl max-h-[92vh]"
```
`max-w-4xl` = 56rem / ~896px. This gives a noticeable increase in readable width without exceeding normal desktop screens.

### 2. Increase Scroll Area Height
**Change line 309:**
```tsx
// Before
<ScrollArea className="h-[60vh] pr-4">

// After
<ScrollArea className="h-[72vh] pr-4">
```
More vertical real estate so the user scrolls less.

### 3. Two-Column Layout for the Main Form
Split the form into two columns using a responsive `grid-cols-2` layout:

**Left column (identity/naming):**
- Category (combobox / inline creation)
- KRA Name (combobox / custom input)
- KPI Name (combobox / custom textarea)
- Review Period & Year

**Right column (metrics/config):**
- UOM Type selector
- UOM + Target Value
- Weightage + Criteria
- Frequency + Cycle Start + Day Count Type
- Source of Data
- Threshold Mode + R0–R5 rating thresholds
- Advanced Settings (Require Resubmit Reason)

This way the admin can see both the "what" (identity) and "how" (configuration) simultaneously without scrolling back and forth.

### 4. Improve KRA/KPI Name Display
- KPI Name combobox button: Add `line-clamp-2 text-left` so long names are truncated gracefully rather than colliding with the chevron icon
- Show the selected KPI name prominently in the left column when using template (currently it just appears in the button text)

### 5. Visual Section Headers with Subtle Dividers
Replace raw `<Separator />` tags with labelled section headers:
- **"KRA Identity"** — Category, KRA, KPI
- **"Metrics & Configuration"** — UOM, Target, Frequency
- **"Rating Thresholds"** — R0–R5
- **"Period & Advanced"** — Review period, resubmit toggle

This helps the admin understand which section they're in at a glance.

### 6. Rating Threshold Grid — 3 Columns Instead of 2
Change `grid-cols-2` to `grid-cols-3` on the R-value fields (R5, R4, R3, R2, R1, R0) so all 6 are visible without scrolling, fitting naturally in the wider dialog.

## Files to Change

| File | Lines | Change |
|---|---|---|
| `src/components/admin/AdminKpiCreateDialog.tsx` | 302–309 | Widen dialog (`max-w-4xl`), taller scroll area (`h-[72vh]`) |
| `src/components/admin/AdminKpiCreateDialog.tsx` | 310–991 | Restructure into left/right two-column grid layout with section headers |
| `src/components/admin/AdminKpiCreateDialog.tsx` | 782 | Rating threshold grid changed from `grid-cols-2` to `grid-cols-3` |
| `DOCUMENTATION.md` | — | Version bump + note about dialog enhancement |

## Layout Diagram

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  Assign New KRA                                              [×]         │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌───── KRA IDENTITY ──────────────┐  ┌──── METRICS & CONFIG ─────────┐ │
│  │  Assign to Employee             │  │  UOM Type (Numeric/Binary/…)  │ │
│  │  Category        [combobox ▼]   │  │  UOM          Target Value    │ │
│  │  KRA Name        [combobox ▼]   │  │  Weightage %  Criteria        │ │
│  │  KPI Name        [combobox ▼]   │  │  Frequency    Cycle Start     │ │
│  │                                 │  │  Source of Data               │ │
│  │  ── RATING THRESHOLDS ─────── ─ │  │                               │ │
│  │  R5 [____] R4 [____] R3 [____]  │  │  ── ADVANCED ─────────────── │ │
│  │  R2 [____] R1 [____] R0 [____]  │  │  Require Resubmit Reason [○] │ │
│  │                                 │  │                               │ │
│  │  ── PERIOD ──────────────────── │  │                               │ │
│  │  Period [▼]   Year [▼]          │  │                               │ │
│  └─────────────────────────────────┘  └───────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────┤
│                                            [Cancel]  [Assign KRA]       │
└─────────────────────────────────────────────────────────────────────────┘
```

## Impact

- No logic changes — purely layout and sizing improvements
- Both usages (`AllKpis.tsx` and `KraIssuanceConfirmDialog.tsx`) benefit automatically
- Mobile: `max-w-4xl` gracefully collapses on smaller screens since Radix Dialog respects viewport width; the two-column grid becomes single-column at `sm` breakpoint using `grid-cols-1 md:grid-cols-2`
