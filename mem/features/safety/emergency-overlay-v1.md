---
name: Safety Emergency Overlay v1
description: Phase 5 flag-gated emergency FAB and contact sheet on /safety/* routes
type: feature
---

# Phase 5 — Emergency Overlay (UI-only)

- **Flag:** `safety_settings.ui_emergency_overlay_v1` (boolean JSONB row). Default `false` in prod.
- **Contacts source:** `safety_settings.emergency_contacts` JSONB array `[{label, phone, role?}]`.
- **Mount:** `<EmergencyFab />` lives inside `SafetyLayout` → `SidebarInset`. Gating is inside the FAB itself.
- **Components:**
  - `src/components/safety/EmergencyFab.tsx` — fixed bottom-right `destructive` 56 px circular Button. Hidden when flag OFF. `prefers-reduced-motion` aware.
  - `src/components/safety/EmergencyOverlay.tsx` — Radix `Sheet` (bottom on mobile, top-right card on `sm+`). `tel:` anchors with whitespace stripped, primary destructive CTA → `navigate('/safety/incidents/new')`.
- **Hard rule:** ZERO writers, RPCs, uploads, queue mutators, notifications, or `fetch()` calls. Enforced by `src/test/safety/emergencyOverlayNoNewWriters.test.ts` (regex guard, same pattern as Phase 3/4).
- **Reads only:** existing `useSafetySettings()` hook — no new query.
- **Rollback:** set `ui_emergency_overlay_v1 = false` in Safety Settings JSON editor.
- **Cross-phase:** When `ui_offline_inspector_v1` is also ON, the overlay shows a footnote pointing users to the header inspector (no duplicate mount).
- **Forbidden edits:** `safetyIncidentSubmit.ts`, `safetyOfflineQueue.ts` mutators, `useSafetyOfflineSync.ts`, `transition_safety_incident` RPC, storage, RLS, routes, or DB schema.
- **Docs:** DOCUMENTATION.md v2.66.13.22 · POLICY.md §Phase5-Safety.