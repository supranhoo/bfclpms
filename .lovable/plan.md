## Assumptions
- Roadmap work remains paused until the admin sidebar and auditor pages are restored.
- No PMS enforcement will be enabled; `hub_enforcement_pilot_enabled` stays `false`.
- This is a CAPA/observe-only correction, not a new roadmap phase.

## Findings from read-only verification
- The live entitlement resolver in `useEntitlement.ts` always resolves `client_key='default'`.
- Database currently has `client_key='default'` with `display_name='BFCL'` and `id='b4ffce0d-e806-4413-972c-8c9bf3eb2bdb'`.
- So live resolves to both labels in practice: the **entity key is `default`**, and the **actual client id is `b4ffce0d-e806-4413-972c-8c9bf3eb2bdb`**.
- `client_urls` has no binding row for `pms.bfclalloys.com`; current code does not resolve by domain anyway.
- `hub_platform_settings_enabled=true`, `hub_enforcement_pilot_enabled=false`, and `menu_overrides_enabled=false`.
- Existing baseline entitlement rows for `default` / `b4ffce0d...` include `module_key='pms'` and all currently registered PMS action entitlements enabled.
- The requested baseline names like `pms.access`, `pms.sidebar`, `pms.admin.dashboard`, `pms.audit.panel`, etc. do not currently exist as `action_registry` keys, so adding entitlement rows for them would fail unless the registry is extended. I will not create speculative action keys in CAPA.

## Risk & Impact Report
- **Data Impact:** Low. Only safe, idempotent entitlement data correction/audit rows if needed; no destructive data changes.
- **Workflow Impact:** Low. Keeps observe-only mode; no PMS action should become blocked.
- **UI/UX Impact:** Intended to restore/verify admin sidebar and auditor pages. No visual redesign.
- **Regression Risk:** Low if limited to entitlement data and diagnostics. Avoid touching scoring/workflow/menus unless validation proves the failure is code-side.
- **Scalability Impact:** Minimal. Reads are limited by indexed keys (`client_key`, `client_id`, action/module keys). No large dataset rendering.
- **Mitigation:** Idempotent upserts only; preserve enforcement flag off; verify with browser/network/DB signals after correction.
- **Rollback:** Re-disable any accidentally enabled action/module entitlements or revert diagnostic-only code; no schema rollback expected.

## Step-by-step Plan
1. **Finalize resolver verification**
   - Confirm the app code resolves entitlements through `client_key='default'`.
   - Confirm `default` maps to `client_id='b4ffce0d-e806-4413-972c-8c9bf3eb2bdb'`.
   - Confirm no domain-based resolver is active for `pms.bfclalloys.com`.

2. **Apply idempotent CAPA data correction only if gaps exist**
   - Ensure `client_module_entitlements` has `module_key='pms'` enabled for the `default` client.
   - Ensure every existing PMS action in `action_registry` has an enabled row in `client_action_entitlements` for the `default` client.
   - Do **not** enable `hub_enforcement_pilot_enabled`.
   - Add an audit row describing the CAPA baseline entitlement reconciliation.

3. **Add safe client-resolution visibility if needed**
   - If browser verification remains inconclusive, add a non-blocking diagnostic marker/log in the entitlement hook or platform settings showing resolved `clientId` and observe/enforcement flags.
   - This must not affect sidebar logic or access control.

4. **Validate CAPA invariants**
   - Admin sidebar must not be empty when `menu_overrides_enabled=false`.
   - Auditor pages must not crash.
   - Legacy baseline access must remain available with `menu_overrides_enabled=false` and not be dependent on Hub enforcement.
   - Confirm network/console has no entitlement or sidebar crash errors.

## UI Changes
- Not Applicable unless diagnostic visibility is required.
- If added, it will be a developer-only/non-disruptive marker or console diagnostic, not a user-facing redesign.

## Implementation
- Use a backend data update only for existing entitlement rows / missing rows.
- No schema migration unless evidence proves missing registry keys must become formal product actions; that would require a separate approval because it changes the entitlement model.
- No roadmap implementation until validation passes.

## Tests
- Add/adjust unit tests only if code changes are needed.
- Verify existing entitlement resolver behavior: disabled hub returns allow, enabled hub resolves `default` client actions, enforcement pilot remains off.
- Browser smoke validation: admin sidebar visible; auditor route accessible; no ErrorBoundary.

## DOCUMENTATION.md updates
- If code changes are made, update documentation to state: live PMS currently resolves entitlements through the `default` client row, and CAPA requires baseline PMS entitlements there.
- If data-only correction is sufficient, no repository documentation change is necessary unless you want this captured permanently.

## POLICY.md updates
- If code changes are made, update policy to state: Hub enforcement remains off during CAPA and cannot be used to gate PMS baseline access until sidebar/auditor invariants pass.
- If data-only correction is sufficient, no repository policy change is necessary unless you want this captured permanently.

## Post-implementation notes
- The most important finding is that `default` and `b4ffce0d-e806-4413-972c-8c9bf3eb2bdb` are the same current client row, not two different clients in the database.
- If the sidebar is still blank after these entitlements are confirmed, the remaining root cause is likely deployment bundle freshness, sidebar collapsed/offcanvas state, route/layout mounting, or menu/sidebar code—not entitlement row mismatch.