
# Annual Review → Access Control (Admin Tab)

Introduce a single admin surface that governs who can use the Annual Review "All Employees / Assisted Submission" directory and at what scope. Today access is derived automatically by the SQL resolver `public.annual_review_directory_access(uid)` and gated only by two `app_settings` flags editable via DB. This adds a UI on top of that resolver — the resolver stays the single source of truth (SSOT), the new tab just becomes the admin-facing writer/reader.

## Scope

Consolidates into **one** new tab under the Admin area:
1. Global kill-switches (toggle Assisted + Directory Search on/off).
2. Per-user overrides (grant, restrict, or block a specific employee).
3. Scope viewer (read-only inspector of who currently gets what and why).
4. Audit log of every access-control change.

Out of scope: changing the auto-derivation rules (Admin, hr_pms, HR BU, BU Head, HOD, Reporting/Skip Manager). Those remain untouched.

## Risk & Impact Report

- **Data Impact:** Adds one new table (`annual_review_directory_overrides`) + one audit table. No existing schema changed. Existing `app_settings` rows updated in place through UI (no new columns).
- **Workflow Impact:** Resolver `annual_review_directory_access` extended to layer overrides on top of automatic grants. Existing grants preserved; overrides only add, elevate, or explicitly deny.
- **UI/UX Impact:** New tab; no existing screen changes. Sidebar entry gated by admin role.
- **Regression Risk:** Medium — the resolver is on the hot path for Team Annual Review search, Assisted submission, and RLS helper `can_access_annual_review_instance_for_assistance`. Mitigation: overrides table starts empty; behavior is identical to today until an admin writes a row. Full unit tests around the resolver's precedence order.
- **Scalability Impact:** Overrides table is small (bounded by admin edits). Resolver already `STABLE`; adding one LEFT JOIN on `user_id` is O(1) per call.
- **Rollback:** Additive migration — drop new table + revert resolver to prior definition. Kill-switch UI can be hidden via feature flag `admin_ar_access_control_ui`.

## Plan

### 1. Data model (migration, additive only)

`public.annual_review_directory_overrides`
- `user_id uuid PK` → `profiles.id`
- `override_type text` — one of `grant_all`, `grant_bu`, `grant_team`, `deny`
- `business_unit_ids uuid[]` — used when `override_type = 'grant_bu'`
- `can_assist boolean default true` — separately toggles Assisted submission for this user
- `reason text not null`
- `created_by uuid`, `created_at`, `updated_at`

`public.annual_review_access_audit`
- `id`, `actor_id`, `target_user_id`, `action` (`kill_switch_toggled`, `override_upserted`, `override_deleted`), `before jsonb`, `after jsonb`, `created_at`

Both with GRANTs (`authenticated`, `service_role`), RLS: only admins/`hr_pms` can read/write; audit table is insert-only for admins, read-only for admins/`hr_pms`.

### 2. Resolver update

Rewrite `public.annual_review_directory_access(uid)`:
- Step 1: check override with `deny` → return `{can_access:false}`.
- Step 2: check override with `grant_all` / `grant_bu` / `grant_team` → return that scope (BU list from override).
- Step 3: fall through to existing automatic rules (admin, hr_pms, HR BU, BU Head, HOD, Reporting/Skip subtree) — unchanged.
- Add `can_assist` to the returned JSON so client & `can_access_annual_review_instance_for_assistance` can enforce it.

Keep signature stable; add fields only.

### 3. Admin UI — new tab

Route: `/admin/annual-review/access-control` (also surfaced as a tab inside the existing Annual Review admin area).

Component tree (all under `src/pages/admin/annualReview/AccessControl.tsx`):

- **Kill-switches card** — two `Switch`es reading/writing `app_settings.annual_review_directory_search_enabled` and `app_settings.assisted_self_submission_enabled`. Save writes an audit row.
- **Auto-derived access viewer** — read-only searchable table: for a selected employee, show *why* they currently have access (Admin / hr_pms / HR BU / BU Head of X / HOD of Y / Manager with N reports / none). Backed by a new `get_annual_review_access_explain(uid)` RPC that returns the trace.
- **Overrides table** — CRUD grid of `annual_review_directory_overrides`. Columns: Employee, Override Type, BU Scope, Assisted, Reason, Set By, Set At, Actions. "Add Override" opens a dialog with employee combobox (reuse `OrgFilterCombobox`), override type select, BU multi-select (when `grant_bu`), Assisted toggle, mandatory Reason textarea.
- **Audit log drawer** — last 100 changes from `annual_review_access_audit`.

All mutations pipe through `assertRowsTouched` (per `mem/architecture/security/access-profile-rls-alignment.md`) so RLS denials never look like silent success.

### 4. Client integration

- Extend `useDirectoryAccess()` to surface `canAssist` (already returned by updated RPC).
- `EmployeeDirectorySearch` and Assisted-submission entry points already check `useDirectoryAccess`; no changes needed beyond consuming `canAssist` where they gate the Assist button.
- Add `useAccessControlAdmin()` hook (queries + mutations for the new tab).

### 5. Sidebar / menu

Add a new menu entry `admin-annual-review-access-control` under Admin → Annual Review, gated by `hr_pms` OR `admin`. Register in `menu_registry` via migration.

### 6. Tests

- `src/test/annualReview/directoryAccessOverrides.test.ts` — resolver precedence: deny > grant_all > grant_bu > grant_team > auto rules; `can_assist=false` blocks Assisted even when directory access is granted.
- Extend `src/test/annualReview/directoryAccess.test.ts` with override cases.
- Component test for the new tab covering: kill-switch toggle writes audit row, override upsert requires reason, deny override immediately reflected via cache invalidation.

### 7. Docs / Policy

- Update `mem/features/annual-review/directory-access.md` to describe the override layer and new UI location.
- Add `docs/adr/ADR-144.md` — "Admin-managed Annual Review directory overrides".
- Extend `POLICY.md §AR-DIRECTORY-ACCESS-MATRIX` with the override precedence order and audit requirement.

## Technical details

- Migration order: (a) create tables + GRANTs + RLS, (b) create `get_annual_review_access_explain` RPC, (c) `CREATE OR REPLACE` resolver, (d) seed menu registry row.
- Resolver stays `SECURITY DEFINER STABLE search_path = public`.
- Overrides table has `unique(user_id)` — one active override per user; edits update in place, audit captures `before`/`after`.
- Kill-switch writes go through a new `set_annual_review_access_setting(key text, value boolean, reason text)` RPC so audit is server-side (client can't skip it).
- Feature flag `admin_feature_flags.admin_ar_access_control_ui` (default OFF for production rollout, ON in dev). Sidebar entry hidden when flag off.
- Cache keys to invalidate on any mutation: `['annual-review','directory-access']`, `['annual-review','directory-search']`, `['ar','access-control','*']`.

## Deliverables checklist

- [ ] Migration: 2 tables + GRANTs + RLS + resolver + explain RPC + kill-switch RPC + menu registry
- [ ] `src/pages/admin/annualReview/AccessControl.tsx` + subcomponents
- [ ] `src/hooks/useAccessControlAdmin.ts`
- [ ] `useDirectoryAccess` returns `canAssist`
- [ ] Assist entry points respect `canAssist`
- [ ] Unit tests (resolver precedence + hook)
- [ ] `mem/features/annual-review/directory-access.md` update
- [ ] `docs/adr/ADR-144.md`
- [ ] `POLICY.md §AR-DIRECTORY-ACCESS-MATRIX` update
