## How the annual review is gated today

Good news: the plumbing already exists. There is a feature flag `annual_review_enabled` in the `admin_feature_flags` table with a polished admin UI at **Admin → System Settings → Feature Flags**. You can pick specific employees by name or employee code and only they will see the module in the sidebar.

**Gap:** the sidebar hides correctly, but the routes themselves (`/annual-review`, `/annual-review/team`, `/annual-review/team/:id`, `/annual-review/calibrate`, `/annual-review/admin`) do NOT enforce the flag. Any employee who knows the URL and has the right role can still deep-link into the page. This must be closed before the pilot goes to real testers.

## Step 1 — Restrict to your pilot users today (no code, ~2 minutes)

1. Open **Admin → System Settings** and switch to the **Feature Flags** tab.
2. Find the `annual_review_enabled` card.
3. Turn the master switch **ON**.
4. Leave the **role** list empty.
5. In **Add user**, search each tester by name or employee code and add them. They appear as removable badges.
6. Click **Save changes**.

Result: only those users (plus admins, who always bypass) will see "My Annual Review" and "Team Annual Review" in the sidebar. Everyone else's sidebar is unchanged.

**To open to everyone later:** clear the user list and clear the role list, keep the switch ON → the flag resolves to "Enabled for everyone".

## Step 2 — Close the deep-link loophole (small code change)

Because `ProtectedRoute` only checks role, not the flag, we need a thin gate around the annual-review routes. Two edits, no schema change:

### 2a. New component `src/components/annual-review/AnnualReviewGate.tsx`
- Calls `useAnnualReviewFlag()`.
- While loading: renders the existing page loading skeleton (matches `mem://design/page-loading-overlay-pattern`).
- If `false`: `<Navigate to="/dashboard" replace />` and shows a one-off toast "Annual Review is in limited pilot".
- If `true`: renders `children`.
- Admins bypass automatically because `is_feature_flag_enabled_for_me` returns `true` for admins.

### 2b. `src/App.tsx` — wrap every `/annual-review*` `ProtectedRoute` child
Wrap the page element (not the guard) so role checks still run first:

```tsx
<ProtectedRoute allowedRoles={[...]}>
  <AnnualReviewGate>
    <MyAnnualReview />
  </AnnualReviewGate>
</ProtectedRoute>
```

Applied to all 5 annual-review routes (`/annual-review`, `/annual-review/team`, `/annual-review/team/:instanceId`, `/annual-review/calibrate`, `/annual-review/admin`). No route additions or removals.

### 2c. Sidebar unchanged
`AppSidebar.tsx:190,411-437` already hides via `useAnnualReviewFlag()` — no change needed.

## Step 3 — Tests
`src/components/annual-review/AnnualReviewGate.test.tsx` (new):
- Renders children when the flag hook returns `true`.
- Redirects to `/dashboard` when the flag returns `false`.
- Renders a loading state (not children, no redirect) while the flag query is pending — prevents a flash-redirect on refresh.

## Step 4 — Docs
- `DOCUMENTATION.md` v2.66.76 — "Annual Review pilot allowlist enforced at the route level."
- `POLICY.md` new clause §AR-PILOT-ALLOWLIST — routes under `/annual-review/*` MUST be wrapped in `AnnualReviewGate`, which delegates to `is_feature_flag_enabled_for_me('annual_review_enabled')`. Sidebar hiding alone is not sufficient. When the flag has any `target_user_ids` or `target_roles`, only that union (plus admins) may access the module.
- `mem://features/annual-review/overview.md` — one-liner referencing the gate + flag key + admin surface.

## Risk & impact

- **Data:** none. No schema, RLS, or RPC change. The `is_feature_flag_enabled_for_me` RPC and `admin_feature_flags` table are already in use by the sidebar.
- **Workflow:** during the pilot only allowlisted employees can enter the module — matches your requirement. Existing sidebar behaviour unchanged.
- **UI:** one extra loading skeleton frame on route entry (~1 tick). No layout change.
- **Regression risk:** low. Additive wrapper; role checks unchanged. If the flag hook errors, the gate treats it as disabled and redirects — safest default.
- **Rollback:** remove the `<AnnualReviewGate>` wrappers in `App.tsx` and delete the component/tests. Flag data in the DB is unaffected.

## Not applicable
Backup coverage, pagination, offline resilience — unchanged.
