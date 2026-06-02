# Phase 4 — Report IDs + Report Field Sequence

Goal: every report in the app gets a stable, module-prefixed Report ID (e.g. `RPT-PERF-001`), the URL can carry it without breaking existing routes, and admins can re-order report columns per report from a new **Report Field Sequence** tile in System Settings → Report Builder.

---

## 1. Assumptions

- All current reports live under `/reports/*` routes. Each report page renders a fixed column set today (no DB-driven layout).
- Existing legacy URLs (`/reports/performance`, `/reports/incentive`, `/reports/kra-issuance`, `/reports/tni`, etc.) must keep working forever. Report ID is **additive metadata**, never a hard URL change.
- Column keys inside a report are stable strings owned by the page (similar to `menu_key`). Admin can reorder, hide-from-display, and rename **display labels** only; underlying data keys never change.
- Master switch reuses pattern from Phase 1–3: `report_overrides_enabled` system_setting (default off → zero behaviour change).
- Phase 4 scope = ID registry + field-sequence builder. Export-side wiring (CSV/XLSX column order) reuses the same resolver per report.

## 2. Risk & Impact Report

| Area | Impact | Mitigation |
|---|---|---|
| Data | New tables only: `report_registry`, `report_field_registry`, `report_field_overrides`, `report_field_override_audit`. Additive. | All RLS admin-write / authenticated-read. GRANTs in same migration. Backup auto via `get_backup_table_order()`. |
| URL / routing | Adds optional `?rpt=RPT-PERF-001` qualifier and a single `/r/:reportId` shortlink. Old routes untouched. | Shortlink resolves to canonical route via registry; 404 if unknown. Tests for both. |
| Reports | Column order resolved by hook. When flag off OR no override saved, page renders its hardcoded order. | Pure fallback. |
| Exports | Same hook drives export header order. | Reuses resolved list. |
| Security | Report Access (`menu_access_config`) still gates visibility. Sequence override never grants access. | Permission check stays on `menu_key` / `permission_key`. |
| Regression | Misordered/hidden column could break a downstream consumer that reads by index. | All consumers read by key, not index. Lint test scans for `row[0]`-style index access in report files. |
| Scalability | ~10 reports × ~12 cols = ~120 rows in field registry. Trivial. | React Query 5-min cache. |
| Rollback | Toggle flag off OR `Reset all` per report. | Soft-delete (`is_active=false`) like menu overrides. |

## 3. Architecture

### 3.1 Database (new migration)

```sql
-- Report catalog (one row per report page)
CREATE TABLE public.report_registry (
  report_id      text PRIMARY KEY,           -- e.g. RPT-PERF-001
  report_key     text UNIQUE NOT NULL,       -- stable code key, e.g. 'performance'
  module_prefix  text NOT NULL,              -- 'PERF', 'INC', 'KRA', 'TNI', ...
  display_name   text NOT NULL,
  canonical_route text NOT NULL,             -- '/reports/performance'
  menu_key       text REFERENCES menu_registry(menu_key),
  description    text,
  is_active      boolean NOT NULL DEFAULT true,
  sort_order     int NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Field catalog (one row per column per report)
CREATE TABLE public.report_field_registry (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id      text NOT NULL REFERENCES report_registry(report_id) ON DELETE CASCADE,
  field_key      text NOT NULL,              -- stable; never renamed
  default_label  text NOT NULL,
  default_sort   int  NOT NULL,
  is_required    boolean NOT NULL DEFAULT false,  -- can't be hidden
  is_renamable   boolean NOT NULL DEFAULT true,
  data_type      text,                       -- 'string'|'number'|'date'|'enum'
  UNIQUE(report_id, field_key)
);

-- Per-client overrides (sequence + label + visibility)
CREATE TABLE public.report_field_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       text NOT NULL REFERENCES report_registry(report_id) ON DELETE CASCADE,
  field_key       text NOT NULL,
  client_id       uuid,                      -- NULL = global
  custom_label    text,
  custom_sort     int,
  is_hidden       boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  updated_by      uuid,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX report_field_overrides_uniq
  ON public.report_field_overrides (report_id, field_key, COALESCE(client_id::text, '__global__'))
  WHERE is_active = true;

-- Append-only audit
CREATE TABLE public.report_field_override_audit (...);

GRANT SELECT ON public.report_registry, public.report_field_registry TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_field_overrides, public.report_field_override_audit TO authenticated;
-- + service_role ALL, RLS admin-only writes
```

Validation trigger: reject hiding `is_required=true`, reject `custom_sort < 0`, audit row on every change.

System setting: `report_overrides_enabled` (jsonb `"false"`).

### 3.2 Catalog & resolver (TS)

```
src/lib/reports/
  catalog.ts              # REPORT_CATALOG + REPORT_FIELD_CATALOG (seed source)
  types.ts
  applyFieldOverrides.ts  # pure: defaults + overrides → ResolvedField[]
  applyFieldOverrides.test.ts
src/hooks/useResolvedReportFields.ts
```

