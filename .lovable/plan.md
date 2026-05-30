# Phase 10 — Safety Analytics v2 (flag-gated)

## Goal
Layer monthly trend chart, BU risk heatmap, and KPI-tile drill-downs on top of the existing Phase 7 analytics dashboard, without touching the live UI until an admin flips the flag.

## Flag
`safety_settings.ui_safety_analytics_v2` (boolean JSONB, default `false`).

## Risk & Impact
- **Data:** One new read-only MV (`mv_safety_incident_monthly_trend`). Derived from `safety_incidents` (already in backup, RLS-protected). MVs themselves are aggregate-only, granted `SELECT` to `authenticated`.
- **Workflow / writes:** None. Zero new writers, RPCs, uploads, or realtime subscriptions in Phase 10 code paths.
- **UI/UX:** Additive only. Phase 7 layout untouched. v2 tiles become clickable when flag is on; new chart+heatmap render between KPI tiles and the existing BU table.
- **Regression risk:** Low. New helpers covered by 8 unit tests; existing analytics test updated for the extended payload type. All 179 safety tests green.
- **Scalability:** MV stays bounded (12 months × N BUs). Drill-down dialog caps screen at 100 rows from the already-cached incidents query.
- **Mitigation:** Pure helpers in `safetyAnalytics.ts`. Refresh function extended with one more `REFRESH CONCURRENTLY` call — same RPC, same security check.

## Delivered
1. Migration: `mv_safety_incident_monthly_trend` + `refresh_safety_analytics()` extension + seed flag row.
2. SSOT helpers `aggregateMonthlyTrend`, `monthLabel`, `heatmapIntensity` (+ `MonthlyTrendRow` type).
3. Hook `useSafetyAnalytics` fetches the new MV; payload type extended.
4. UI: `SafetyTrendChart`, `SafetyHeatmap`, `KpiDrillDownDialog`.
5. Page: clickable KPI tiles + v2 sections rendered behind the flag.
6. Tests: 8 new in `safetyAnalyticsV2.test.ts`; payload fixture in `safetyAnalytics.test.ts` extended.
7. Docs: DOCUMENTATION.md → v2.66.13.25; POLICY §Phase10-Safety; `mem/features/safety/analytics-v2.md`.

## Enabling
Set `ui_safety_analytics_v2 = true` via the Safety Settings JSON editor, click Refresh on the analytics page.

---

# Phase 8 — Wire Emergency Overlay to the Real Contacts Table (SSOT Reconciliation)

## Assumptions
- Phase 5 shipped `EmergencyOverlay` reading from `safety_settings.emergency_contacts` (free-form JSON).
- A full domain table `public.safety_emergency_contacts` already exists with typed fields (`name`, `role_title`, `phone_primary`, `phone_alt`, `email`, `contact_type`, `is_active`) and a working admin page at `/safety/emergency/contacts` powered by `useSafetyEmergency` hooks.
- We currently have **two parallel sources of truth** for emergency contacts — a clear SSOT violation per project policy.

## Clarification (resolved by inspection)
Rather than building a new JSON editor in `SafetySettings`, the correct move is to retire the JSON setting and point the overlay at the existing table. Building a second editor would entrench the duplication.

## Risk & Impact Report
- **Data Impact:** No schema changes. We delete one row in `safety_settings` (`key='emergency_contacts'`). The `safety_emergency_contacts` table is unchanged; its existing RLS/grants continue to govern access.
- **Workflow Impact:** Admins manage contacts only via `/safety/emergency/contacts` (already live). Overlay now shows live, structured contacts (primary + alt phone, role, type) instead of JSON-shaped objects.
- **UI/UX:** Overlay surface stays identical (Sheet, FAB trigger, CTA). Per-row layout gains alt-phone link and contact-type badge. Adds a discoverable link card on `/safety/settings` pointing to the contacts admin page. FAB still gated by `ui_emergency_overlay_v1`.
- **Regression Risk:** Low. Single component swaps data source. No new writers, no new RPCs, no schema/RLS change. Existing `emergencyOverlayNoNewWriters` governance test continues to apply.
- **Scalability:** `useEmergencyContacts({ type: 'all', active: true })` is bounded by the existing hook; small dataset (tens of rows). No pagination needed.
- **Mitigation:** Keep the overlay UI-only (read via existing hook, no new writers). Update governance test allowlist so reading `useSafetyEmergency` is permitted but the overlay still cannot import the upsert/delete hooks.

