## Phase 3G — Implementation Console: Delivery Logs (SHIPPED)

Closed the final **Delivery Logs** placeholder with a read-only view over existing test-send audit rows. No new schema, RPC, or edge function. Server-side paginated 25/page with outcome/template/since filters. Recipient kept masked; actor email shown in full only to `platform_owner`, masked for `implementation_admin`. No CSV export, no retries, no PMS notification engine surface. See `CHANGELOG_2026.md` and `mem/features/platform/implementation-console.md` "Delivery Logs (Phase 3G)" for the locked behavior.

---

## Phase 3F — Implementation Console: Notification Templates (SHIPPED)

Closed the **Notification Templates** placeholder with `client_notification_templates`: per-client (key scoped per client, not global), archival-only, strict allowlist variable substitution, HTML stored but not sent (no sanitizer yet — preview shows source only), PII-minimized audit (key + lengths + active flag, never raw subject/body). Archived templates are never used by the test-email function; missing/archived falls back silently to the default body. No PMS notification engine, dispatch queue, cron, or existing email-behavior changes. See `CHANGELOG_2026.md` and `mem/features/platform/implementation-console.md` "Notification Templates (Phase 3F)" for the locked behavior.

---

## Phase 3E — Implementation Console: Communications (SHIPPED)

Closed the **Communications** placeholder with the `client_contacts` address book: role-tagged emails (support/hr/escalation/billing/ops/other), archival-only lifecycle, atomic per-role primary RPC, manual verification, normalized + lowercased email storage, PII-minimized audit (domain + hash + masked only), and `ConfirmDestructiveDialog` for archive. No edge function changes, no email sending, no PMS/scoring/menu/report/Platform Settings impact. See `CHANGELOG_2026.md` and `mem/features/platform/implementation-console.md` "Client Contacts (Phase 3E)" for the locked behavior.

---

## Phase 3D — Implementation Console: Client URL / Domain binding (SHIPPED)

Closed the **URLs & Domains** placeholder tab with archival-only client URL records, atomic primary switching, manual verification, and a conditional test-email body line. No hard delete, no PMS/scoring/menus/reports/RLS-on-existing-tables/auth/routing impact. See `CHANGELOG_2026.md` 2026-06-04 entry and `mem/features/platform/implementation-console.md` "Client URLs (Phase 3D)" for the locked behavior.

---

## Phase 3C.2 — Implementation Console: Secret Rotation + Test Email (completing 3C)

Phase 3C shipped the foundation (role, tables, route, 3 working tabs + placeholders). This sub-phase closes the two remaining write paths that require server-side privilege so the Console becomes operationally complete, and wires the two tabs already stubbed in the UI (**Sender Identity → Replace secret** modal, **Test Email** tab). No changes to Platform Settings, PMS, scoring, RLS on other tables, menus, or reports.

### Assumptions
- Vault is available in the project (Supabase Vault). Secret bytes are written via edge function with `service_role`; the table only stores `secret_ref`, `secret_set_at`, `secret_fingerprint`.
- `client_smtp_config` row already exists for the client before secret rotation (created by the Sender Identity tab in 3C).
- Test email uses the client's stored sender identity. If `provider='lovable'` we route through Resend (existing `LOVABLE_API_KEY` infra used elsewhere in the project). For SMTP/Resend/SendGrid providers we use the secret rotated for this client.
- Rate limit: 10 test emails per hour per `(actor_id, client_id)` — enforced server-side via a tiny `rate_buckets`-style row keyed by hour. Implemented as a new lightweight table `impl_console_rate_buckets` (no PII; auto-pruned by a simple `WHERE bucket_hour < now() - interval '24h'` on each call).
- Both functions reject calls where the caller is neither `platform_owner` nor present in `client_implementer_assignments` for the target `client_id` (defense-in-depth in addition to RLS).

### Risk & Impact
- **Data**: 1 new tiny table `impl_console_rate_buckets`. Additive only; no FK to PMS/safety/incentive. No schema change to `client_smtp_config` (columns already exist from 3C).
- **Workflow / scoring / menus / reports / RLS on existing tables / backup**: zero impact. New table auto-included in backup engine (per the universal `get_backup_table_order()` RPC rule).
- **Security**: secret bytes only ever pass through one edge function and into Vault; never written to DB columns, never returned by any RPC/select, never echoed in audit `before`/`after`. UI shows only `Last rotated <relative>` and `••••<4-char fingerprint>`.
- **Regression**: isolated. Only files touched outside new code are the two Console sub-tab components (`SenderIdentityTab` to mount the rotate modal, `TestEmailTab` to call the new function). No edits to Platform Settings tabs.
- **Scalability**: O(1) per call; rate-bucket table stays under ~24 rows per active implementer.
- **Rollback**: disable the two edge functions, drop `impl_console_rate_buckets`. Stored sender-identity metadata remains usable for future re-enable.

### What gets built

1. **Migration**
   - `CREATE TABLE public.impl_console_rate_buckets (id uuid pk, actor_id uuid not null, client_id uuid not null references clients(id) on delete cascade, action text not null check (action in ('test_email_send')), bucket_hour timestamptz not null, count int not null default 0, UNIQUE (actor_id, client_id, action, bucket_hour))`.
   - GRANT `SELECT` to `authenticated`, `ALL` to `service_role`. RLS: `SELECT` allowed when `actor_id = auth.uid()` (so the UI can show "X/10 used this hour"); INSERT/UPDATE blocked from client — only `service_role` writes from the edge function.

