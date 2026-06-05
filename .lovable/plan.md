# System Settings Ownership Inventory — G1–G5 Prioritization Summary

Source: `mem://infrastructure/system-settings-ownership-inventory` (audited 2026-06-04).
**Scope:** summary + prioritization only. No code, schema, RLS, menu, or PMS changes proposed.
**Menu CAPA guardrails honored:** no Menu Setting / Custom Tabs changes, `menu_overrides_enabled=false` stays, no PMS workflow/scoring/RLS/enforcement changes, no runtime feature shipped without separate approval.

---

## G1 — No audit trail for `system_settings` changes

1. **Affected surfaces:** SystemSettings tabs writing to `system_settings` — General (rollover), Scoring, Cycles, Controls (auto-logout, recall window), Uploads, Email, Passwords, Report Builder, Feature Flags, Increment.
2. **Current risk:** Silent changes to score calculation mode, auto-rollover, auto-logout, recall window, max upload size, increment slabs, feature flags. No "who/when/why" for any tuning that directly affects scoring, payroll-adjacent incentive logic, and session security. Forensic gap during disputes; SOX-style traceability missing.
3. **Recommended owner:** **Audit/Observability** (table + retention), executed jointly with **Platform Control** (write path instrumentation in `useUpdateSystemSetting`).
4. **Remain outside HRMS?** **Yes.** `system_settings` is platform-wide (scoring, uploads, email, sessions). Belongs to platform/audit, not HR domain.
5. **Roadmap phase / work package:** Phase 10 → **WP-AUD-01: Platform Settings Audit Trail** (covers G1+G2+G3 together — single `settings_audit` table with `domain` discriminator is cheaper than three).
6. **Risk level:** **Medium-High** (compliance + forensic risk; no data corruption risk today).
7. **Urgent / deferable / strategic:** **Urgent-ish** — defer max 1 quarter. Should ship before next external audit cycle.
8. **.NET/SQL migration dependency:** **Low.** Append-only audit table is portable; design column shape now (`domain`, `setting_key`, `old_value`, `new_value`, `changed_by`, `changed_at`, `reason`) so .NET port maps 1:1.

---

## G2 — No audit trail for `app_settings` changes

1. **Affected surfaces:** SystemSettings > Branding (organization name, app name, logo, login background/wallpapers, hero headline/description, PMS policy URL & content, `pms_policy_visible_roles`, view-mode strip color).
2. **Current risk:** Branding/policy text and **role visibility for PMS Policy menu** can be changed silently. `pms_policy_visible_roles` is the highest-impact field — it changes sidebar visibility for all roles. Reputational + governance risk if policy text or external link is altered without trail.
3. **Recommended owner:** **Audit/Observability** (storage) + **Org Master** (semantic ownership of branding/policy fields).
4. **Remain outside HRMS?** **Yes** for branding/policy ownership; this is org-level config, not HR.
5. **Roadmap phase / work package:** Phase 10 → **WP-AUD-01** (folded into the unified settings_audit table; `domain='app_settings'`).
6. **Risk level:** **Medium** (policy text + role visibility are sensitive; rest is cosmetic).
7. **Urgent / deferable / strategic:** **Deferable** (ship alongside G1, not ahead of it).
8. **.NET/SQL migration dependency:** **Low.** Same shape as G1; portable.

---

## G3 — No audit trail for `safety_settings` changes

1. **Affected surfaces:** SafetySettings page — PTW expiry offset, training overdue threshold, audit thresholds, incident severity matrix, any open-ended `safety_*` key.
2. **Current risk:** Safety SLAs, incident severity routing, and audit pass/fail thresholds can be tuned silently. Directly affects safety compliance posture, drill outcomes, and SLA dashboards. Highest regulatory exposure of the three audit gaps.
3. **Recommended owner:** **Safety** (domain ownership) with **Audit/Observability** providing the shared audit table contract.
4. **Remain outside HRMS?** **Yes.** Safety module is fully isolated; HRMS must not own.
5. **Roadmap phase / work package:** Phase 10 → **WP-AUD-01** (same unified table; `domain='safety_settings'`). RPC `set_safety_setting` is the single write path — instrumenting it is straightforward.
6. **Risk level:** **High** (regulatory + safety incident traceability).
7. **Urgent / deferable / strategic:** **Urgent** — highest of G1–G3 due to regulatory exposure.
8. **.NET/SQL migration dependency:** **Low.** Same table shape; the write path is already an RPC, so the .NET port replaces only the RPC body.

---

## G4 — `safety_settings` is open-ended JSON KV with no registry