## Step-by-Step Plan
1. **Swap data source in `EmergencyOverlay.tsx`**
   - Replace `useSafetySettings()` lookup of `emergency_contacts` with `useEmergencyContacts({ type: 'all' })` filtered to `is_active === true`.
   - Render `phone_primary` as the main `tel:` action; render `phone_alt` as a secondary link when present.
   - Show `contact_type` as a small badge; show `role_title` as the subtitle.
   - Keep empty-state copy but link the message to `/safety/emergency/contacts` for admins.
   - Verification: load `/safety` with FAB enabled → Sheet shows live contacts from the table.

2. **Add a "Manage emergency contacts" link card on `SafetySettings.tsx`**
   - Small `Card` with `Phone` icon + `Button asChild` linking to `/safety/emergency/contacts`. Pure navigation, no new logic.
   - Verification: visible at `/safety/settings`; click navigates to the existing admin page.

3. **Retire the duplicate JSON setting**
   - Delete the row `safety_settings WHERE key='emergency_contacts'`.
   - Keep `ui_emergency_overlay_v1` (still the overlay feature flag).
   - Verification: `select * from safety_settings where key='emergency_contacts'` returns 0 rows; overlay still renders contacts from the table.

4. **Refresh governance test `emergencyOverlayNoNewWriters.test.ts`**
   - Allow `useEmergencyContacts` (read hook) imports in `EmergencyOverlay.tsx`; explicitly forbid `useUpsertEmergencyContact` and `useDeleteEmergencyContact` to keep the overlay read-only.
   - Verification: `bunx vitest run src/test/safety/` → all green.

5. **Documentation & policy sync**
   - `DOCUMENTATION.md`: bump version, note Phase 8 reconciliation and the SSOT decision.
   - `POLICY.md` §Phase5-Safety: amend to state that emergency contacts live in `safety_emergency_contacts` and are managed at `/safety/emergency/contacts`; the JSON setting is deprecated.
   - `mem/features/safety/emergency-overlay-v1.md`: update to reflect new data source.
   - `mem/index.md`: no new entry needed; existing one stays.

## UI Changes
- **Where:** `/safety/*` (FAB → Sheet) and `/safety/settings` (new link card).
- **What visually changes:**
  - Overlay rows now display: bold name, subtle role+type, primary phone link (tap-to-call), optional alt phone link, optional email link. Empty-state copy links to the admin page.
  - Settings page gains a single new card "Emergency contacts" with a "Manage" button.
- **Interaction:** Tap FAB → Sheet opens → tap phone → native dialer; tap "Report incident now" → `/safety/incidents/new` (unchanged).
- **Responsive:** Sheet keeps bottom-anchored mobile / right-anchored desktop behavior; 44px min touch targets preserved.

## Technical Notes
- Files touched:
  - `src/components/safety/EmergencyOverlay.tsx` (rewrite data source, ~30 LOC delta)
  - `src/pages/safety/SafetySettings.tsx` (add one card)
  - `src/test/safety/emergencyOverlayNoNewWriters.test.ts` (update allow/deny lists)
  - `DOCUMENTATION.md`, `POLICY.md`, `mem/features/safety/emergency-overlay-v1.md`
- Data op (one row delete) executed via the data-change tool, not a migration.
- Zero new writers, RPCs, edge functions, or schemas.

## Rollback Strategy
- Revert the four code files. The deleted `safety_settings.emergency_contacts` row can be re-inserted with an empty `[]` value if any consumer is later discovered; no destructive schema change to undo.

## Decision Justification
- **Chosen:** Point overlay at `safety_emergency_contacts`. Honors SSOT, reuses existing typed schema/RLS, admin page already exists.
- **Rejected:** Build a JSON contacts editor inside `SafetySettings`. Would entrench two sources of truth, duplicate validation logic, and bypass the typed table's RLS structure.
- **Rejected:** Migrate `safety_emergency_contacts` rows into `safety_settings`. Loses typing, RLS granularity, and the working admin UI.

## Post-Implementation Notes
- After approval and execution, run the safety test suite and verify the overlay on `/safety/home` (FAB visible once flag is on). The Settings link card should be visible regardless of the flag.
