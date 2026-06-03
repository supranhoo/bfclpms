## Phase 3 Pilot — Single-action enforcement for `pms.data.export`

Introduce enforcement for exactly **one** action, behind three independent kill-switches. All other 12 wrapped actions remain observe-only. No PMS workflow / scoring / RLS / permission / menu / report changes.

### Assumptions
- Pilot is **UI-only**. No backend / RLS / RPC enforcement. A determined developer with DB access can still export — that's accepted for the pilot. The user explicitly said "Do not enforce any backend/RLS policy yet unless specifically approved."
- The only existing `CanAction actionKey="pms.data.export"` is in `src/components/review/EmployeeSelectorGrid.tsx:1923` wrapping the "Export Pending" button. That's the sole surface that becomes enforceable.
- Pilot scope is hard-coded to the single allowlist `['pms.data.export']`. The allowlist lives in code (not DB) so it can never accidentally grow without a code review.
- `event_type='deny'` requires extending the existing `entitlement_audit_event_type_check` CHECK constraint via a new migration. This is additive (does not invalidate any existing row) and reversible.

### Three independent gates (ALL must be true to block)
1. `system_settings.hub_platform_settings_enabled = true` (master switch — existing).
2. `system_settings.hub_enforcement_pilot_enabled = true` (**new** flag, default `false`).
3. `actionKey ∈ ENFORCEMENT_ALLOWLIST = ['pms.data.export']` (code constant).
4. The resolved entitlement for that `actionKey` is `false`.

If any of (1)–(4) is false, behavior is identical to today (children render unchanged; would_deny may still log under conditions 1+4 as it does today).

### Risk & Impact Report
- **Data**: one new `system_settings` row, one schema CHECK update, audit rows with new `event_type='deny'`. Backup is automatic (Core rule). No tables added.
- **Workflow / scoring / RLS / menus / reports**: zero.
- **UI/UX**: a single button ("Export Pending" in the reviewer grid) becomes disabled+tooltip when all four gates trip. Visual treatment: `opacity-60`, `cursor-not-allowed`, transparent click-shield that fires a toast `"This action is disabled by Platform Owner settings."`.
- **Regression**: low — `<CanAction>` continues to be a render-only wrapper; the enforcement branch activates only when the new pilot flag is on AND the action key matches the hard-coded allowlist.
- **Scalability**: nil. One extra `system_settings.maybeSingle()` cached by React Query (10-min staleTime); shares a single query key across all `<CanAction>` mounts.
- **Rollback**: flip `hub_enforcement_pilot_enabled` → `false` (instant, single-row write from Platform Settings UI). Optional belt-and-braces: flip `hub_platform_settings_enabled` → `false` (kills the entire hub).

### Implementation Plan

1. **Migration** (`supabase/migrations/<ts>_phase3_pilot_enforcement.sql`)
   - `ALTER TABLE public.entitlement_audit DROP CONSTRAINT entitlement_audit_event_type_check;`
   - Recreate with `'deny'` added: `ARRAY['grant','revoke','update','would_deny','admin_view','deny']`.
   - `INSERT INTO public.system_settings (setting_key, setting_value) VALUES ('hub_enforcement_pilot_enabled', 'false'::jsonb) ON CONFLICT DO NOTHING;`
   - No GRANT changes (table already granted).
   - No new policies needed: `ent_audit_insert` already permits any insert; `ent_audit_read` still restricts read to admin/platform_owner.

2. **Pure constants + helper** (`src/lib/platformEnforcement.ts`, new)
   - `export const ENFORCEMENT_ALLOWLIST = ['pms.data.export'] as const;`
   - `export function isEnforceable(actionKey: string): boolean`
   - `export function shouldBlock(params: { hubEnabled; pilotEnabled; actionKey; entitled }): boolean`
   - Pure functions → unit-testable.

3. **`useEnforcementPilot()` hook** (extend `src/hooks/useEntitlement.ts` OR new file)
   - React Query for `system_settings.setting_key='hub_enforcement_pilot_enabled'` parsed with the existing `parseFlag` semantics. 10-min staleTime, query key `['hub-enforcement-pilot']`.
   - Returns `{ pilotEnabled: boolean, loading: boolean }`.

4. **`logDeny()`** (extend `src/hooks/useEntitlement.ts`)
   - Mirror of `logWouldDeny` but writes `event_type='deny'`. Same metadata shape (uses `buildWouldDenyMetadata` with `mode: 'enforced'`).
   - Best-effort try/catch — never throw from the render/click path.

