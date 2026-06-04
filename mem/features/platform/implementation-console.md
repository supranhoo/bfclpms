---
name: Delegated Implementation Console
description: Scoped per-client setup surface for the implementation_admin role — same backend tables as Platform Settings, no entitlement/enforcement powers, write-only secrets, fully audited.
type: feature
---

## Role
- `implementation_admin` is a new entry in `public.app_role`. Distinct from `platform_owner`; neither inherits the other.
- Assignment is per-client via `public.client_implementer_assignments (client_id, user_id)`; only `platform_owner` can insert/delete; assignees can SELECT their own rows.
- `is_implementation_admin_for(client_id)` SECURITY DEFINER helper drives RLS on all console-scoped tables.

## Route and tabs
- Route: `/implementation-console`, guarded by `ImplementationConsoleRoute` (platform_owner OR ≥1 assignment).
- Tabs: Assigned Clients · Profile (display_name only) · URLs & Domains · Communications · Sender Identity · Test Email · Notification Templates (placeholder) · Setup Checklist · Delivery Logs (placeholder).
- Client picker shows only clients visible via RLS — platform owners see all; implementers see assigned only.

## SMTP / secret rule
- `client_smtp_config` stores metadata only (`from_*`, provider, host/port/username, `secret_set_at`, `secret_fingerprint`, `secret_ref`). Column-allowlist GRANT on SELECT — no future secret column can leak via `select *`.
- Secret bytes live in `system_settings` keyed `client_smtp::<client_id>` (service-role read only) and are rotated by edge function `impl-console-rotate-smtp-secret`. Fingerprint = sha256(secret)[0..8]. The UI never displays the secret — only "Last rotated …" and the 8-char fingerprint.
- Test sends go through `impl-console-send-test-email` (provider `resend` or `lovable`). Rate limit = 10/hour per `(actor_id, client_id)`, enforced atomically by SECURITY DEFINER RPC `public.impl_console_try_increment_rate` — counts every ATTEMPT (including failures) so a flapping provider can't be abused. RPC also prunes rows >24h on each call. Table `public.impl_console_rate_buckets` is on `backup_denylist`.
- Recipient allowlist for `implementation_admin`: must match the sender's `from_email` domain OR equal the caller's own auth email. `platform_owner` is unrestricted. Audit row stores only `recipient_masked` (`a***@domain`), `recipient_domain`, and `recipient_hash` (sha256 of lowercased email, 16 hex chars) — never the local part, never the full address.
- Logs (`console.error`/`log`) never include request body, secret, secret_ref, provider API key, headers, or provider response payloads that may carry secrets. Audit `before`/`after` never include secrets or secret refs.

## Checklist
- `client_setup_checklist` is auto-seeded by `seed_client_setup_checklist` AFTER INSERT trigger on `clients` and backfilled idempotently for existing clients. 9 default items keyed `display_name, website_url, allowed_app_urls, support_emails, sender_identity, smtp_secret, test_email, notification_templates, go_live`.
- `allowed_app_urls` auto-ticks when at least one row in `client_urls` for the client is `is_active AND is_primary AND verified`. `tickChecklist` short-circuits if already done (no duplicate audit rows).

## Client URLs (Phase 3D)
- `public.client_urls` records per-client app URLs (production, staging, vanity). Columns: `url`, `label`, `is_primary`, `verified` (manual), `verified_by/at`, `notes`, `is_active`, `archived_at/by`. CHECKs reject `javascript:`/`data:`/`file:`/`vbscript:` and non-`https?://` schemes; `is_primary => is_active`; archive consistency.
- **No hard delete.** Grants: `SELECT, INSERT, UPDATE` to `authenticated`; no DELETE policy. Archival is via `impl_console_archive_url(url_id)` SECURITY DEFINER RPC which sets `is_active=false`, stamps `archived_at/by`, clears `is_primary`. Archived rows are retained for traceability and never referenced by test emails/templates.
- Partial unique indexes: at most one `is_primary AND is_active` per client; `(client_id, lower(url))` unique only while `is_active`. Re-adding a previously archived URL is allowed.
- `impl_console_set_primary_url(url_id)` RPC: atomically unsets any prior active primary for the client and sets the requested row as primary in one transaction. Rejects archived rows. UI uses this for both "Set primary" buttons and the Add dialog's "Mark as primary" checkbox — users never have to manually clear the old primary.
- Test email body appends `Client app: <url>` ONLY when row is `is_active AND is_primary AND verified`. Manual verification only — no DNS/SSL validation is performed (banner in UI).
- Notes field carries a UI warning: "Do not enter passwords/tokens." Notes are visible to platform owners and assigned implementers.
- Audit: every create/set-primary/verify-toggle/archive writes `entitlement_audit` with `entity_type='client_url'`, `entity_key=clients.client_key`, reason `impl_console_update_client_url`. Notes contents are NOT echoed into audit payloads.

