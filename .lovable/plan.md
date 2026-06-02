
# Plan: Configurable Menu Architecture + Report ID & Field Sequence

Feasibility study + safe architecture. No code yet — this plan defines the contract, risks, and phased rollout. Three large concerns are addressed: (A) **Menu Setting** under System Settings, (B) **stable Report IDs in URLs**, (C) **Report Field Sequence** tile in Report Builder.

---

## 1. Feasibility analysis

| Capability | Feasibility | Notes |
|---|---|---|
| Rename L2/L3/L4 labels | High | Pure display layer over `menu_key`. Zero risk. |
| Reorder within same parent | High | Sort key only. |
| Reposition L3 → L2 within same module | Medium | Requires registry flag `is_movable` + parent-compatibility check. Some L3 tabs share a host page's state (e.g. Organization sub-tabs share a `<Tabs>` shell); promoting them to L2 needs a standalone route. |
| Move L3 between L2 hosts (same module) | Medium | Only safe when the target L2 is a generic `<Tabs>` host. Most current L2 entries are dedicated pages — flag them `accepts_children=false`. |
| Cross-app/module move (PMS↔HRMS) | **Low–Medium** | Routes, permissions, and feature licensing are module-scoped today. Defer to Phase 3 with explicit `is_cross_app_movable` allowlist (initially empty). |
| Stable Report IDs in URL | High | Add backwards-compatible `?reportId=RPT-001` query param; old routes keep working. |
| Per-report column sequence (UI + export) | High | Mechanism exists today (`useReportColumnOverrides` + `report_columns_{key}`). Extend to ID-keyed registry. |
| Client-wise overrides (SaaS) | High (forward-compat) | `client_id NULL` column ships now; resolver uses `NULL` for single-tenant. |

**Verdict:** Phase 1 (rename/reorder + reposition within a module) and Report ID + Field Sequence are safe to ship. **Cross-app movement is feasible only as a controlled allowlist** — not free-form.

---

## 2. Current menu architecture findings

- Sidebar is hardcoded in `src/components/layout/AppSidebar.tsx` (~10 groups, each an array of `{ title, url, icon, menuKey, roles }`).
- System Settings tabs are a hardcoded `SETTINGS_SECTIONS` array in `src/pages/admin/SystemSettings.tsx` (22 entries).
- L4 tabs (Organization sub-tabs, Workflow Config sub-tabs, etc.) are local `<Tabs>` literals inside each section component.
- Visibility/permissions live in `menu_access_config` + `menu_access_user_overrides` + profile-based rights — **already DB-driven**. We will **not duplicate** this; Menu Setting governs only **label / parent / order**.
- `ReportRoute` already maps menu access via the convention `reports-{reportKey}` — same convention will be reused for the report registry.

**Risk hotspots:** routes are bound to component imports; moving a page = routing change, not config change. We therefore separate **structure** (config) from **routing** (code).

## 3. Current report architecture findings

- Hardcoded report list in `src/components/admin/ReportSequenceConfig.tsx` (`PREBUILT_REPORTS`, 20 entries) and custom reports from `useCustomReports`.
- Display order already DB-backed via `report_display_order` system setting.
- Column overrides already DB-backed per report via `report_columns_{reportKey}` (alias + visible + width). **`reportKey` ≠ `reportId`** today — there is no stable Report ID surface.
- No Report ID exists anywhere in URL, metadata, exports, or UI.
- Excel/PDF exports do NOT consistently honor column overrides today (varies by report). Will be hardened.

## 4. Recommended menu registry model

`public.menu_registry` (defaults, seeded from code):

| column | type | purpose |
|---|---|---|
| `menu_key` | text PK | **Immutable identity** (permission key) |
| `default_label`, `default_parent_key`, `default_sort_order`, `module_key` | — | defaults |
| `menu_level` | smallint | 1/2/3/4 |
| `route_path` | text | nullable for grouping nodes |
| `icon_name` | text | lucide name |
| `accepts_children` | bool | gates drop targets |
| `is_renamable`, `is_movable`, `is_cross_app_movable`, `is_system_required` | bool | move/rename gates |
| `feature_key`, `permission_key` | text | for licensing/permission preservation |

`public.menu_overrides` (per client, nullable today):

