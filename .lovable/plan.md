# Phase 5 — Emergency Overlay

Flag-gated, UI-only overlay surfacing emergency contacts and one-tap "Report incident" entry from any Safety route. Consistent with Phase 3/4 governance: no schema changes, no new writers, no RLS or RPC edits.

## Risk & Impact

- **Data:** None. Reads existing `safety_settings` only. No table or column additions.
- **Workflow:** None. Overlay routes user into existing `/safety/incidents/new` flow.
- **UI/UX:** New floating action button (FAB) on `/safety/*` routes when flag ON. Flag OFF → pixel-identical to today.
- **Regression:** Low. Isolated to a single mount point in `SafetyLayout`. Guarded by new no-writers test.
- **Scalability:** Negligible — one settings row read, cached.
- **Rollback:** Set `ui_emergency_overlay_v1 = false` in `safety_settings`.

## Flag

- `ui_emergency_overlay_v1` (boolean, default `false`) — added as a row in `public.safety_settings` via `supabase--insert` (no migration, no dead column — same shape as `ui_offline_inspector_v1`).
- `emergency_contacts` (JSON row in `safety_settings`) — admin-editable list of `{ label, phone, role }`. Empty array by default; overlay hides contacts section gracefully when empty.

## Scope

**New files**
- `src/components/safety/EmergencyOverlay.tsx` — Radix `Sheet` (bottom on mobile, right on desktop) with: emergency contacts list (tel: links), "Report incident now" CTA → `navigate('/safety/incidents/new')`, "Offline queue" shortcut (reuses Phase 4 inspector when its flag is also ON).
- `src/components/safety/EmergencyFab.tsx` — fixed-position FAB trigger; respects `prefers-reduced-motion`; min 44px touch target.
- `src/test/safety/emergencyOverlayNoNewWriters.test.ts` — regex guard mirroring Phase 3/4 pattern.
- `src/test/safety/emergencyOverlay.test.tsx` — render, flag-off invisibility, contact tap, CTA navigation.

**Edited files**
- `src/components/safety/SafetyLayout.tsx` (or equivalent route shell) — mount `<EmergencyFab />` gated by flag.
- `DOCUMENTATION.md` — v2.66.13.22 entry.
- `POLICY.md` — §Phase5-Safety.
- `mem/index.md` + new `mem/features/safety/emergency-overlay-v1.md`.

**Forbidden (Phase 5 hard limits)**
- No edits to incident submit, queue mutators, RLS, RPCs, storage, or routes.
- No new DB tables, columns, triggers, or functions.
- No edits to `safetyIncidentSubmit.ts`, `safetyOfflineQueue.ts` mutation paths, `useSafetyOfflineSync.ts`.
- No notification dispatch, SMS, or external API integration (read-only `tel:` links only).

## Steps

1. **Flag insert** — `supabase--insert` adds `ui_emergency_overlay_v1=false` and `emergency_contacts=[]` rows to `safety_settings`. Verify via existing settings hook. *(Verification: row visible in Safety Settings JSON editor.)*
2. **Build `EmergencyOverlay` + `EmergencyFab`** — pure presentational, reads settings via existing hook, no new fetchers. *(Verification: Storybook-style render in test.)*
3. **Mount in `SafetyLayout`** behind flag. *(Verification: flag OFF → DOM unchanged snapshot.)*
4. **Guard test** — `emergencyOverlayNoNewWriters.test.ts` greps Phase 5 files for `insert(`, `update(`, `upsert(`, `delete(`, `.rpc(`, `.upload(`. *(Verification: green.)*
5. **Docs + memory** — atomic update with code.
6. **Default OFF in prod** until safety-head sign-off. Toggle ON via existing Settings JSON editor; no redeploy.

## UI Changes

- **Location:** Bottom-right FAB on all `/safety/*` routes (offset above bottom nav on mobile).
- **Trigger:** Tap opens Sheet (bottom on `<md`, right on `≥md`).
- **Contents:** Header "Emergency", contacts list (label + `tel:` link), divider, primary CTA "Report incident now", secondary "View offline queue" (only if Phase 4 flag ON).
- **Interaction:** Esc / outside-click closes. Reduced-motion respected. No backdrop blur on low-power hint.
- **Responsive:** 44px+ touch targets; FAB hidden when virtual keyboard open on `/safety/incidents/new` to avoid covering the submit button.

## Tests

- Flag OFF → FAB not rendered (snapshot).
- Flag ON, empty contacts → CTA visible, contacts section hidden.
- Flag ON, with contacts → `tel:` links render with correct `href`.
- CTA click → `navigate('/safety/incidents/new')` called.
- No-new-writers regex guard green.

## Approval Gate

Requires Principal Architect + Safety Lead sign-off per governance §Phase 5. On approval: insert flag row first (default `false`), then ship UI in a single commit. No production toggle without safety-head confirmation.

## Post-Phase Notes

- Phase 6 (Analytics surface) remains gated.
- Schema debt: none added in Phase 5.
- Removal path: delete two settings rows + revert one commit.
