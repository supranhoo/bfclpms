## Step 1 — DONE
`grant-iac-role` edge function deployed + `iacService.grantRole` routes through it. Vedant (101966) is unblocked.

## Step 2 — "Manage Access" sheet on User Management (per-user cockpit)

**Extract** the existing `PersonDrawer` block (`IdentityAccessConsole.tsx` lines 146–240) into a reusable component:

```text
src/components/admin/UserAccessSheet.tsx
  ├─ Tabs: Roles | Password | Audit
  ├─ Roles tab     → reuse the PersonDrawer body (useIacRoles + useGrantRole + useRevokeAssignment)
  ├─ Password tab  → single-user wrapper around password-rollout edge fn
  │                  • "Generate & email password"   (send_email: true)
  │                  • "Generate without email"      (send_email: false)
  │                  • Last rollout from password_rollout_logs (latest row by user_id)
  │                  • has_real_email / portal_access badges
  └─ Audit tab     → last 20 rows from iac_audit_log filtered by target_id LIKE '<uid>:%'
                     + last 5 from email_change_audit for the same user_id
```

Refactor IdentityAccessConsole's `PersonDrawer` to wrap `UserAccessSheet` so both screens share the exact same UI and behavior — single source of truth.

**Wire into User Management**: in the row action group (line ~910 in `UserManagement.tsx`), add a new icon button "Manage Access" (Shield icon) between the existing Edit and Assign-KRAs buttons. Clicking opens `UserAccessSheet` for that profile. Mobile card view gets the same action.

## Step 3 — Enrich Edit User dialog

Open `UserManagement.tsx` lines ~1040–1200 (edit dialog). Append three collapsible sections AFTER the existing Access & Status block:

1. **Module Access** — read-only chip list of all IAC roles for this user (queried via `useIacAssignments` filtered by user id) + `<Button>Manage in Access sheet</Button>` that opens the same `UserAccessSheet` directly on the Roles tab.
2. **Login & Password** — `has_real_email`, `portal_access`, last login (`auth.users.last_sign_in_at` via existing admin function or `password_rollout_logs` latest). Buttons: "Send password rollout (email)" + "Generate password only" — same handlers as the sheet's Password tab.
3. **Activity** — collapsible, last 5 IAC + email-change audit rows.

Keep all existing fields intact; this is additive. Replace the standalone Reset Password mini-dialog (lines ~935–940 icon + its dialog) with a deprecation note that routes to the new sheet — keep the icon, change its handler to open `UserAccessSheet` on the Password tab.

## Step 4 — Post-create follow-up step

After the "Add User" mutation succeeds (line ~540 area, `handleCreate` success path):
- Don't auto-close the create dialog.
- Swap its contents to a "Next steps" panel showing the new user's name + two cards:
  - "Assign module roles now" → opens `UserAccessSheet` on Roles tab for the new user_id
  - "Send password & credentials now" → opens `UserAccessSheet` on Password tab
- "Done" button closes everything. Skipping is allowed.

## Step 5 — Cross-links

- **IAC Console** Directory rows: add a small "Open in User Management →" link in `PersonDrawer` header.
- **Password Policy** Eligible Users table: per-row "Manage in User Management →" link that deep-links to `/admin/users?manage=<user_id>` and auto-opens the sheet.

`UserManagement.tsx` listens to the `manage` query param on mount and opens the sheet for that user.

---

## Technical notes

- **No schema changes.** Pure UI + reuse of existing hooks/edge functions.
- **password-rollout invocation** from the new sheet uses `supabase.functions.invoke('password-rollout', { body: { user_ids: [id], send_email } })` — exact same shape Password Policy bulk uses.
- **Audit queries**: `iac_audit_log` rows store `target_id` as `<user_id>:<role_id>` for grants and `<assignment_id>` for revokes; filter by `target_id.ilike.<uid>%` to catch both grants and per-user activity.
- **Permissions**: every action is admin-only — UserManagement page is already behind admin route guard, and the edge functions enforce admin themselves.
- **No new memory file needed**; this is reuse, not a new concept. After ship, update `mem://architecture/security/identity-access-console` with one line noting "Per-user cockpit also available from /admin/users via UserAccessSheet."

## Risk & impact

- **Data**: none.
- **Workflow**: net-additive. IAC console and Password Policy remain unchanged.
- **UI regression risk**: low — `PersonDrawer` extraction is mechanical; the IAC console keeps the same import surface.
- **Mitigation**: smoke-test (a) grant role from User Management → confirm same row appears in IAC; (b) password rollout from User Management → confirm `password_rollout_logs` row written; (c) deep-link `/admin/users?manage=<id>` opens the sheet.

## Sequencing

1. Extract `UserAccessSheet` + refactor `PersonDrawer` to wrap it (no behavior change).
2. Add "Manage Access" button + sheet in User Management table & mobile cards.
3. Enrich Edit User dialog with the three new sections.
4. Post-create follow-up panel.
5. Cross-links + `?manage=<id>` deep-link.

Approve and I'll ship 1–5 in order. Each step is independently shippable so you can stop early if needed.