| column | type |
|---|---|
| `menu_key` FK, `client_id` (nullable), `custom_label`, `custom_parent_key`, `custom_sort_order`, `is_active`, `updated_by`, `updated_at` |
| UNIQUE (`menu_key`, `client_id`) |

`public.menu_override_audit` — immutable log of every label/parent/order/reset change with old/new values.

**Resolver:** `src/hooks/useResolvedMenu.ts` returns the tree with overrides applied. AppSidebar + SystemSettings consume the resolver. **`menu_key` is never overridable.**

## 5. Recommended Report ID model

`public.report_registry`:

| column | type | purpose |
|---|---|---|
| `report_id` | text PK | Stable, human-readable: `RPT-PERF-001`, `RPT-EMP-MATRIX-007` |
| `report_key` | text UNIQUE | Existing string key (e.g. `performance`) — kept for backwards compat |
| `name`, `module_key`, `route_path`, `category` | — | metadata |
| `default_field_sequence` | text[] | ordered field keys |
| `is_active`, `is_custom`, `source_id` (FK to `custom_reports.id` when custom) |

**URL contract** (backwards compatible):

- Existing route stays: `/reports/performance` ✅
- ALSO accepts: `/reports/performance?reportId=RPT-PERF-001` ✅
- ALSO accepts canonical: `/reports/RPT-PERF-001` → 301-style internal redirect to existing route + reportId param ✅
- Old bookmarks never break.

Report ID is surfaced in: Reports Hub card, Report Builder header, Report Access list, exports (footer cell), Field Sequence editor.

## 6. Recommended Report Field Sequence model

`public.report_field_sequence`:

| column | type |
|---|---|
| `id` uuid PK, `report_id` FK → `report_registry`, `client_id` nullable, `field_key` text, `field_label` text (override-only, optional), `sequence_order` int, `is_hidden` bool, `updated_by`, `updated_at` |
| UNIQUE (`report_id`, `client_id`, `field_key`) |

Resolver hook `useResolvedReportFields(reportId)` returns the ordered field list. **Both table render and export builders consume this resolver** (this is the hardening step — today only some exports do).

## 7. Safe movement rules (validation pipeline)

Reject the save when ANY of these fail:

1. Source row `is_movable = false`.
2. Target parent `accepts_children = false`.
3. Target parent in a different `module_key` AND source `is_cross_app_movable = false`.
4. Move would change `menu_level` to a value outside `{2,3,4}`.
5. Cycle detected (target is descendant of source).
6. Target parent path would render the source's route in an invalid `<Outlet>` slot (validated against a route-graph manifest emitted at build time).
7. Source `is_system_required = true` AND change touches `parent` or `module`.

Same pipeline runs in DB trigger (`menu_overrides_validate`) **and** in the UI before save (instant feedback). PL/pgSQL is the authority; the UI mirror is for UX.

## 8. Cross-app movement — feasibility & risks

| Concern | Resolution |
|---|---|
| Routes are bound to module folder structure | Cross-app move does NOT physically move a route. The page stays mounted at its original route; only **where it appears in the sidebar** changes. Breadcrumbs use the override tree. |
| Permission keys (`menuKey`) are module-flavored | `menu_key` stays unchanged; permission resolution unchanged. |
| Feature licensing per module | Override is rejected if source `feature_key` is not licensed for the target module's tenant. |
| Active highlighting / breadcrumbs | Resolver always returns the override-tree path; AppSidebar highlight is driven by override path, not original. |
| Risk of exposing a page to users who shouldn't see it | Visibility = Menu Access ∩ Resolved Position. Moving a node never grants access — Menu Access is the gate. |
| Initial allowlist | **Empty** in Phase 1–2. Phase 3 turns on a curated set: Incentive group, specific Reports. Each entry approved with a written reason. |

## 9. UI design proposal

### 9.1 Menu Setting tab (System Settings, below Organization)

