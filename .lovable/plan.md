## 1. Assumptions

- No schema change needed: `entitlement_audit.after` is `jsonb` and currently `NULL` on every `would_deny` row — we'll reuse it as the metadata bucket. Keeps it backward compatible, no migration, no RLS changes.
- `reason` becomes a fixed string `observe-mode CanAction render` (unchanged for existing rows; future rows match the same constant).
- Snapshot reads (`clientId`) are already available in `useEntitlement()` — `CanAction` will pass them down to the logger so no extra DB roundtrip.
- `module_key` per action is derivable from `action_registry`; the dashboard already loads this map, so we won't duplicate the join in the writer. The metadata captured at write time stays UI-only.
- Old rows without `after` metadata remain valid; the dashboard renders `—` for Page when absent.

## 2. Clarifications

- **Query string safety:** capture `location.search` only when it does not match a deny-list of sensitive keys (`token`, `access_token`, `refresh_token`, `code`, `apikey`, `api_key`, `password`, `secret`, `id_token`, `key`, `signature`). On match → strip just those keys; if anything was redacted, store `search: "[redacted]"` (no partial leakage). Also truncate pathname/search to 256 chars to avoid jumbo rows.
- **Metadata shape** (stored in `entitlement_audit.after`):
  ```json
  {
    "pathname": "/dashboard",
    "search": "?view=team",
    "source": "CanAction",
    "mode": "observe_only",
    "client_id": "<uuid|null>",
    "action_key": "pms.users.edit",
    "captured_at": "2026-06-03T20:40:00.000Z"
  }
  ```
  (`actor_id`, `entity_key`, `created_at`, `event_type` already live as first-class columns — not duplicated except `action_key` for self-contained JSON consumers.)

## 3. Risk & Impact Report

- **Data impact:** writes one extra small JSON blob per `would_deny` row in `after`. No new tables, no migration.
- **Workflow / scoring / menus / reports / RLS / permissions:** zero changes.
- **UI/UX:** Telemetry tab gains one column `Page` and one CSV column `pathname`. No other UI changes.
- **Regression risk:** Very low — only `logWouldDeny` and `CanAction` props change; existing call sites continue to work (new args are optional).
- **Scalability:** Metadata payload is bounded (<512 B/row after truncation) → no impact on existing query plans or storage growth.
- **Privacy:** Redaction list above prevents accidental token leakage. Pathname itself may include UUIDs (e.g. `/reviews/<id>`); we accept that since it mirrors what the user already sees in their address bar and is already inside the `platform_owner`-only audit table.

## 4. Step-by-step Plan

1. **`src/lib/platformTelemetryMeta.ts` (new)** — pure helpers, fully unit-testable:
   - `SENSITIVE_QS_KEYS: readonly string[]`.
   - `sanitizeSearch(search: string): string` — parse, drop sensitive keys, return `"[redacted]"` if any dropped, else cleaned `?…` string, else `""`.
   - `truncate(s: string, max = 256): string`.
   - `buildWouldDenyMetadata(input: { actionKey; clientId; pathname; search; source? }): Record<string, unknown>` — assembles the JSON shape above.
2. **`src/hooks/useEntitlement.ts`** — extend `logWouldDeny` signature:
   ```ts
   logWouldDeny(actionKey, reason?, metadata?: Record<string, unknown>)
   ```
   When `metadata` is provided, insert it into the `after` column. Keep `reason` text fixed when called from `CanAction`. No throw, no behavior change for callers omitting `metadata`.
3. **`src/components/platform/CanAction.tsx`** — in the same `useEffect` that fires once per mount:
   - Read `pathname` + `search` from `window.location` (guarded for SSR/test env via `typeof window !== 'undefined'`).
   - Read `clientId` from `useEntitlement().snapshot.clientId`.
   - Call `buildWouldDenyMetadata({...})` and pass to `logWouldDeny(actionKey, 'observe-mode CanAction render', metadata)`.
   - `loggedRef` semantics unchanged → still once per mount.
