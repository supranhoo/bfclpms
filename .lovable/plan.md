## Phase 2.66.18.3 — Clients tab: Edit mode + active status (safe phase)

Extend the existing **Edit Client** dialog in Platform Settings → Clients so platform_owner can change `deployment_mode` and `is_active` in addition to `display_name`. Key, source, timestamps stay immutable. No Delete. No PMS behaviour change.

### Scope

**Single file: `src/pages/platform/PlatformSettings.tsx` (ClientsTab only).**

No DB migration — `clients` already has `is_active` (boolean, default true) and `deployment_mode` (text, CHECK saas/on_prem/hybrid); `clients_write` RLS already gates writes to platform_owner; `entitlement_audit` already accepts `event_type='update'`.

### UI changes

Edit dialog grows two fields below the existing read-only key + display-name input:

1. **Mode** — `Select` with options `saas` / `on_prem` / `hybrid`.
2. **Active** — `Switch` labelled "Active" with a muted "Inactive tenants stay in the list but are flagged" helper line.

Title becomes "Edit Client". Description updated to "Display name, mode, and active status are editable. Key, source, and timestamps are immutable."

Clients table row gets an **Inactive** badge (`variant="secondary"`, muted) next to the display name when `is_active = false`. The existing `✓ / —` Active column stays as-is for at-a-glance scan.

### Safety rules for the default/BFCL client

- The `default` row can **never** be deactivated. If the user flips the Active switch off while editing `client_key = 'default'`, an `AlertDialog` reading "You are about to deactivate the default deployment client. This will hide it from new Platform Settings flows but does not affect PMS users. Type DEFAULT to confirm." appears. Cancel reverts. (The requirement said "strong confirmation unless protected" — we go with strong typed confirmation rather than a hard block, so the platform_owner is never permanently locked out of their own tenant config but cannot do it by accident.)
- Mode change on `default` is allowed without extra confirmation (low blast radius).
- All other clients: Save button is enabled as soon as anything is dirty + valid.

### Validation / dirty tracking

- `name`: trim, non-blank, ≤80 chars (already enforced).
- `mode`: must be one of the three (Select constrains it).
- `active`: boolean.
- Save disabled unless at least one of `{name, mode, active}` differs from the loaded row.
- Save also disabled when `!canWrite` or the mutation is pending.

### Audit

Single audit row per save (even when multiple fields change), so the change set stays atomic:

- `event_type = 'update'`
- `entity_type = 'client'`
- `entity_key = <row.client_key>`
- `before = { name, deployment_mode, is_active }` — only the fields actually present in the form
- `after  = { name, deployment_mode, is_active }`
- `reason = 'platform_settings_client_update'`

Existing name-only edits previously used `reason='platform_settings_client_name_update'`. We keep both reason codes in the codebase; the new combined save always emits `..._client_update` so historic name-only rows remain distinguishable.

### Out of scope (explicit)

- No Delete Client.
- No edits to `client_key`, `entitlement_source`, `valid_from/valid_until`, `signature_hash`, timestamps.
- No PMS enforcement of `is_active = false`. Inactive simply means flagged in the UI; entitlements and telemetry remain queryable.
- No workflow / scoring / menu / report / RLS / role / enforcement-pilot / observe-mode changes.

### Risk & rollback

- **Data impact**: Two columns on a single row can change. No cascade. Existing entitlement rows untouched (no FK action on `is_active`).
- **Regression risk**: Very low — write path already proven by name-edit; we add two form controls + one branch for the default-deactivate confirmation.
- **Rollback**: Revert the single-file `ClientsTab` diff. To restore the row, the audit `before` JSON contains the exact prior state.

### Verification

- Re-run the 27-test smoke suite: `platformEnforcement`, `platformTelemetryMeta`, `platformTelemetryAgg`.
- Manual smoke in preview:
  1. Edit BFCL name only → 1 audit row, mode/active unchanged.
  2. Edit BFCL mode → saas → hybrid → 1 audit row with both before/after.
  3. Try to deactivate `default` → typed confirmation appears; cancel keeps active=true.
  4. Create a throwaway client (from prior phase), deactivate it → Inactive badge appears, audit row present, entitlement toggles in Module/Action tabs still load that client.
  5. Audit Logs tab shows new `update` rows with the new reason code.

### Docs / memory

- `DOCUMENTATION.md`: version `2.66.18.3` entry.
- `CHANGELOG_2026.md`: new W1 row.
- `mem/features/platform/hub-foundation.md`: append "Edit mode + active" to the Clients-tab section; note the default-deactivate typed-confirmation rule.