```text
┌─ Menu Setting ────────────────────────────────────────────────────────┐
│ Module: [PMS ▼]  Scope: [Global ▼]  [Preview]  [Reset All…]  [Save]  │
├──────────────────────────────────┬────────────────────────────────────┤
│ TREE (60%)  [search…]            │ EDIT PANEL (40%)                   │
│                                  │                                    │
│ ▾ PMS                            │ Selected: Organization             │
│   ▾ Administration               │ ───────────────────────────────    │
│     ▾ System Settings 🔒         │ menu_key:  admin-organization      │
│       • Branding                 │ route:     /admin/settings?…       │
│       • General                  │ level:     3                       │
│       • Workflow Config          │                                    │
│       • Organization      ← sel  │ Label:    [Organization Structure] │
│         ▾ Divisions              │ Default:  "Organization" [Reset]   │
│         ▾ Business Units         │                                    │
│         ▾ Departments            │ Parent:   [System Settings ▼]      │
│         ▾ Locations              │   (only compatible parents shown)  │
│         ▾ PMS Grades             │                                    │
│         ▾ Levels                 │ Module:   [PMS ▼]                  │
│       • Menu Setting (new)       │   (locked unless cross-app)        │
│       • Review Periods           │                                    │
│       …                          │ Sort:     [4]  [▲]  [▼]            │
│     • Increment Inputs           │                                    │
│     • Employee Development       │ Flags                              │
│   ▸ Incentive                    │  ☑ Movable  ☑ Renamable            │
│   ▸ Reports                      │  ☐ Cross-app movable               │
│ ▸ HRMS  (greyed if not licensed) │  🔒 System required (read-only)    │
│                                  │                                    │
│ Legend                           │ [ Reset this item ]                │
│  🔒 system  ⊘ non-movable        │                                    │
└──────────────────────────────────┴────────────────────────────────────┘
[ Sticky banner when dirty:  "N pending changes  [Discard]  [Save]" ]
```

- Drag-and-drop via `@dnd-kit/sortable`. Invalid drops show a red border + toast with the failing rule.
- Double-click label = inline rename.
- "Preview" opens a `Sheet` rendering the resolved sidebar exactly as end users will see it.

### 9.2 Report Builder → "Report Field Sequence" tile

```text
┌─ Report Builder ─────────────────────────────────────────────────────┐
│ Tiles: [Custom Reports] [Column Overrides] [Display Order]           │
│        [Report Field Sequence ★ new]                                 │
└──────────────────────────────────────────────────────────────────────┘
```

Inside the tile:

```text
┌─ Report Field Sequence ──────────────────────────────────────────────┐
│ [search reports…]   Module: [All ▼]   Type: [All / Built-in / Custom]│
├──────────────────────────────────────────────────────────────────────┤
│ Report ID       Name                       Module    Fields  Action │
│ RPT-PERF-001    Performance Report         PMS         18    [Edit] │
│ RPT-EMP-001     Employee Summary           PMS         12    [Edit] │
│ RPT-MATRIX-007  KPI-Employee Matrix        PMS         dyn   [Edit] │
│ RPT-CUSTOM-…    My Custom Report           Custom      9     [Edit] │
└──────────────────────────────────────────────────────────────────────┘
```

Edit Sequence dialog:

