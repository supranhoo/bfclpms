## Phase 3A.6 — Privacy / Consent Settings (config only, no enforcement)

### Assumptions
- Sixth and final sub-tab under **Data Governance**.
- Registry of privacy/consent policies the platform must honor (cookie consent, marketing comms, analytics, AI training, data sharing, DSAR contact, etc.). No runtime enforcement, no consent capture UI yet.
- Platform-owner writes; authenticated reads. Same banner: "Config only — not enforced yet".

### Risk & Impact
- **Data**: 1 new additive table `public.privacy_consent_settings`. No FK to existing tables.
- **Workflow / reports / backup**: zero impact — nothing reads it. Auto-included in backups via `get_backup_table_order()`.
- **Regression**: negligible (isolated sub-tab).
- **Scalability**: ~15–25 rows total.
- **Rollback**: drop table, remove sub-tab.

### Schema — `public.privacy_consent_settings`
- `id uuid pk`
- `module_key text not null` (`platform`, `pms`, `hrms`, `safety`, `incentive`, `lms`)
- `consent_key text not null` — slug, e.g. `platform.cookies.analytics`, `platform.marketing.email`, `hrms.data_sharing.payroll_vendor`, `platform.ai.training_optout`
- `consent_label text not null`
- `purpose text not null` — short description of why data is processed
- `data_categories text` — comma list (e.g. "email, device_id, ip")
- `lawful_basis text not null default 'consent'` — `consent` | `contract` | `legitimate_interest` | `legal_obligation` | `vital_interest` | `public_task`
- `required boolean not null default false` (true = strictly necessary, no opt-out)
- `default_state text not null default 'opt_out'` — `opt_in` | `opt_out`
- `dsar_contact_email text`
- `policy_url text`
- `notes text`
- `is_active boolean not null default true`
- standard audit cols
- UNIQUE `(consent_key)`
- CHECK `lawful_basis IN ('consent','contract','legitimate_interest','legal_obligation','vital_interest','public_task')`
- CHECK `default_state IN ('opt_in','opt_out')`

GRANTs: `SELECT` to `authenticated`, `ALL` to `service_role`.
RLS: read = authenticated; write = `platform_owner`.
Trigger: standard `updated_at`.
Index: `(module_key)`.

### Seed (idempotent, ~14 rows)
- `platform.cookies.strictly_necessary` — required, contract
- `platform.cookies.analytics` — opt_out, consent
- `platform.cookies.marketing` — opt_out, consent
- `platform.marketing.email` — opt_out, consent
- `platform.marketing.sms` — opt_out, consent
- `platform.ai.training_optout` — opt_out, legitimate_interest
- `platform.ai.assistant_logging` — opt_out, consent
- `platform.dsar.contact` — required, legal_obligation
- `platform.telemetry.crash_reports` — opt_out, consent
- `pms.feedback.anonymous_share` — opt_out, consent
- `hrms.data_sharing.payroll_vendor` — required, contract
- `hrms.data_sharing.background_check` — opt_in, consent
- `safety.incident.publish_anonymized` — opt_out, legitimate_interest
- `incentive.payout.bank_share` — required, contract

### UI — `DataGovernanceTab.tsx`
Add sixth sub-tab **Privacy & Consent**:
- Filter bar: module + show-inactive.
- Table: Module · Consent Key · Label · Lawful Basis · Default · Required · Active · Edit.
- Add and Edit dialogs (no Delete — toggle `is_active`).
- `consent_key` and `module_key` immutable after creation.
- Reuse "Config only — not enforced yet" banner.

### Audit
`entitlement_audit` per create/update:
- `event_type`: `create` | `update`
- `entity_type`: `privacy_consent_setting`
- `entity_key`: `consent_key`
- `before` / `after` JSON snapshots
- `reason`: `platform_settings_privacy_consent_(create|update)`

### Out of scope
- No consent banner, no cookie blocker, no DSAR workflow, no opt-in/out capture per user.
- No integration with marketing/analytics tools.
- All deferred to enforcement phase.

### Files
- New migration `<ts>_create_privacy_consent_settings.sql` — table + RLS + grants + seed.
- `src/components/platform/DataGovernanceTab.tsx` — add `PrivacyConsentSubTab` + tab trigger.
- `CHANGELOG_2026.md` — 3A.6 entry.
- `.lovable/plan.md` — replace with this plan.

### Verification
- `platformFoundation` smoke 12/12 still pass.
- Manual: platform_owner can add + edit; non-platform_owner read-only.
- One `entitlement_audit` row per save.
- No change in any PMS / audit / reports / export / backup surface.

Ready to implement on approval.