4. **`src/pages/platform/PlatformSettings.tsx` — TelemetryTab**:
   - Add a `Page` column to the Recent events table (renders `r.after?.pathname` truncated with full path on hover via `<span title>`); when missing, render `—`.
   - Include `pathname` and `search` in the CSV export.
   - Reuse the existing `WouldDenyRow` type with an optional `after?: Record<string, unknown> | null` field.
5. **Tests** (`src/test/platformTelemetryMeta.test.ts`):
   - `sanitizeSearch` strips each sensitive key, preserves benign keys, handles empty/undefined.
   - `buildWouldDenyMetadata` shape, truncation at 256, `mode === 'observe_only'`.
6. **Docs/Memory/Changelog:**
   - `DOCUMENTATION.md` — Version History entry `v2.66.16.0`: route/page capture, sanitization, no schema change.
   - `POLICY.md` — append to §Phase20: metadata invariants, sensitive-key list, observe-only contract preserved.
   - `mem/features/platform/hub-foundation.md` — one-line addition under Phase 2C: "Route/page metadata captured in `entitlement_audit.after`; pathname displayed in Telemetry tab."
   - `CHANGELOG_2026.md` — sub-bullet under Hub Platform.
7. **Manual verification:** load any wrapped surface with master switch ON + that action disabled, then inspect the latest `entitlement_audit` row: `after.pathname` matches the route, `after.search` is sanitized; verify the Page column shows up in the Telemetry tab.

## 5. UI Changes

- **Location:** `/platform-settings` → `Telemetry` tab → Recent events table.
- **Visual change:** one new column **Page** between "Action" and "Risk"; small text, truncated with tooltip showing full path. CSV gains `pathname` and `search` columns.
- **Interaction:** no new interactions. Old rows show `—` in Page.
- **Responsiveness:** column inherits existing `overflow-x-auto` table wrapper.

## 6. Tests

- Unit tests for `sanitizeSearch` (token strip, multi-key, no-match passthrough, empty input).
- Unit test for `buildWouldDenyMetadata` (shape, truncation, mode constant).
- Existing `aggregateByKey` / `toCsv` tests untouched.

## 7. DOCUMENTATION.md / POLICY.md / Memory updates

- `DOCUMENTATION.md` — `v2.66.16.0` Version History entry.
- `POLICY.md` — extension under §Phase20-HubPlatformObserveOnly: metadata schema, sensitive-key deny-list, truncation rule, observe-only invariant preserved.
- `mem/features/platform/hub-foundation.md` — one bullet (no invariant change).
- `CHANGELOG_2026.md` — sub-bullet under Hub Platform.

## 8. Post-implementation notes

- **Out of scope:** no new schema column, no migration, no new `CanAction` wraps, no enforcement, no change to PMS workflow/scoring/menu/reports/RLS/permissions, no change to Audit Logs tab.
- **Rollback:** revert `CanAction.tsx` + `useEntitlement.ts` to drop the extra arg; the `after` column simply stops being populated. Existing rows with metadata remain readable. Telemetry column gracefully degrades to `—`.
- **Backward compat:** rows without `after` continue to display safely (existing dashboard already tolerates `null`).

## Files to be changed

- `src/lib/platformTelemetryMeta.ts` *(new)*
- `src/hooks/useEntitlement.ts` — extend `logWouldDeny` signature
- `src/components/platform/CanAction.tsx` — pass route/source metadata
- `src/pages/platform/PlatformSettings.tsx` — add Page column + CSV fields
- `src/test/platformTelemetryMeta.test.ts` *(new)*
- `DOCUMENTATION.md`, `POLICY.md`, `CHANGELOG_2026.md`, `mem/features/platform/hub-foundation.md`

No DB migrations. No edge functions. No new dependencies.
