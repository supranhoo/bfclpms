

# Plan: Reusable Admin KPI Editor + AllKpis Page Realignment

## 1. Make Admin KPI Editor Reusable

**Current state**: `AdminKpiEditDialog` (1032 lines) is tightly coupled to the `Dialog` wrapper. All form logic, state, submission, copy-to-months, and apply-scope are inside one monolithic component. It's used in 4 places (AllKpis, KpiWeightageDashboard, ScoringHealthCheck, KpiHeaderSection) — always as a dialog.

**Goal**: Extract the form content into a standalone reusable component (`AdminKpiEditorForm`) that can be rendered inside a Dialog, a Sheet, or as a full page section.

### Changes

**New file: `src/components/admin/AdminKpiEditorForm.tsx`**
- Extract all form state, handlers (`handleSubmit`, `handleCopyToMonths`), and JSX from `AdminKpiEditDialog` into this component
- Props: `kpi: KPI | null`, `onSaved: () => void`, `onCancel: () => void`
- Contains all the form fields, apply-scope selector, copy-to-months, reason field, and Save/Cancel buttons
- No Dialog/Sheet wrapper — pure form content

**Modified: `src/components/admin/AdminKpiEditDialog.tsx`**
- Slim down to just a `Dialog` shell that renders `<AdminKpiEditorForm />` inside `DialogContent`
- Keeps the same external interface (`isOpen`, `onClose`, `kpi`) so all 4 existing consumers remain unchanged

This makes the editor embeddable anywhere — a dedicated admin page, a Sheet panel, or the existing Dialog.

---

## 2. AllKpis Page Realignment

**Current issues observed**:
- Header action buttons wrap awkwardly on medium screens (Scoring Health Check, Export, Copy KRAs, Bulk Assign, Assign KRA all in one row)
- Filter card takes too much vertical space with its own Card wrapper
- Expanded KPI row action buttons (6 buttons) are cramped on smaller viewports
- Employee info line (code · department · weightage) can overflow

### Changes

**Modified: `src/pages/admin/AllKpis.tsx`**

1. **Header section**: Move action buttons into a proper toolbar with grouped spacing. Put primary actions (Assign KRA) separate from secondary actions (Export, Copy, Bulk Assign). Keep Scoring Health Check aligned left near the title.

2. **Filters**: Convert from Card wrapper to a compact inline bar — remove the CardHeader/CardTitle overhead. Use a collapsible filter row that saves vertical space, with a "Filters" toggle button showing active filter count badge.

3. **Matrix table**: 
   - Add `sticky` positioning to the first column (Employee Name) for horizontal scroll
   - Tighten cell padding for stage count columns

4. **Expanded KPI rows**:
   - Use a 2-column grid layout for KPI details (left: KRA/KPI info, right: metadata)
   - Group action buttons with proper spacing and overflow handling
   - Add consistent icon+label tooltips

### Files

| File | Action |
|------|--------|
| `src/components/admin/AdminKpiEditorForm.tsx` | **Create** — extracted form content |
| `src/components/admin/AdminKpiEditDialog.tsx` | **Modify** — thin Dialog wrapper around `AdminKpiEditorForm` |
| `src/pages/admin/AllKpis.tsx` | **Modify** — header, filters, table realignment |

