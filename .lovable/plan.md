# Performance & Billing Audit Fixes

Implements the 6 fixes from the audit in one pass. All visible UI and Supabase query logic stay identical; the changes target redundant intervals, duplicate hook instances, and over-broad realtime subscriptions.

## Risk & Impact Report

- **Data impact:** None. No schema, query, RLS, or payload changes. Only call frequency and subscription scope change.
- **Workflow impact:** None. Offline queue, training read-time gating, notifications, compression panel, and Safety realtime behavior remain functionally identical.
- **UI impact:** None visible. The SafetyTraining seconds counter still ticks every 1s — the tick is just moved into a tiny child component so the parent page no longer re-renders.
- **Regression risk:** Medium for FIX 1 (offline sync singleton) and FIX 2 (Safety realtime scoping) because they touch shell-level wiring. Mitigated by keeping the same hook surface (`useSafetyOfflineSync()` continues to return the same shape, just delegating to context).
- **Mitigation:** Existing vitest suites in `src/components/admin` and `src/hooks` must continue to pass; do not touch `useRealtimeKpiSync` or `useProfilesVersion`.

## Implementation Plan

### FIX 1 — Singleton `useSafetyOfflineSync` via context

1. Create `src/contexts/SafetyOfflineSyncContext.tsx`:
   - Rename the existing implementation in `src/hooks/useSafetyOfflineSync.ts` to an internal `useSafetyOfflineSyncInternal()` (keep all logic — listeners, 15s interval, `flushInternal`, `flushNow`, `flushOne`).
   - Provider calls `useSafetyOfflineSyncInternal()` once and exposes the result via context.
   - Export a thin consumer `useSafetyOfflineSync()` that reads the context (throws a friendly error if used outside the provider). Return shape unchanged: `{ pendingCount, isSyncing, isOnline, flushNow, flushOne, refreshCount }`.
2. Mount `<SafetyOfflineSyncProvider>` inside `SafetyLayout` (wrapping `SafetyModuleRoute` children) so it runs once for the whole Safety shell.
3. `src/hooks/useSafetyOfflineSync.ts` becomes a re-export of the context consumer to keep all 3 call sites working without import changes.
4. Verify only one `setInterval(refreshCount, 15_000)` and one set of online/offline listeners are registered.

### FIX 2 — Per-page Safety realtime scoping

1. Change signature to `useSafetyRealtimeSync(enabled: boolean = true, tables?: SafetyRealtimeTable[])` where `SafetyRealtimeTable` is a string union of the 20 supported table names.
2. Inside the hook, build the subscription chain dynamically: iterate a constant array of `{ table, group, filter? }` descriptors and call `.on('postgres_changes', …)` only for tables included in `tables` (or all when `tables` is undefined).
3. Leave existing call in `SafetyLayout.tsx` as `useSafetyRealtimeSync()` (full 20-table set) for the dashboard route only — but the dashboard is the default landing, so move the call out of `SafetyLayout` and into the actual `SafetyDashboard` page. The layout itself stops subscribing.
4. Add the scoped call in each list/detail page that currently relies on shell-level invalidation:
   - `SafetyIncidentList`: `['safety_incidents', 'safety_incident_status_history']`
   - `SafetyIncidentDetail`: `['safety_incidents','safety_incident_status_history','safety_incident_evidence','safety_incident_progress_log']`
   - `SafetyPermits`: `['safety_permits','safety_permit_approvals']`
   - `SafetyAssets`: `['safety_assets','safety_asset_calibrations','safety_asset_evidence']`
   - `SafetyTraining`: `['safety_training_assignments','safety_training_attempts']`
   - `SafetyAudits`: `['safety_audit_runs','safety_audit_run_responses','safety_audit_templates','safety_audit_template_items']`
   - `SafetyEmergency`: `['safety_emergency_drills','safety_drill_participants','safety_drill_findings','safety_emergency_contacts']`
   - SLA / notifications consumers: `['safety_sla_escalations']` / `['safety_notifications']`
5. Keep `removeChannel(channel)` cleanup intact (it already exists).

### FIX 3 — `ServerCompressionPanel` polling

