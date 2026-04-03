

## Add Click-to-Expand on Selected Templates (Left Panel)

### Problem
In the left panel's "Selected Templates" list, each row shows only a truncated title and KRA→KPI line. Users cannot view full KPI details (target, UOM, criteria, rating scale, frequency, etc.) without scrolling to find it in the right panel browser.

### Fix — 1 file change

**`src/pages/admin/BundleEditor.tsx`** — `SelectedTemplateRow` component:

1. Add local `isExpanded` state to each row
2. Add a `ChevronDown`/`ChevronUp` toggle button (next to the action buttons) that expands/collapses a details section below the row summary
3. The expanded section shows:
   - Full KRA name and KPI name (unwrapped, not truncated)
   - Target value + UOM
   - Criteria, Frequency, Source of Data
   - Rating scale (R5→R1) in a compact inline format
4. Clicking the expand button does **not** affect move/remove actions — isolated click zone

### UI Sketch
```text
┌─────────────────────────────────────────────────┐
│ ≡  1.  Template Title        [Category] 20%  ▼ │
├─────────────────────────────────────────────────┤
│   KRA: Full KRA name                           │
│   KPI: Full KPI name                           │
│   Target: 100 Units  │ Criteria: Higher Better  │
│   Frequency: Monthly │ Source: SAP              │
│   R5: ≥120  R4: ≥110  R3: ≥100  R2: ≥90  R1: <90│
└─────────────────────────────────────────────────┘
```

### Technical Detail
- The expand toggle is added as another `Button` in the hover-action group (but always visible, not opacity-gated, so users can discover it)
- Expanded content renders inside the same `div` below the summary row, with a top border separator
- No new dependencies needed