2. **Edge function `impl-console-rotate-smtp-secret`**
   - `verify_jwt = true`. Body schema (zod): `{ client_id: uuid, secret: string (min 8, max 2048) }`.
   - Validates caller is `platform_owner` OR has `client_implementer_assignments` row for `client_id`.
   - Computes `sha256(secret)`, stores first 4 hex chars as `secret_fingerprint`. Writes secret bytes to Vault under a deterministic key `client_smtp::<client_id>` (overwrites previous).
   - Updates `client_smtp_config` row: `secret_ref`, `secret_set_at=now()`, `secret_fingerprint`, `updated_by=auth.uid()`, `updated_at=now()`.
   - Audit insert: `event_type='update'`, `entity_type='client_smtp'`, `entity_key=clients.client_key`, `before={secret_set_at: old}`, `after={secret_set_at: new, fingerprint}`, `reason='impl_console_secret_rotate_client_smtp'`. **Secret value never appears.**
   - Returns `{ ok: true, secret_set_at, secret_fingerprint }`. Never returns the secret.

3. **Edge function `impl-console-send-test-email`**
   - `verify_jwt = true`. Body schema (zod): `{ client_id: uuid, to_email: email, template_key?: string }`.
   - Same caller assignment check.
   - Rate-limit: upsert into `impl_console_rate_buckets` for `(auth.uid(), client_id, 'test_email_send', date_trunc('hour', now()))`; if `count >= 10` return `429 { error: 'rate_limited', retry_after_seconds }`.
   - Loads `client_smtp_config` for the client. If `from_email`/`provider` missing → `400 { error: 'sender_identity_incomplete' }`.
   - Sends via the configured provider (Resend for `lovable`/`resend`, SMTP for `smtp`, SendGrid for `sendgrid`). Subject: `"PMS test email — <client.name>"`. Body: plain template stating who triggered the test, timestamp, and client_key.
   - Increment rate-bucket count after dispatch.
   - Audit insert: `event_type='update'`, `entity_type='client_smtp'`, `entity_key=client_key`, `after={ to_email_local: '<local-part>', to_email_domain: '<masked>', template_key, success, provider }`, `reason='impl_console_test_email_send_client_smtp'`. Recipient PII is masked (local part + first letter of domain).
   - Returns `{ ok: true, message_id?, used: count, limit: 10 }`.

4. **UI wiring (Console only)**
   - **SenderIdentityTab**: add **Replace secret** button (visible only when row exists). Opens modal with one password-style input + a required typed confirmation `ROTATE`. On submit invokes `impl-console-rotate-smtp-secret`. On success refreshes the row and shows `Last rotated <relative>` + `Fingerprint ••••<4>`. Existing field shows `Not set` when `secret_set_at IS NULL`.
   - **TestEmailTab** (currently placeholder): renders a `to_email` input, optional template_key select (read from existing per-client notification templates if any; otherwise plain text test), a **Send test** button (disabled until sender identity + secret set), and a small "Used X/10 this hour" badge backed by a `SELECT count` from `impl_console_rate_buckets` filtered by `actor_id = auth.uid()` and the current hour. Shows the last 5 test results from `entitlement_audit` filtered to `entity_type='client_smtp' AND reason='impl_console_test_email_send_client_smtp' AND entity_key=<client_key>`.
   - **Checklist auto-tick**: when rotate succeeds → mark `smtp_secret` item done; when test email succeeds → mark `test_email` item done. Same audit reason as manual ticks (`impl_console_checklist_check_*`).

5. **Docs**
   - Append to `CHANGELOG_2026.md`.
   - Update `mem/features/platform/implementation-console.md` (replace the "planned next phase" sentence in the SMTP rule with the actual edge function behavior + rate-limit policy).

### Files (planned, not yet touched)
- **Migration**: `supabase/migrations/<ts>_impl_console_rate_buckets.sql`
- **Edge functions**: `supabase/functions/impl-console-rotate-smtp-secret/index.ts`, `supabase/functions/impl-console-send-test-email/index.ts`
- **UI**: `src/pages/platform/ImplementationConsole.tsx` (mount rotate modal in Sender Identity tab; replace Test Email placeholder with real component) — or split into `src/components/platform/impl-console/SenderIdentityTab.tsx` + `TestEmailTab.tsx` if the page file is getting long.
- **Docs**: `CHANGELOG_2026.md`, `mem/features/platform/implementation-console.md`.

### Verification
- Manual matrix:
  - `implementation_admin` for client A can rotate secret for A; rotating for unassigned client B returns 403.
  - Secret value never appears in DB, audit, network response, or UI; `Last rotated` and fingerprint update.
  - 11th test email within an hour returns 429; counter resets next hour.
  - Sender-identity-incomplete returns 400 with clear message.
  - `platform_owner` can rotate/test for any client.
  - Checklist auto-ticks `smtp_secret` and `test_email`; both produce an audit row each.
  - `/platform-settings` still 403 for `implementation_admin`.
  - `platformFoundation` smoke 12/12 still pass; no PMS/scoring/menu/report regression.

Ready to implement on approval. Say "next" to ship Phase 3C.2.
