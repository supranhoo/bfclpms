

## Add KRA Library Quick Search to Assign KRA Dialog

### Problem
Admin must navigate Category → KRA → KPI cascade manually. No way to search across all existing KPIs/templates by keyword, leading to duplicate entries.

### Solution
Add a collapsible "Quick Search KRA Library" panel at the top of `AdminKpiCreateDialog`, above the employee selector. Typing a keyword filters templates + existing KPIs and shows grouped results with checkboxes for selection.

### Visual Layout

```text
┌─────────────────────────────────────────────────────────┐
│  Assign New KRA                                      ✕  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 🔍 Search KRA Library...            (type here) │    │
│  ├─────────────────────────────────────────────────┤    │
│  │                                                 │    │
│  │  ☐ 📁 Sales & Revenue                          │    │
│  │      ☐ KRA: Revenue Generation                  │    │
│  │         ☐ KPI: Monthly Sales Target    [Apply]  │    │
│  │         ☐ KPI: New Client Acquisition  [Apply]  │    │
│  │      ☐ KRA: Customer Retention                  │    │
│  │         ☐ KPI: Churn Rate              [Apply]  │    │
│  │                                                 │    │
│  │  ☐ 📁 Operations                               │    │
│  │      ☐ KRA: Process Efficiency                  │    │
│  │         ☐ KPI: Monthly Output          [Apply]  │    │
│  │                                                 │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  [Employee selector]                                    │
│  [Existing form fields — auto-filled on Apply]          │
└─────────────────────────────────────────────────────────┘
```

### Behavior
1. Admin types keyword (min 2 chars) — system searches `kpi_templates` and `allKpis` matching `kra_name`, `kpi_name`, and category name (case-insensitive)
2. Results grouped hierarchically: **Category → KRA → KPI** with checkboxes at each level
3. **Selecting a Category checkbox**: Auto-fills Category only
4. **Selecting a KRA checkbox**: Auto-fills Category + KRA Name
5. **Selecting a KPI checkbox (or clicking [Apply])**: Auto-fills Category + KRA + KPI Name + all template fields (UOM, target, thresholds, frequency, etc.) via existing `applyTemplate` logic
6. Only one item can be selected at a time (radio-like behavior via checkboxes)
7. Panel collapses after selection; search clears
8. If no results: "No matches found — create manually below"
9. Existing manual Category → KRA → KPI dropdowns remain fully functional below

### Technical Approach
- Add `librarySearch` state string
- Build `useMemo` that merges `templates` + `allKpis`, joins with `categories` for names, filters by keyword
- Group into `Map<categoryId, { name, color, kras: Map<kraName, kpiEntries[]> }>` structure
- Render using existing `Checkbox` component for selection indicators
- On KPI select: call `setCategoryId()`, `setKraName()`, `setKpiName()`, `applyTemplate()` — reusing existing functions
- Panel only visible when search input has 2+ characters
- No new data fetching — uses already-loaded `templates`, `allKpis`, `categories`

### Risk Assessment
- **Data Impact**: None — read-only search over already-fetched data
- **Workflow Impact**: None — additive UI element, existing manual flow completely unchanged
- **Regression Risk**: Zero — no modification to form submission logic, `applyTemplate`, or any state management. New code is isolated to a search panel rendered conditionally above existing content
- **Schema Impact**: None — no database changes

### Files Changed
1. **`src/components/admin/AdminKpiCreateDialog.tsx`** — Add Quick Search panel with grouped checkbox results above existing form