5. **`CanAction` enforcement branch** (`src/components/platform/CanAction.tsx`)
   - Reads `pilotEnabled` from the new hook.
   - Computes `blocked = shouldBlock(...)`. When `blocked`:
     - Render disabled-overlay wrapper:
       ```tsx
       <span className="relative inline-block" title={BLOCK_MSG}>
         <span aria-disabled="true" className="opacity-60 pointer-events-none">{children}</span>
         <button
           type="button"
           aria-label={BLOCK_MSG}
           className="absolute inset-0 w-full h-full cursor-not-allowed bg-transparent"
           onClick={(e) => { e.preventDefault(); e.stopPropagation(); toast.error(BLOCK_MSG); }}
         />
       </span>
       ```
     - `BLOCK_MSG = "This action is disabled by Platform Owner settings."`
     - In a separate `useEffect` (deps: blocked, actionKey, snapshot.clientId), call `logDeny(actionKey, 'enforced CanAction render', metadata)` exactly once per mount via a second `deniedLoggedRef`.
   - `would_deny` logging path stays exactly as it is today for all non-enforced actions.
   - When `blocked` flips to false (entitlement re-enabled or kill-switch off), the component re-renders and the original children are restored — confirms instant rollback.

6. **Platform Settings UI** (`src/pages/platform/PlatformSettings.tsx`, OverviewTab)
   - New "Enforcement pilot" card next to the Master switch:
     - Badge: ENABLED / DISABLED
     - `<Switch>` gated to `platform_owner`, disabled when master switch is OFF (with an inline note).
     - Description lists the allowlist (`pms.data.export`) verbatim and the kill-switch instructions.
     - Confirmation dialog when turning ON (matches the existing `confirmOff` pattern, but for the opt-in direction): "Enabling will start blocking pms.data.export for users whose entitlement is OFF. You can disable instantly."
     - On toggle: upsert `system_settings` row + insert `entitlement_audit` row (`event_type='update'`, `entity_key='hub_enforcement_pilot_enabled'`, before/after JSON).
   - Telemetry tab: add `'deny'` to `AUDIT_EVENT_TYPES` (already shows in Audit Logs filter) and to the events list — render with a destructive badge. CSV unchanged shape.

7. **Tests** (`src/test/platformEnforcement.test.ts`, new)
   - `isEnforceable('pms.data.export')` → true; everything else → false (spot-check `pms.users.edit`, `pms.kra.assign`).
   - `shouldBlock` truth table covers all 6 user scenarios:
     1. master OFF → never block.
     2. master ON, pilot OFF, entitlement OFF → never block.
     3. master ON, pilot ON, entitlement ON → never block.
     4. master ON, pilot ON, entitlement OFF, action=`pms.data.export` → block.
     5. master ON, pilot ON, entitlement OFF, action=any-other → never block.
     6. master ON, pilot ON → entitlement re-enabled → never block (rollback).
   - Snapshot the `BLOCK_MSG` constant so it cannot drift silently.

8. **Documentation & Memory**
   - `DOCUMENTATION.md` — Version `v2.66.18.0` entry.
   - `POLICY.md` — extend §Phase20 with §Phase21-EnforcementPilot section listing the 4 gates and the allowlist.
   - `CHANGELOG_2026.md` — row under W1 Jun 1–7.
   - `mem://features/platform/hub-foundation.md` — "Phase 3 pilot (shipped)" section.
   - Add a new index entry: `mem://features/platform/enforcement-pilot` capturing the 4-gate invariant + allowlist + rollback procedure. Update `mem://index.md`.

### Acceptance Matrix (manual)
| Master | Pilot | Entitlement | Action | Expected |
|---|---|---|---|---|
| OFF | × | × | export | works, no deny audit |
| ON  | OFF | OFF | export | works, would_deny logged |
| ON  | ON  | ON  | export | works, no deny |
| ON  | ON  | OFF | export | **blocked**, toast + deny audit |
| ON  | ON  | OFF | any other | works (observe-only still logs would_deny) |
| flip Pilot OFF | – | OFF | export | works immediately on next render |

### Out of Scope (explicit)
- No backend / RPC / RLS enforcement.
- No enforcement on `pms.users.*`, `pms.kra.assign`, `pms.workflow.*`, `pms.menu.*`, `pms.data.import`, `pms.reports.performance.export`.
- No new `CanAction` wrappers anywhere.
- No PMS workflow, scoring, menu, reports, RLS, permission changes.

### Files to create / edit
- New: `supabase/migrations/<ts>_phase3_pilot_enforcement.sql`
- New: `src/lib/platformEnforcement.ts`
- New: `src/test/platformEnforcement.test.ts`
- New: `mem/features/platform/enforcement-pilot.md`
- Edit: `src/hooks/useEntitlement.ts` (`useEnforcementPilot`, `logDeny`)
- Edit: `src/components/platform/CanAction.tsx` (enforcement branch + disabled overlay)
- Edit: `src/pages/platform/PlatformSettings.tsx` (Overview pilot card + Telemetry `'deny'` badge)
- Edit: `DOCUMENTATION.md`, `POLICY.md`, `CHANGELOG_2026.md`, `mem/index.md`, `mem/features/platform/hub-foundation.md`
