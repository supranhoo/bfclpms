## Assumptions
- "Mapping" = Admin → System Settings → **Report Access** tab (role matrix + user-level overrides).
- Desired behaviour: every report that exists in the app must appear there, even if nobody has configured it yet.

## Verified current state
- `report_access_config` has **18 rows** only.
- `report_registry` has **22 active reports**, including `kpi-status-tracker`, `kpi-scorecard-detail`, `workflow-resolution`, `dev-report`.
- `ReportAccessTab.tsx` renders the role matrix and the override "Report" dropdown **purely from `configs`** (rows of `report_access_config`). Anything without a row is invisible → cannot be mapped.
- `useReportAccess.updateAccess` uses `.update().eq(report_key)`, which is a no-op for a report that has no row — so even if it were rendered, saving would silently do nothing.
- `report_access_config.report_key` has a UNIQUE constraint (upsert-safe).

### Root cause (RCA)
The Report Access screen treats `report_access_config` (a sparse, hand-seeded config table) as the catalogue of reports, instead of `report_registry` (the SSOT). Newer reports shipped after the initial seed were never inserted, so they are unmappable.

5-Why: report not mappable → not listed in UI → UI lists only config rows → config row never created for newer reports → no seeding/backfill step tied to registry additions, and no runtime union with the registry.

## Risk & Impact Report
- **Data**: additive only — inserts missing `report_access_config` rows; no schema change beyond a possible default seed. Rollback = delete the newly inserted keys.
- **Workflow/Permissions**: newly listed reports get **admin-only** defaults (least privilege), so no one gains access implicitly. Existing 18 rows untouched.
- **UI/UX**: one table gains ~5 rows plus an "Unmapped" badge; dropdown gains same entries. No layout change.
- **Regression risk**: low. `canView/canDownload` fallback logic unchanged; once rows exist, DB config wins over `DEFAULT_CONFIGS` (values will be seeded to match the current defaults so behaviour is identical).
- **Scalability**: ~30 rows, negligible.

## Plan

**1. Backfill migration (additive, idempotent)**
Insert into `report_access_config` any `report_registry` report that has no row, seeding `view_roles`/`download_roles` from the existing `DEFAULT_CONFIGS` values (so runtime behaviour is unchanged), `ON CONFLICT (report_key) DO NOTHING`. Covers `kpi-status-tracker`, `kpi-scorecard-detail`, `workflow-resolution`, `dev-report` and any others.
*Verification*: `report_access_config` count == active `report_registry` count.

**2. Registry entries for reports missing from `report_registry`**
`annual-review`, `first-kra-rollout`, `kpi-mapping` exist in code/catalog but not in the registry. Confirm which are real user-facing routes, then add the missing ones to `src/lib/reports/catalog.ts` + registry so they too become mappable.

**3. Make the UI registry-driven (prevents recurrence)**
- New hook/selector that returns the **union** of `report_registry` (active) + `report_access_config` + active `custom_reports`, keyed by `report_key`, with a `isConfigured` flag.
- `ReportAccessTab.tsx` renders that union in both the role matrix and the override dropdown; unconfigured rows show an "Unmapped — using defaults" badge and pre-checked default roles.

**4. Make save create-or-update**
Change `updateAccess` in `useReportAccess.ts` from `.update()` to `.upsert({...}, { onConflict: 'report_key' })` including `report_name`, so saving an unmapped report creates its row.

**5. Guard rail**
Add a small unit test asserting every active `report_registry` key resolves to a row in the union list, so a future report can never become unmappable.

## UI changes
- Location: Admin → System Settings → **Report Access**.
- Role matrix table gains the missing reports (e.g. "KPI Status Tracker") with an amber "Unmapped" badge until saved.
- "Grant Access" → Report dropdown lists the same complete set.
- No responsiveness change (existing `overflow-x-auto` table).

## Tests
- Unit: union builder covers registry-only, config-only, and custom reports; no duplicates.
- Unit: `canView`/`canDownload` unchanged for the 18 pre-existing keys after backfill.
- Manual: map KPI Status Tracker to HR PMS, log in as HR PMS, confirm the report is visible and downloadable per config.

## Docs
- `DOCUMENTATION.md`: ADR-176 — Report Access is registry-driven (union of `report_registry` + config + custom).
- `POLICY.md`: §RPT-ACCESS-REGISTRY-SSOT — every active registry report must be mappable; unmapped defaults to admin-only.
