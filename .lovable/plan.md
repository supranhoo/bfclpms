
## Phase 3C — Delegated Implementation Console (scoped client setup for implementation_admin)

A Hub-level surface that lets an implementation/support team configure a small, well-defined set of **per-client** setup fields without granting `platform_owner`. Same backend tables as Platform Settings — no duplicate config storage. Existing PMS, RLS, entitlements, enforcement, menus, scoring and reports remain unchanged.

Placement: ships after Client URL/Domain Binding + Communications foundation, before broad client rollout.

### Assumptions
- New role added to `public.app_role` enum: `implementation_admin`. Distinct from `platform_owner`; no role inherits the other.
- Assignment is **per-client** (one user can be assigned to N clients). Lives in a new join table; never carried on `profiles`.
- Console is read-only for any client the user is not assigned to (no leaks).
- SMTP/API secrets are write-only — never returned from any RPC or table read; UI only shows `••••••• (set)` or `Not set`.
- Test email is rate-limited per user × client (server-side counter, e.g. 10 / hour).
- All mutating actions audit-log with `event_type ∈ {update, secret_rotate, test_email_send, checklist_check}`, `actor_id`, `entity_type='client'|'client_smtp'|...`, `entity_key=client_key`, `before`/`after` JSON, `reason='impl_console_*'`. Secret values are NEVER stored in the audit `before`/`after`; we record only `{rotated_at, fingerprint_prefix}`.

### Risk & Impact
- **Data**: 3 new additive tables (`client_implementer_assignments`, `client_setup_checklist`, `client_smtp_config`). One enum value added (`implementation_admin`). No FK to existing PMS / safety / incentive tables; entitlement/governance tables untouched.
- **Workflow / scoring / menus / reports / RLS / backup**: zero impact (additive; backup auto-included).
- **Security**: write-only secrets via edge function with `service_role`; client read-side `select` excludes secret columns via column grants. RLS scopes every list/read to `client_implementer_assignments`.
- **Regression**: negligible — isolated `/implementation-console` route, no edits to Platform Settings tabs except a new "Implementers" sub-tab in Clients.
- **Scalability**: O(assignments) lists; ≤ a few hundred rows. Pagination on delivery logs (server-side, page size 50).
- **Rollback**: drop new tables + role grant; remove route. No backfill needed.

### New role + assignment
- Migration adds `implementation_admin` to `public.app_role` enum.
- New table `public.client_implementer_assignments`:
  - `id uuid pk`, `client_id uuid not null references clients(id) on delete cascade`, `user_id uuid not null references auth.users(id) on delete cascade`, `assigned_by uuid`, `created_at timestamptz default now()`. UNIQUE `(client_id, user_id)`. Index `(user_id)`.
  - GRANT `SELECT` to `authenticated`, `ALL` to `service_role`. RLS: read = `is_platform_owner() OR user_id = auth.uid()`; write = `platform_owner` only.
- SECURITY DEFINER helpers (search_path=public, stable):
  - `is_implementation_admin_for(_client_id uuid) returns boolean` — `exists (assignment for auth.uid())`.
  - `current_user_assigned_clients() returns setof uuid` — used by RLS on all console-scoped queries.

### New / reused config tables
- **Reused (no schema change)**:
  - `public.clients` — Console can edit `name` only (never `client_key`, `deployment_mode`, `is_active`, `signature_hash`, `entitlement_source/version/valid_from/valid_until`).
  - URL/domain table from the Client URL/Domain phase (assumed `client_urls`); Console edits `website_url`, `allowed_app_urls[]`, `support_email`, `hr_email`, `escalation_email`.
  - Notification templates from the Communications phase (assumed `notification_templates`) — scoped by `client_id`.
  - `entitlement_audit` — single audit sink for every Console action.
- **New `public.client_smtp_config`** (per-client sender + secret indirection):
  - `client_id uuid pk references clients(id) on delete cascade`
  - `from_name text`, `from_email text`, `reply_to text`
  - `provider text check (provider in ('smtp','resend','sendgrid','lovable'))`
  - `smtp_host text`, `smtp_port int`, `smtp_username text`
  - `secret_ref text` — opaque pointer (e.g. vault key id), never the secret itself
  - `secret_set_at timestamptz`, `secret_fingerprint text` (first 4 chars of sha256, display-only)
  - `updated_by`, `updated_at`
  - GRANT `SELECT (client_id, from_name, from_email, reply_to, provider, smtp_host, smtp_port, smtp_username, secret_ref, secret_set_at, secret_fingerprint, updated_by, updated_at) ON public.client_smtp_config TO authenticated` — explicit column allowlist so future secret columns can never leak. `ALL` to `service_role`.
  - RLS: read/write = `is_platform_owner() OR is_implementation_admin_for(client_id)`.
  - Secret bytes are stored ONLY in Supabase Vault; the table holds the vault ref. The Console UI never displays the secret; "Replace secret" calls an edge function that writes Vault and updates `secret_set_at` + `secret_fingerprint`.
- **New `public.client_setup_checklist`**:
  - `id uuid pk`, `client_id uuid not null references clients(id) on delete cascade`, `item_key text not null`, `item_label text not null`, `done boolean default false`, `done_by uuid`, `done_at timestamptz`, `notes text`, `sort_order int default 0`. UNIQUE `(client_id, item_key)`. Idempotent seed of ~12 default items (display name, URLs, support emails, sender identity, SMTP secret, test email passed, first notification template, …).
  - GRANT `SELECT, UPDATE` to `authenticated`, `ALL` to `service_role`. RLS: read/write = `is_platform_owner() OR is_implementation_admin_for(client_id)`.