1. In `useCompressionStats` (inside `src/components/admin/ServerCompressionPanel.tsx`), change `refetchInterval: 30_000` → `refetchInterval: 120_000`.
2. Add a small "Refresh" button (existing `Button` + `RefreshCw` icon already imported in admin panels — reuse design tokens) next to the queue status section that calls `query.refetch()`. Disable while `query.isFetching`.

### FIX 4 — `useOpenQueryCount`

1. In `src/hooks/useOpenQueryCount.ts` remove the `refetchOnWindowFocus: true` line. Keep `refetchInterval: 120_000`.

### FIX 5 — `useUnreadNotificationCount`

1. In `src/hooks/useNotifications.ts`, remove `refetchInterval: 120_000` and `refetchOnWindowFocus: true` from `useUnreadNotificationCount`. Add a brief comment noting that `useNotifications` already invalidates this key from its Realtime subscription, so polling is redundant.

### FIX 6 — `SafetyTraining` 1s tick isolation

The label `Reading time: {readSeconds}s / {minRead}s required` and the progress bar driven by `readPct` are visible UI. Removing `readSeconds` entirely would freeze that display, which violates the "do not change UI visuals" constraint.

Plan instead:

1. Extract a tiny presentational component `ReadingTimer` in the same file that owns its own `useState` + `setInterval` ticking every 1s and a `startTimeRef = useRef(Date.now())` that resets on phase change (via prop).
2. `ReadingTimer` renders only the seconds label + the progress bar. The parent `SafetyTraining` no longer holds `readSeconds` state, so the parent re-render cascade is eliminated — only this leaf re-renders each second.
3. The gating check that previously read `readSeconds >= minRead` becomes a `ref`-based check the parent reads on submit: `Math.floor((Date.now() - startTimeRef.current) / 1000) >= minRead`. The `startTimeRef` is hoisted to the parent and passed to `ReadingTimer` so both share the same anchor.
4. Phase changes call `startTimeRef.current = Date.now()` to reset the timer (matches current behavior).

Net effect: heavy parent (~410-line component) stops re-rendering every second; only the small label sub-component does. The user sees the exact same ticking counter.

## Files Touched

```text
src/contexts/SafetyOfflineSyncContext.tsx     [NEW]
src/hooks/useSafetyOfflineSync.ts             [refactor → context consumer]
src/hooks/useSafetyRealtimeSync.ts            [add tables param + dynamic chain]
src/components/safety/SafetyLayout.tsx        [mount provider, remove default realtime call]
src/pages/safety/SafetyDashboard.tsx          [add full-set realtime call]
src/pages/safety/SafetyIncidentList.tsx       [scoped realtime call]
src/pages/safety/SafetyIncidentDetail.tsx     [scoped realtime call]
src/pages/safety/SafetyPermits.tsx            [scoped realtime call]
src/pages/safety/SafetyAssets.tsx             [scoped realtime call]
src/pages/safety/SafetyAudits.tsx             [scoped realtime call]
src/pages/safety/SafetyEmergency.tsx          [scoped realtime call]
src/pages/safety/SafetyTraining.tsx           [scoped realtime call + ReadingTimer extraction]
src/components/admin/ServerCompressionPanel.tsx  [120s interval + manual Refresh button]
src/hooks/useOpenQueryCount.ts                [drop refetchOnWindowFocus]
src/hooks/useNotifications.ts                 [drop refetch fields on count hook]
```

(If any of the listed Safety pages don't currently exist or use a different filename, the scoped realtime call will go into the closest equivalent list/detail component — confirmed during build.)

## Verification

- `bunx vitest run src/hooks src/components/admin` must stay green.
- Grep `setInterval` under `src/components/safety` + `src/pages/safety` + `src/contexts/SafetyOfflineSyncContext.tsx` → expect exactly 1 occurrence (offline sync 15s).
- Grep `useSafetyRealtimeSync(` → expect one full-set call (dashboard) and N scoped calls on individual pages; no call at layout level.
- Manual smoke: navigate Safety pages, confirm bell + offline badge + training timer + compression panel still behave as before.

## Out of Scope

- No changes to `useRealtimeKpiSync`, `useProfilesVersion`, or any non-Safety realtime hook.
- No query shape, filter, RLS, or schema changes.
- No visual redesign of any panel beyond adding the single "Refresh" button to the existing ServerCompressionPanel queue section.
