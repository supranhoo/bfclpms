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
- Tabs: Assigned Clients · Profile (display_name only) · URLs & Domains (placeholder until Phase 3D) · Communications (placeholder until Phase 3E) · Sender Identity · Test Email (placeholder until rotation edge function) · Notification Templates (placeholder) · Setup Checklist · Delivery Logs (placeholder).
- Client picker shows only clients visible via RLS — platform owners see all; implementers see assigned only.

## SMTP / secret rule
- `client_smtp_config` stores metadata only (`from_*`, provider, host/port/username, `secret_set_at`, `secret_fingerprint`, `secret_ref`). Column-allowlist GRANT on SELECT — no future secret column can leak via `select *`.
- Secret bytes live in `system_settings` keyed `client_smtp::<client_id>` (service-role read only) and are rotated by edge function `impl-console-rotate-smtp-secret`. The UI never displays the secret — only "Last rotated …" and `••••<4-char fingerprint>`.
- Test sends go through `impl-console-send-test-email` (provider `resend` or `lovable`), rate-limited to 10/hour per `(actor_id, client_id)` via `public.impl_console_rate_buckets` (only `service_role` increments). Recipient PII is masked in audit (`local@<first-letter>***`).

## Checklist
- `client_setup_checklist` is auto-seeded by `seed_client_setup_checklist` AFTER INSERT trigger on `clients` and backfilled idempotently for existing clients. 9 default items keyed `display_name, website_url, allowed_app_urls, support_emails, sender_identity, smtp_secret, test_email, notification_templates, go_live`.

## Audit
- Every console mutation writes to `entitlement_audit` with `event_type='update'` (CHECK constraint allows only `grant/revoke/update/would_deny/admin_view/deny/create`). Logical action is encoded in `reason` as `impl_console_<action>_<entity_type>` (`update`, `secret_rotate`, `checklist_check`, `test_email_send`). `entity_key = clients.client_key`. Secret values are NEVER written to `before`/`after`.

## What `implementation_admin` CANNOT do
- Access `/platform-settings`, edit `client_key`, `deployment_mode`, `is_active`, or any entitlement / module / enforcement / role / RLS / governance row. No PMS/safety/incentive/reports surface area is exposed by this console.