- `REPORT_CATALOG` seeds `report_registry`. Module prefixes: `PERF`, `INC`, `KRA`, `TNI`, `MAT` (matrix), `WFC` (workflow config), `OBS`, etc.
- `useResolvedReportFields(reportId)` returns `[{ key, label, sort, isHidden, isRequired }]` ordered, with the same flag-gated fallback as menu hook.
- `getReportIdFromRoute(path)` and `getRouteFromReportId(rpt)` helpers.

### 3.3 Routing

- Add a single thin route `/r/:reportId` → looks up `report_registry.canonical_route` and `<Navigate>` (preserves query string).
- Existing report pages accept an optional `?rpt=` qualifier for deep links/exports; ignored if absent.
- No existing route is changed.

### 3.4 UI — Report Field Sequence tile (System Settings → Report Builder)

```
┌─ Report Builder ──────────────────────────────────────────┐
│ [ Enable report overrides ⓘ ]            [ Reset all ]    │
│                                                           │
│ Search reports: [____________]                            │
│                                                           │
│ Report                          ID            Module      │
│ ─────────────────────────────── ───────────── ──────────  │
│ Performance Report              RPT-PERF-001  Reports   ▸ │
│ KPI Employee Matrix             RPT-MAT-001   Reports   ▸ │
│ Incentive Report                RPT-INC-001   Incentive ▸ │
│ ...                                                       │
└───────────────────────────────────────────────────────────┘

Expanded row:
┌─ Performance Report · RPT-PERF-001 · /reports/performance ┐
│ Columns (drag to reorder, toggle eye to hide)             │
│ ⋮⋮ 👁 Employee                       [Required]           │
│ ⋮⋮ 👁 Department          ✎ "Dept."                       │
│ ⋮⋮ 👁 KRA Name                                            │
│ ⋮⋮ 🚫 Manager Comment           ← hidden                   │
│                                                           │
│ [ Preview ]   [ Discard ]   [ Save changes ]              │
└───────────────────────────────────────────────────────────┘
```

- One row per report. Click to expand → @dnd-kit sortable list of fields. Eye icon toggles hidden. Inline rename. Per-row revert.
- Preview opens a small dialog with the resolved column list (current vs new).
- Save = bulk upsert into `report_field_overrides` + audit rows. Per-report Reset clears its overrides.

### 3.5 Consumer wiring (Phase 4 minimum)

Wire two reports as the reference implementation, others follow the same pattern in later passes:
- `src/pages/reports/Performance.tsx` (table headers + CSV export)
- `src/pages/reports/Incentive.tsx`

Each page:
```tsx
const fields = useResolvedReportFields('RPT-PERF-001', PERF_DEFAULT_FIELDS);
// render <th> from fields; render <td> by field.key
```

Other report pages keep working unchanged (flag off → defaults).

## 4. Step-by-Step Plan

1. **Migration**: create the 4 tables + GRANTs + RLS + validation trigger + system_setting row. *Verify*: linter clean, RLS in place.
2. **Catalog + resolver + hook + tests** (`src/lib/reports/*`, `useResolvedReportFields`). *Verify*: unit tests for sort, hidden, required, fallback when flag off.
3. **Shortlink route** `/r/:reportId` in router; helpers `getReportIdFromRoute/getRouteFromReportId`. *Verify*: route test redirects to canonical, 404 on unknown.
4. **Report Builder tab UI** in System Settings (`ReportBuilderTab.tsx` or extend existing): seed button, list of reports, expandable field DnD, preview dialog, audit log dialog. *Verify*: render + dnd interaction tests.
5. **Wire Performance + Incentive reports**: headers + export use resolver. *Verify*: snapshot test of header order with a sample override.
6. **Docs**: `mem://features/admin/menu-setting` cross-link, new `mem://features/admin/report-field-sequence`. Update plan.

## 5. UI Changes Summary

- **Location**: System Settings → Report Builder tab.
- **Visual change**: new Report Field Sequence tile (collapsible per report) with DnD-sortable columns, hide/show, inline rename, preview, per-report and global reset, audit dialog. Same visual language as Menu Setting tab.
- **Reports affected (Phase 4)**: Performance + Incentive report pages render columns in resolved order with resolved labels; export header order matches. Other reports unaffected until later passes.
- **URL**: new `/r/:reportId` shortlink; existing routes unchanged.

## 6. Tests

- `applyFieldOverrides.test.ts`: order, label override, hidden, required-cannot-hide, inactive override ignored.
- `useResolvedReportFields.test.tsx`: flag off → defaults; flag on → overrides.
- `reportIdRouting.test.ts`: shortlink → canonical; unknown → 404 component.
- `ReportBuilderTab.test.tsx`: DnD reorder → stage → save flow with mocked supabase.
- DB trigger test: hide required field → expect raise.

## 7. Out of Scope (deferred to Phase 5)

- Wiring every remaining report page to the resolver (only Performance + Incentive in Phase 4).
- Per-user (vs per-client) column preferences.
- Column-level access rules.
- Multi-tenant `client_id` UI for report overrides.
- Adding brand-new computed columns from the UI.

## 8. Rollback

- Toggle `report_overrides_enabled` off → every report instantly renders defaults.
- Per-report Reset and global Reset already in tile.
- Migration is additive; no destructive schema change.