### Edge functions (verify_jwt; service_role inside)
1. `impl-console-rotate-smtp-secret` — body: `{client_id, secret}`. Validates assignment, writes Vault, updates `client_smtp_config.secret_set_at/fingerprint/secret_ref`, inserts audit row with `event_type='secret_rotate'` and **no secret value**.
2. `impl-console-send-test-email` — body: `{client_id, to_email, template_key?}`. Validates assignment, enforces 10-per-hour rate limit (per `actor_id + client_id` via a small `rate_buckets` row keyed by hour), uses the client's sender identity + SMTP, writes audit row with `event_type='test_email_send'`, `after={to_email, template_key, success}`.

### Routes + UI
- New route `/implementation-console` gated by new `<ImplementationConsoleRoute>` (allow `platform_owner` OR any user with ≥1 row in `client_implementer_assignments`). Hidden from main menu for everyone else.
- Page layout: left-side **client picker** (only assigned clients; platform_owner sees all). Right-side tab strip:
  1. **Assigned Clients** (overview list — read-only chips)
  2. **Client Profile** — edit `name` only (display banner if `platform_owner` locked it). `client_key`, mode, active all disabled with tooltip.
  3. **URLs & Domains** — edit `website_url`, `allowed_app_urls[]` (chip input, validated http(s) URLs, dedup).
  4. **Communications Setup** — `support_email`, `hr_email`, `escalation_email` (RFC 5322 validation).
  5. **Sender Identities** — `from_name`, `from_email`, `reply_to`, `provider` select, host/port/username for SMTP. Save → `client_smtp_config` upsert.
  6. **Test Email** — to-address input + "Send test" button. Disabled until sender identity + secret set. Shows last 5 test results from delivery logs scoped to client.
  7. **Notification Templates** — per-client templates list with inline edit (subject + body), scoped to assigned client.
  8. **Setup Checklist** — checkbox list with optional note per item; each toggle writes `checklist_check` audit.
  9. **Limited Delivery Logs** — paginated email delivery rows filtered to `client_id`. Hides recipient PII for non-platform_owner (shows local part + masked domain unless the row's recipient matches the assignee's email).
- "Replace SMTP secret" lives in tab 5: button → modal with single password-style input + confirm typed `ROTATE`. On submit calls `impl-console-rotate-smtp-secret`. Existing value never rendered; UI shows `Last rotated <relative>` + `fingerprint ••••<4 chars>`.

### Platform Settings additions (platform_owner only)
- New sub-tab inside the existing **Clients** tab: **Implementers**. Lists `client_implementer_assignments` joined with `auth.users` email. Actions: **Assign user** (email lookup → insert row) and **Revoke** (delete row). Both audit-logged (`event_type='update'`, `entity_type='client_implementer_assignment'`).

### Audit (one sink, no new audit table)
Every mutation writes to `entitlement_audit`:
- `event_type ∈ ('update','secret_rotate','test_email_send','checklist_check')`
- `entity_type ∈ ('client','client_url','client_smtp','client_notification_template','client_implementer_assignment','client_setup_checklist')`
- `entity_key = clients.client_key` (so existing audit dashboards aggregate by client without joins)
- `before` / `after` JSON snapshots, with secret bytes scrubbed. `reason` prefixed `impl_console_*`.

### Out of scope
- No PMS / safety / incentive / reports / scoring / menu / RLS changes.
- No new enforcement (Phase 3 enforcement pilot stays as-is).
- No backend role for "view secrets" — secrets are write-only forever via this console; viewing requires direct DB/vault access by an SRE.
- No bulk client import in this phase.
- No public marketing / DSAR workflow.

### Files
- **New migration** — `app_role` enum + 3 tables + grants + RLS + helpers + seed for `client_setup_checklist`.
- **New edge functions** — `supabase/functions/impl-console-rotate-smtp-secret/index.ts`, `supabase/functions/impl-console-send-test-email/index.ts` (+ deploy).
- **New route + page** — `src/pages/implementation-console/ImplementationConsole.tsx` and 9 sub-tab components under `src/components/implementation-console/`.
- **New guards / hooks** — `src/components/layout/ImplementationConsoleRoute.tsx`, `src/hooks/useAssignedClients.ts`, `src/hooks/useIsImplementationAdmin.ts`.
- **Platform Settings tweak** — add `ImplementersSubTab.tsx` inside Clients tab. No changes to other tabs.
- **Docs** — `CHANGELOG_2026.md` entry, new `mem/features/platform/implementation-console.md`, `.lovable/plan.md` (this plan).

### Verification
- `platformFoundation` smoke 12/12 still pass.
- New unit tests: helper RLS predicates (`is_implementation_admin_for`), URL validator, rate-limit bucket, secret-scrub on audit insert.
- Manual matrix:
  - platform_owner can assign + revoke an `implementation_admin`; audit rows recorded.
  - `implementation_admin` user sees only assigned clients; deep-link to unassigned `?client_id=` returns 403 from the loader.
  - All 9 tabs editable for assigned clients; disabled fields (`client_key`, mode, active, entitlements) show tooltip.
  - Rotate SMTP secret → value never appears in DB, audit, or UI; `Last rotated` updates.
  - Send test email respects 10/hour cap; 11th call returns rate-limit error.
  - Non-assigned `implementation_admin` cannot read `client_smtp_config`, `client_setup_checklist`, delivery logs, or notification templates for other clients (RLS enforced; verified by negative-path tests).
  - `/platform-settings` remains 403 for `implementation_admin`.
  - No diff in PMS workflow, scoring, menus, reports, or any non-Console route.

Ready to implement on approval. Say "next" to ship Phase 3C.