## Client Contacts (Phase 3E)
- `public.client_contacts` records per-client role-tagged email addresses. Roles: `support`, `hr`, `escalation`, `billing`, `ops`, `other` (CHECK allowlist). Columns include `email` (CHECK enforces lowercase + no whitespace + regex), `display_name`, `is_primary_for_role`, `verified` (manual), `verified_by/at`, `notes`, `is_active`, `archived_at/by`.
- **No hard delete.** Grants: `SELECT, INSERT, UPDATE` to `authenticated`; no DELETE policy or grant. Archival via `impl_console_archive_contact(contact_id)` SECURITY DEFINER RPC.
- Partial unique indexes: one active primary per `(client_id, role)`; same email may not be active twice for the same `(client, role)` while active.
- `impl_console_set_primary_contact(contact_id)` RPC atomically unsets any prior active primary in the same `(client, role)` and sets the requested row as primary. Rejects archived rows. Used by both the row action and the Add dialog's "Mark as primary" checkbox — users never have to manually clear the old primary.
- Manual verification only — no SMTP probe. UI banner makes this explicit. Notes UI warning: "Do not enter passwords, tokens, or secrets in notes."
- Archive uses `ConfirmDestructiveDialog` with copy clarifying that archive is not delete and history remains available.
- Audit (`entitlement_audit`): `entity_type='client_contact'`, `entity_key=clients.client_key`, reason `impl_console_update_client_contact`. Payload **never echoes** the raw email or notes — only `email_domain`, `email_hash` (sha256[0..16] of lowercased email), `email_masked` (`a***@domain`). The actual email lives only in `client_contacts`.
- Checklist: existing `support_emails` item auto-ticks when at least one row has `role='support' AND is_active AND verified`. Idempotent — short-circuits if already done.
- No edge function changes and no email sending in this phase — Communications is purely the address-book foundation that downstream Notification Templates and Delivery Logs phases will read from.

## Notification Templates (Phase 3F)
- `public.client_notification_templates` stores per-client email templates consumed ONLY by `impl-console-send-test-email`. The global PMS notification engine is untouched.
- Columns: `template_key` (CHECK `^[a-z0-9_]{2,64}$`), `channel` (locked to `email`), `subject` (≤200), `body_text` (≤20000), `body_html` (optional, ≤50000, **stored but not sent** in this phase), `variables`, `is_active`, `archived_at/by`.
- **Keys are unique per client, not global.** Partial unique index `(client_id, template_key) WHERE is_active`. Different clients may reuse the same key.
- **No hard delete.** Grants: `SELECT, INSERT, UPDATE` to `authenticated`. Archival via `impl_console_archive_template(_id)` SECURITY DEFINER RPC.
- RLS: `platform_owner` OR assigned implementer for the row's `client_id`.
- Variable substitution is a **strict allowlist**: `client_name`, `client_key`, `actor_email_masked`, `timestamp_utc`, `app_url`. Implemented as a regex replace — no expression engine, no conditionals/loops, no SQL/JS, no remote includes. Unknown `{{tokens}}` are left as-is (never errored).
- Archive behavior: archived templates are NEVER used by the test-email function. When the active row is missing (never created or just archived), the function falls back silently to the default plain body.
- HTML safety: body_html is shown in the Preview drawer as **source only** (inside `<pre>`), never rendered as markup, since no sanitizer is wired yet. The edge function only sends `body_text`.
- Audit (`entitlement_audit`): `entity_type='client_notification_template'`, reason `impl_console_<create|update|archive>_client_notification_template`. Payload is PII-minimized: `{ template_key, subject_len, body_text_len, body_html_len, is_active }` — raw subject and bodies are NEVER echoed. Test-email audit records `template_resolved` + length fields.

## Delivery Logs (Phase 3G)
- Read-only tab over existing `entitlement_audit` rows (`entity_type='client_smtp'`, `reason='impl_console_test_email_send_client_smtp'`). No new table, RPC, or edge function.
- Server-side paginated 25/page via `range()` + `count: 'exact'`. Filters: outcome, template_key contains, since-window.
- Recipient stays masked exactly as stored — full email is never reachable from this UI.
- Actor email visibility: `platform_owner` sees full email; `implementation_admin` sees masked form. Display name comes from `profiles.full_name`.
- RLS on `entitlement_audit` (assigned implementer OR platform_owner) is the access boundary. Unassigned clients are not selectable in the picker; direct query failure renders an "Access denied" alert (never silent empty).
- No CSV/Excel export, no retry/resend, no realtime/polling. Manual Refresh only. PMS notification logs are out of scope.

## Audit
- Every console mutation writes to `entitlement_audit` with `event_type='update'` (CHECK constraint allows only `grant/revoke/update/would_deny/admin_view/deny/create`). Logical action is encoded in `reason` as `impl_console_<action>_<entity_type>` (`update`, `secret_rotate`, `checklist_check`, `test_email_send`). `entity_key = clients.client_key`. Secret values are NEVER written to `before`/`after`.

## What `implementation_admin` CANNOT do
- Access `/platform-settings`, edit `client_key`, `deployment_mode`, `is_active`, or any entitlement / module / enforcement / role / RLS / governance row. Cannot hard-delete `client_urls` or `client_contacts` rows (no DELETE policy or grant). No PMS/safety/incentive/reports surface area is exposed by this console.

## Auth & Routing Enforcement (Phase 4A)
- `implementation_admin` is first-class in `AuthContext`: present in `ROLE_PRIORITY` (between `management` and `auditor`) and exposed as `isImplementationAdmin` (mirrors `isPlatformOwner`).
- Route guards render the standalone `<AccessDenied />` page (`/access-denied`) on failure — no silent `/home` redirect. Direct `/platform-settings` probes by `implementation_admin` get a visible 403.
- `ImplementationConsoleRoute` admits any of: `platform_owner`, `implementation_admin`, OR `client_implementer_assignments` row. An `implementation_admin` with zero assignments reaches the shell; the client picker simply shows no clients (RLS-correct, not a redirect).
- `ModuleHub` Implementation Console tile uses the same union as the route guard. Platform Settings tile remains `platform_owner` + `hub_platform_settings_enabled`.
- No sidebar change — `/platform-settings` and `/implementation-console` are outside `DashboardLayout`.