1. **Affected surfaces:** SafetySettings inline JSON editor. Any admin/safety_head can add arbitrary keys with arbitrary JSON values; consumers read by string key.
2. **Current risk:** Silent typos create dead keys (consumer falls back to default → silent behavioral drift). Wrong JSON type (string vs number vs object) causes runtime parse failures in Safety hooks. No discoverability for new engineers — "what keys exist?" is unanswerable without a DB scan.
3. **Recommended owner:** **Safety** (key catalog ownership) with **Platform Control** (registry table + typed-getter pattern).
4. **Remain outside HRMS?** **Yes.**
5. **Roadmap phase / work package:** Phase 10 → **WP-CFG-02: Safety Settings Registry** (separate from WP-AUD-01). Adds `safety_settings_registry(key, json_type, default_value, description, owner_role)` + validation in `set_safety_setting` RPC.
6. **Risk level:** **Medium** (latent bugs, not active corruption).
7. **Urgent / deferable / strategic:** **Strategic** — pair with .NET migration so the registry becomes the schema contract.
8. **.NET/SQL migration dependency:** **High.** Registry should be designed jointly with .NET schema so typed getters/POCOs map directly; doing this twice would be wasteful. **Recommend gating WP-CFG-02 on .NET planning kickoff.**

---

## G5 — `system_settings` values are loosely typed; fragile parsing

1. **Affected surfaces:** Every consumer of `system_settings.setting_value` — most visibly `useSystemSetting`, `useScoreCalculationMode`, `useAutoLogoutMinutes`, `useWorkingDaysPerMonth`, `useDailyAggregationMethod`, increment/email/upload settings. Today values are stored as quoted strings requiring `replace(/^"|"$/g, '')` cleanup.
2. **Current risk:** Parsing fragility — boolean/number values are coerced from strings ad-hoc; a stray manual DB edit can break a hook. No compile-time guarantee that `score_calculation_mode` is in its enum. Cross-tier consistency between TS and PL/pgSQL consumers depends on developer discipline.
3. **Recommended owner:** **Platform Control** (typed-getter library + registry) with **Audit/Observability** for change validation hook (overlaps G1).
4. **Remain outside HRMS?** **Yes.** Platform concern.
5. **Roadmap phase / work package:** Phase 10/11 → **WP-CFG-03: Typed System Settings Registry** (`system_settings_registry(key, json_type, enum_values, default_value, owner_domain)` + strict JSONB storage + generated TS types). Pair with WP-CFG-02 for symmetry.
6. **Risk level:** **Medium-Low today, High once .NET port begins** (untyped strings will not survive a strongly-typed re-platform without a registry).
7. **Urgent / deferable / strategic:** **Strategic.**
8. **.NET/SQL migration dependency:** **Very High.** This is effectively the schema contract for settings in the new platform. **Must be designed during .NET planning, not before.**

---

## Consolidated Roadmap View

```text
Phase 10  (next 1–2 quarters, pre-.NET planning):
  WP-AUD-01  Unified settings_audit table (covers G1 + G2 + G3)
             Owner: Audit/Observability + Platform Control + Safety
             Priority order inside WP: G3 (Safety) > G1 (system) > G2 (app)
             Risk: Medium-High            .NET dependency: Low

Phase 11  (concurrent with .NET planning):
  WP-CFG-02  Safety Settings Registry (G4)
             Owner: Safety + Platform Control
             Risk: Medium                 .NET dependency: HIGH — gate on kickoff

  WP-CFG-03  Typed System Settings Registry (G5)
             Owner: Platform Control
             Risk: Medium-Low now / High during port
             .NET dependency: VERY HIGH — co-design with .NET schema
```

## Priority Ranking (urgency-weighted)

1. **G3** — Safety audit trail (regulatory exposure)
2. **G1** — System settings audit trail (forensic + compliance)
3. **G2** — App settings audit trail (governance; bundle with G1)
4. **G4** — Safety registry (latent bug class; gate on .NET)
5. **G5** — Typed system settings registry (strategic; co-design with .NET)

## Guardrails Reaffirmed

- No Menu Setting / Custom Tabs work in this thread.
- `menu_overrides_enabled` stays `false`.
- No PMS workflow / scoring / RLS / enforcement changes.
- No runtime feature shipped without a separate, explicitly approved work package.

## Out of Scope (Explicitly)

- Implementation of audit tables, registries, or typed getters.
- Migration SQL.
- UI changes to SystemSettings or SafetySettings.
- Any change to `menu_*` tables, `menu_overrides_enabled`, or PMS scoring/workflow code.

This is a prioritization deliverable only. Awaiting selection of which WP (if any) to scope next.
