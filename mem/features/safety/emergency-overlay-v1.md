---
name: Safety Emergency Overlay v1
description: Phase 5 + Phase 8 flag-gated emergency FAB and contact sheet on /safety/* routes (reads typed safety_emergency_contacts table)
type: feature
---

# Phase 5 + 8 — Emergency Overlay (UI-only)

- **Flag:** `safety_settings.ui_emergency_overlay_v1` (boolean JSONB row). Default `false` in prod.
- **Contacts source (Phase 8 SSOT):** `public.safety_emergency_contacts` table, read via `useEmergencyContacts({ type: 'all', activeOnly: true })`. The legacy `safety_settings.emergency_contacts` JSONB row is **deleted and deprecated** — do not reintroduce.
- **Admin surface:** `/safety/emergency/contacts` (full CRUD via `useSafetyEmergency` hooks). Already linked from `SafetySettings.tsx` admin index.
- **Mount:** `<EmergencyFab />` lives inside `SafetyLayout` → `SidebarInset`. Gating is inside the FAB itself.
- **Components:**
  - `src/components/safety/EmergencyFab.tsx` — fixed bottom-right `destructive` 56 px circular Button. Hidden when flag OFF. `prefers-reduced-motion` aware.
  - `src/components/safety/EmergencyOverlay.tsx` — Radix `Sheet` (bottom on mobile, top-right card on `sm+`). Renders name, role_title, contact_type badge, primary phone (`tel:`), optional alt phone (`tel:`), optional email (`mailto:`). Primary destructive CTA → `navigate('/safety/incidents/new')`. Empty state deep-links to `/safety/emergency/contacts`.
- **Hard rule:** ZERO writers, RPCs, uploads, queue mutators, notifications, or `fetch()` calls. Enforced by `src/test/safety/emergencyOverlayNoNewWriters.test.ts` (regex guard) which now ALSO forbids `useUpsertEmergencyContact` / `useDeleteEmergencyContact` imports.
- **Reads only:** `useEmergencyContacts` (typed table) + `useSafetySettings` (flag + cross-phase footnote).
- **Rollback:** set `ui_emergency_overlay_v1 = false` in Safety Settings JSON editor.
- **Cross-phase:** When `ui_offline_inspector_v1` is also ON, the overlay shows a footnote pointing users to the header inspector (no duplicate mount).
- **Forbidden edits:** `safetyIncidentSubmit.ts`, `safetyOfflineQueue.ts` mutators, `useSafetyOfflineSync.ts`, `transition_safety_incident` RPC, storage, RLS, routes, or DB schema.
- **Docs:** DOCUMENTATION.md v2.66.13.23 · POLICY.md §Phase5-Safety + §Phase8-Safety.