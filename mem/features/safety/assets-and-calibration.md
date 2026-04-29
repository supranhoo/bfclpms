---
name: Safety Assets & Calibration
description: Phase 4 asset register, calibration RPC + history, T-7/T-1/overdue daily sweep, and PTW expiry block.
type: feature
---

# Safety Assets & Calibration (Phase 4)

## Tables
- `safety_assets` — register; unique `asset_code`; `calibration_required`
  (bool) and `calibration_interval_days` (1..3650) drive the sweep.
  `last_calibration_at` and `calibration_expires_at` are derived columns
  written **only** by `record_calibration`.
- `safety_asset_calibrations` — append-only history, one row per event,
  `next_due_at > performed_at` enforced by CHECK.
- `safety_asset_evidence` — photos / manuals / certificates;
  `kind ∈ {photo, manual, certificate, other}`.

## Lifecycle
- Asset status enum `safety_asset_status`: `active | under_maintenance | retired`.
- Direct UPDATE of `last_calibration_at` / `calibration_expires_at` is
  permitted by RLS but should always go through `record_calibration` so
  the history row, asset row, and audit log stay aligned.

## RPCs (envelope `{ ok, error?, …}`)
- `record_calibration(asset_id, performed_at, next_due_at, certificate_url?, notes?, performed_by_name?)`
  - SECURITY DEFINER; admin / safety_head / safety_officer only.
  - Validates window (`next_due_at > performed_at`, no future `performed_at`)
    and that the asset is `calibration_required`.
  - Inserts history + updates asset + writes `asset.calibration_recorded`
    audit log row in one tx.
- `mark_overdue_assets()` — counts T-7, T-1, overdue assets (idempotent;
  used by the daily sweep edge function).

## Daily sweep
- Edge function `asset-calibration-sweep` (calls RPC + best-effort
  `safety_notifications` rows per asset×bucket, deduped via `dedupe_key`).
- Cron `asset-calibration-sweep-daily` runs at **06:30 UTC** (job 16).

## PTW link
`activate_permit` (Phase 2) refuses with
`error: 'asset_expired:<uuid>'` when any linked asset has
`calibration_expires_at < now()`. The check is gated by an
`information_schema` probe so it stays a soft dependency.

## RLS
- Read: admin / safety_head / safety_officer / auditor see everything;
  manager / bu_head / supervisor scoped to their `business_unit_id`.
- Write (assets, calibrations, evidence): admin / safety_head / safety_officer.

## SSOT (frontend)
- `src/lib/safetyAssets.ts` — enums, labels, `daysUntilExpiry`,
  `calibrationBucket`, `validateAssetDraft`, `validateCalibrationDraft`,
  `computeNextDueAt`. UI **must** import labels from here.
- `src/hooks/useSafetyAssets.ts` — list/detail/history/evidence queries +
  `useCreateAsset`, `useUpdateAsset`, `useRecordCalibration`,
  `useDeleteAsset`. All mutations invalidate `['safety','assets']`.
- `src/components/safety/AssetCalibrationBadge.tsx` — bucket badge.

## Pages
- `/safety/assets` — register with status / bucket / search filters and
  4-tile counters (ok / t7 / t1 / overdue).
- `/safety/assets/new` — registration form (code, name, category, status,
  details, calibration toggle + interval, notes).
- `/safety/assets/:id` — metadata, calibration history, and the
  `record_calibration` form (auto-suggests next_due_at from interval).

## Realtime
`useSafetyRealtimeSync` invalidates the `assets` group on changes to
`safety_assets`, `safety_asset_calibrations`, `safety_asset_evidence`.

## Tests
`src/test/safetyAssets.test.ts` — 23 logic tests covering enum integrity,
`daysUntilExpiry`, `calibrationBucket`, `validateAssetDraft`,
`validateCalibrationDraft`, and `computeNextDueAt`.