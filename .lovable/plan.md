# Improve Global Layout Space Utilization

## Goal
Reduce wasted outer whitespace and let main content (tables, tabs, forms, configuration panels) use nearly the full viewport width after the sidebar — without touching workflows, business logic, schema, colors, fonts, or component styling.

## Risk & Impact Report
- **Data Impact:** None. Pure CSS/className changes.
- **Workflow Impact:** None.
- **UI/UX Impact:** All authenticated pages get wider working area + slightly tighter outer padding. Existing internal spacing (cards, grids, tabs) stays intact.
- **Regression Risk:** Low. Risk is limited to a few narrow-by-design pages (long-form reading like Governance Explainer, single-column forms). Mitigated by keeping their internal `max-w-*` where the content is intentionally narrow.
- **Scalability/Responsive:** Mobile (`p-3`) padding preserved. Desktop uses tighter padding + capped at a wide max-width so 4K monitors still look professional.

## Root Cause (from exploration)
1. `src/components/layout/DashboardLayout.tsx` — `<main>` uses `p-3 sm:p-6` (24px on desktop) which is fine, but combined with #2/#3 below causes double padding.
2. `src/pages/admin/SystemSettings.tsx` adds its own `mx-auto w-full px-4 lg:px-6 py-4 max-w-[1800px]` — duplicate horizontal padding on top of `<main>` padding.
3. Several pages (mostly under `src/pages/safety/*` and a handful of admin pages) wrap content in `max-w-3xl|4xl|5xl|6xl mx-auto`, restricting wide tables/configuration grids to a narrow centered column on large screens. 27 files identified.
4. No global page-container component exists — each page sets its own wrapper, so the only true global lever is `<main>` in `DashboardLayout`.

## Plan

### Step 1 — Tighten the global `<main>` container (single source of truth)
File: `src/components/layout/DashboardLayout.tsx`

Change `<main>` className from:
```
flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6 bg-muted/30 min-w-0
```
to:
```
flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 sm:px-5 sm:py-4 lg:px-6 lg:py-5 bg-muted/30 min-w-0
```
- Reduces desktop horizontal padding from 24px → 20–24px and vertical from 24px → 20px.
- Keeps mobile comfort (12px).
- Sidebar behavior unchanged (still inside `SidebarInset`).

### Step 2 — Remove duplicate wrapper on System Settings
File: `src/pages/admin/SystemSettings.tsx` (line 772)

Change:
```
<div className="mx-auto w-full px-4 lg:px-6 py-4 max-w-[1800px]">
```
to:
```
<div className="w-full">
```
(Outer `<main>` already provides padding; `max-w-[1800px]` no longer needed since `<main>` itself can hold a soft cap if required.)

### Step 3 — Relax restrictive page wrappers on wide admin/reporting/settings pages
Replace `max-w-{4xl|5xl|6xl} mx-auto` with `w-full` ONLY on pages that show tables, multi-column grids, dashboards, or configuration matrices. Targeted files (table/grid/configuration nature, identified by grep):
- `src/pages/admin/ModuleHubSettings.tsx`
- `src/pages/admin/GovernanceExplainer.tsx` — keep narrow (long-form text). **Skip.**
- `src/pages/admin/OrgKpiEvidenceDemo.tsx`
- `src/pages/ModuleHub.tsx`
- `src/pages/ProfileSettings.tsx` — keep narrow (single-column form). **Skip.**
- `src/pages/safety/SafetyHome.tsx`, `SafetyAssets.tsx`, `SafetyAudits.tsx`, `SafetyPermits.tsx`, `SafetyAuditTemplates.tsx`, `SafetyAuditScoreboard.tsx`, `SafetyAuditLog.tsx`, `SafetyUsers.tsx`, `SafetyEmergencyContacts.tsx`, `SafetyHoursWorked.tsx`, `SafetyAnalytics.tsx`, `SafetyPermits.tsx`, `SafetyPermitTypeConfig.tsx`, `SafetySettings.tsx`, `SafetyAssetDetail.tsx`, `SafetyAuditRunDetail.tsx`, `SafetyDrillDetail.tsx`, `SafetyPermitDetail.tsx`, `SafetyIncidentDetail.tsx` (list views & detail dashboards → widen; single-form pages like `SafetyIncidentNew`, `SafetyAssetNew`, `SafetyPermitNew` → **keep narrow**).

Rule applied per file: list/table/dashboard/configuration → widen; single-column create/edit forms or long-form reading → keep.

### Step 4 — Verification
- Load `/admin/system-settings`, `/admin`, `/admin/kpi-mapping-matrix`, `/admin/employee-development`, `/safety`, `/safety/audits`, reports pages.
- Confirm: blank L/R margins reduced, tables use more horizontal room, sidebar untouched, mobile (`<640px`) still has comfortable padding, no horizontal scroll on any page.
- Pages intentionally kept narrow (ProfileSettings, GovernanceExplainer, *New forms) still look balanced.

## Out of Scope (explicit)
- No changes to AppSidebar, headers, cards, tabs, buttons, colors, fonts, icons, or any business logic.
- No DB / RLS / edge-function changes.
- No new page sections removed or added.

## Files to Modify
1. `src/components/layout/DashboardLayout.tsx` — main padding (1 line)
2. `src/pages/admin/SystemSettings.tsx` — remove wrapper max-width (1 line)
3. ~22 page files — replace `max-w-* mx-auto` with `w-full` on wide-content pages only

## Rollback
All changes are className edits; revert by restoring the original Tailwind classes per file.
