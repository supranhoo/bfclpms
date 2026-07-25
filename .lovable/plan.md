
## Goal

Give admins a Settings surface to control the "My role" scope chips (Any / Dept Head / BU Head / Manager / Skip / HR / Management) shown on the **Team Annual Review → My Queue** page, per the highlighted row in the screenshot. Two capabilities:

1. **Default chip** — which scope is pre-selected when a user lands on the page (currently hardcoded to `Any`).
2. **Accessibility** — which chips are allowed to render for each role; disallowed chips are hidden even if the user has instances under them.

Also let each user override the default for themselves (sticky per-browser).

## Where the setting lives

Annual Review Admin → **Access Control** tab (already home to ADR-144 directory kill-switch, capability matrix, and Management backfill). New card: **"My Queue — scope chips"**.

## Risk & Impact

- **Data:** additive JSON columns on `app_settings` and one new nullable `team_queue_default_scope` on `profiles` (user override). No schema breakage.
- **Workflow:** display-only. Server-side RPC filters (`scope`) are unchanged — hiding a chip does not restrict what a user can query directly via URL; enforcement stays at the reviewer-id level in `get_my_annual_review_queue` (unchanged).
- **UI/UX:** `TeamAnnualReview.tsx` gains one hook read; if disabled/empty, current behavior is preserved. `showScopeRow` still hides the row for single-role users.
- **Regression:** low. Default `allowed_scopes = null` = "all" (today's behavior). Default `default_scope = 'any'` (today's behavior).
- **Mitigation:** feature-flagged behind existing `app_settings` row; unit tests on the resolver; Playwright smoke on Team Annual Review render.

## Plan

### 1. Storage (migration)

- Extend `app_settings` (single-row table) with:
  - `team_queue_default_scope text` — one of `any | manager | skip | dept | bu | hr | management`. Default `'any'`.
  - `team_queue_allowed_scopes jsonb` — array of scope keys the UI is allowed to render. `null` = allow all.
  - `team_queue_role_overrides jsonb` — optional per-role map, e.g. `{ "manager": { "default": "manager", "allowed": ["any","manager"] } }`. `null`/missing key = fall back to the two fields above.
- Extend `profiles` with `team_queue_default_scope text NULL` (user-level override; user-writable via a lightweight RPC or RLS `UPDATE own row` on that column only).
- GRANT + RLS: read `app_settings` = authenticated (already the pattern). Write = admin/hr_pms only.

### 2. Resolver (pure, testable)

New `src/lib/annualReview/teamQueueScopeConfig.ts`:

```
resolveTeamQueueScopeConfig({
  role, appSettings, profileOverride, roleCounts
}) -> { defaultScope, allowedScopes }
```

Precedence: `profileOverride` > `role_overrides[role]` > global fields > current defaults. Always intersects `allowedScopes` with roles the user has count > 0 (so we never show an empty chip).

Unit tests cover: no config, admin-defined default with allowed subset, per-role override, invalid values fall back safely, chip user selected is preserved even if newly disallowed (grace: still visible while selected, mirrors today's rule at line 180).

### 3. Wire into `TeamAnnualReview.tsx`

- Replace hardcoded `urlScope ?? 'any'` init with resolver output.
- Filter `visibleScopeFilters` through `allowedScopes`.
- Add a small "Set as default" link next to the chip row that writes `profiles.team_queue_default_scope` for the current user (toast on success). Hidden if admin disallows overrides.

### 4. Admin UI (Access Control tab)

New card "My Queue — scope chips" with:

- Global **Default chip** dropdown (Any / Dept Head / BU Head / …).
- Global **Allowed chips** multi-select (checkbox list; "All" = clear).
- **Per-role overrides** table: rows for `manager`, `skip_level`, `hr_pms`, `management`, `auditor`, `admin`; each row = default dropdown + allowed multi-select + "Reset" button.
- **Allow user override** toggle (controls whether the "Set as default" affordance renders in the queue UI).
- Save button writes a single `app_settings` row; audit event `annual_review.settings.team_queue_scope_updated` with actor + diff.

### 5. Docs & policy

- ADR-164 — "Team Annual Review scope-chip configurability".
- POLICY §AR-TEAM-QUEUE-SCOPE-CONFIG — precedence rules, override semantics, note that this is display-only and does not weaken RLS.
- Memory: `mem/features/annual-review/team-queue-scope-config.md` describing knobs and default behaviors.

### 6. Tests

- `teamQueueScopeConfig.test.ts` — resolver precedence & fallbacks.
- `TeamAnnualReview.render.test.tsx` — chip visibility given admin config + role counts.
- Playwright smoke: admin sets default = "Dept Head", allowed = ["any","dept","bu"] → BU-Head user loads queue → Dept Head chip is preselected, Manager chip is hidden.

## Not in scope (call out)

- Server-side enforcement of "allowed scopes" (URL param bypass). Add later if a security review demands it; today it's a UX/organisation control, not an access boundary.
- Changing the reviewer resolution or the `get_my_annual_review_queue` RPC contract.
- Renaming chips (Dept Head / BU Head labels stay as-is).

## Rollback

Migration is additive. Rollback = drop the two columns and remove the Admin card; UI falls back to `any` default and full chip list automatically because the resolver treats missing config as "today's behavior".
