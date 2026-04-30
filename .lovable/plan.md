
# Inline Edit for Report Tile Name & Description

## Goal
Let admins rename and re-describe **any** report tile (pre-built or custom) directly from the Reports Hub card — without going into the Custom Reports Builder or editing source code. Changes persist for all users.

## UX

- On `/reports`, when the current user is an **admin** (effective role), each tile shows a small pencil icon in the top-right corner of the card header (visible on hover, always visible on mobile/touch).
- Clicking the pencil opens a small **Edit Report Tile** dialog with two fields:
  - **Title** (text input, required, max 80 chars)
  - **Description** (textarea, max 240 chars)
- Buttons: **Reset to default** (clears the override), **Cancel**, **Save**.
- Card click navigation is suppressed when clicking the pencil (stopPropagation).
- Non-admins see no pencil and see whatever override is currently saved (or the default).

## Storage (zero-hardcoding, dynamic config)

Reuse the existing `system_settings` pattern already used by `useReportColumnOverrides` / `useReportDisplayOrder`.

- New setting key: `report_tile_overrides`
- Value (JSON):
  ```json
  {
    "performance": { "title": "Org Performance", "description": "…" },
    "custom_abc-123": { "title": "…", "description": "…" }
  }
  ```
- Keyed by the same `reportKey` already on each `ReportCard` (works for both pre-built keys like `performance` and custom keys like `custom_<uuid>`).
- Empty / missing entry → fall back to the hardcoded default (pre-built) or the DB-stored custom report fields.
- "Reset to default" deletes that key from the JSON object and saves.

## Files

**New**
- `src/hooks/useReportTileOverrides.ts` — mirrors the shape of `useReportColumnOverrides`. Exposes `{ overrides, getOverride(reportKey), saveOverride(reportKey, {title, description}), clearOverride(reportKey), isLoading, isSaving }`.
- `src/components/reports/EditReportTileDialog.tsx` — Radix Dialog with the two fields + Reset / Cancel / Save. Uses `useReportTileOverrides`.

**Edited**
- `src/pages/reports/ReportsHub.tsx`
  - Call `useReportTileOverrides()` once.
  - When mapping `orderedReports`, merge each card with its override: `title = override?.title ?? report.title`, same for `description`.
  - Render a small pencil button in `CardHeader` (admin-only via `useAuth().effectiveRole === 'admin'`), wired to open `EditReportTileDialog` with the report's `reportKey`, current title, current description, and the underlying default values (so "Reset" knows what to fall back to visually).
  - `e.stopPropagation()` on the pencil button to prevent card navigation.

**No edits required** to `useSystemSettings`, custom report DB tables, or the Custom Report Builder — overrides are a thin display layer on top of whatever the source provides.

## Behavior matrix

| Report type    | Title source (priority)                                  | Description source (priority)                                  |
|----------------|----------------------------------------------------------|----------------------------------------------------------------|
| Pre-built      | tile override → hardcoded `reports[].title`              | tile override → hardcoded `reports[].description`              |
| Custom         | tile override → `custom_reports.name` from DB            | tile override → `custom_reports.description` from DB           |

The Custom Reports Builder remains the SSOT for custom report definitions; the tile override only changes what's shown on the Reports Hub card. The actual report page header is unaffected (separate concern, can be added later if requested).

## Risk & Impact

- **Data**: One new JSON entry in `system_settings` (`report_tile_overrides`). No schema changes, no migration. Existing column-override pattern proves the approach.
- **Workflow**: Pure display layer. No effect on report data, RLS, exports, or access checks (`useReportAccess` / `useMenuAccess` still gate visibility on the original `reportKey`).
- **UI/UX**: Pencil is admin-only and visually subtle (ghost icon button). Card click still navigates.
- **Regression**: Overrides fall back cleanly to defaults when missing or malformed JSON — same defensive parsing as `useReportColumnOverrides`. No change to existing tile order logic.
- **Security**: Writing `system_settings` is already admin-gated by existing RLS on that table; the dialog is also gated on the client by effective admin role.

## Tests

- `src/test/reportTileOverrides.test.ts`
  - Default fallback when no override exists.
  - Override applied for a pre-built key.
  - Override applied for a custom key (`custom_<uuid>`).
  - Reset removes only the targeted key, leaves siblings intact.
  - Malformed JSON → falls back to defaults without throwing.

## Out of scope (explicitly)

- Editing icon or color from the tile (admin can still do this via Custom Reports Builder for custom reports; pre-built icons stay).
- Changing the title shown inside the report page itself.
- Per-role / per-user overrides — this is a single global override.