```text
┌─ RPT-PERF-001 · Performance Report — Field Sequence ─────────────────┐
│  [Reset to default]                              [Cancel] [Save]     │
├──────────────────────────────────────────────────────────────────────┤
│  #  ⋮⋮  Field                  Label override    Hidden?            │
│  1  ⋮⋮  employee_code          [—]              ☐                   │
│  2  ⋮⋮  employee_name          [—]              ☐                   │
│  3  ⋮⋮  department             [Dept.]          ☐                   │
│  4  ⋮⋮  final_score            [—]              ☐                   │
│  …                                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

Hidden toggle reuses existing column-overrides mechanism (no new permission layer).

## 10. Data model changes required

New tables (single migration each), all with `GRANT` blocks + RLS (admin write, authenticated read):

1. `menu_registry`, `menu_overrides`, `menu_override_audit`
2. `report_registry`, `report_field_sequence`, `report_sequence_audit`

Seeders:

- One-time edge function `seed-menu-registry` introspects current AppSidebar/SystemSettings code-as-data export and writes registry rows.
- One-time edge function `seed-report-registry` writes the 20 prebuilt reports with deterministic `RPT-…-NNN` IDs + imports `custom_reports.id` as `source_id`.

Trigger: `menu_overrides_validate` (PL/pgSQL) enforces rules from §7.

Both `menu_overrides` and `report_field_sequence` ship with `client_id uuid NULL` for forward SaaS compatibility — single-tenant uses NULL.

**Backup**: Tables live in `public`, so the existing `get_backup_table_order()` includes them automatically. No denylist changes.

## 11. Phased implementation plan

**Phase 1 — Foundations (no behavioural change)**
- Create `menu_registry`, `menu_overrides`, `menu_override_audit` (RLS + GRANT).
- Seed registry from current code.
- Add `useResolvedMenu()` + `applyOverrides()` + `validateMove()` (unit-tested).
- Wire AppSidebar + SystemSettings `SETTINGS_SECTIONS` to the resolver.
- Resolver short-circuits to defaults until a feature flag flips on.
- Ship behind `feature_flags.menu_overrides_enabled = false`. **Zero visible change.**

**Phase 2 — Menu Setting UI**
- Add `Menu Setting` tab below Organization.
- Tree + Edit panel + Preview + Reset + Audit view.
- Phase-2 scope is **L2/L3 within the same module**; L4 rename only (no L4 move).
- Flip flag ON.

**Phase 3 — Report Registry + Report IDs in URLs**
- Create `report_registry`, seed.
- Add `?reportId=…` param handling + optional `/reports/:reportId` alias route → resolves to existing route.
- Surface Report ID in Reports Hub, Report Builder, Report Access, exports.

**Phase 4 — Report Field Sequence tile**
- Create `report_field_sequence` + audit.
- Build tile + Edit Sequence dialog.
- Harden every report's table + Excel/PDF export to consume `useResolvedReportFields(reportId)` (this is the bulk of the work — one report at a time, with regression tests per report).

**Phase 5 — L4 rename/reorder + curated cross-app allowlist**
- Enable L4 moves where `accepts_children = true`.
- Open `is_cross_app_movable` allowlist (initially: Incentive group, Reports). Each entry approved manually.

**Phase 6 — Multi-tenant client scope (when SaaS lands)**
- Add `client_id` scoping UI + RLS by tenant.

## 12. Risks & safeguards

| Risk | Safeguard |
|---|---|
| Admin misorders sidebar → users disoriented | Sticky preview, audit log, one-click "Reset to default", per-item reset. |
| Move breaks a route render | DB trigger + UI mirror validation against route-graph manifest; offending moves rejected before save. |
| Cross-app move grants unintended access | Visibility always = Menu Access ∩ Position. Menu Access untouched. Cross-app allowlist starts empty. |
| Field sequence hides a critical export column | "Hidden" only available on reports that already supported hiding; required fields tagged `is_required=true` in registry and not toggleable. |
| Override layer adds latency | `useResolvedMenu` cached 5 min; `useResolvedReportFields` cached per report. One query per page load max. |
| Report ID change breaks bookmarks | Old `report_key` routes preserved indefinitely; Report ID is **additive**. |
| Backup regression | New tables auto-included via `get_backup_table_order()`; restore drill covers them. |
| Migration ordering / Jan-2026 cutoff | All new schema is **additive** (new tables only), no destructive edits → cutoff rule satisfied. |
| Test debt | Each phase ships with: pure-fn unit tests (`applyOverrides`, `validateMove`, `resolveFields`), component test for the editor, regression test per migrated report. |

## Documentation, Policy, Memory

- `DOCUMENTATION.md` — new sections "Menu Resolver Layer", "Report Registry & ID Contract", "Report Field Sequence Resolver".
- `POLICY.md` — invariants: *menu_key is immutable; cross-app moves require explicit registry flag; Menu Access governs visibility; Report ID is additive, never breaking; field sequence cannot bypass column-level permissions.*
- New memories on apply:
  - `mem://features/admin/menu-setting`
  - `mem://architecture/report-registry-and-ids`
  - `mem://features/admin/report-field-sequence`
- Index entry added in `mem://index.md`.

## What I need from you before Phase 1 build starts

1. **Confirm Phase 1 scope** = AppSidebar + SystemSettings tabs only (Organization sub-tabs and other L4 wait for Phase 5).
2. **Confirm cross-app allowlist** starts empty.
3. **Report ID format** preference: `RPT-PERF-001` (module-prefixed, recommended) vs `RPT-001` (flat).
4. Whether to ship Phase 1 + Phase 2 together (recommended — they are useless apart) or gate Phase 2 behind a separate approval.
