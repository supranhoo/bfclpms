## Issues observed (RCA)

**1. "Edge Function returned a non-2xx status code" toast (Brundaban Chandra Das case)**
- `createUser` mutation uses `supabase.functions.invoke('create-employee', ...)`. When the function returns a non-2xx response with a JSON `{ error: "..." }` body, `supabase-js` discards that body and surfaces only the generic message. The real reason (most likely `Failed to create user: A user with this email address has already been registered`, since `brundaban.das@bfclalloys.com` / employee code `102028` was probably created or partially provisioned earlier) is never shown to the admin.
- Edge function logs confirm the call reached the function and validated the admin user, but no error line was logged — the function exited via one of the `return new Response(JSON.stringify({error}), {status: 4xx/5xx})` branches that don't `console.error`.

**2. Add New User dialog content gets clipped at 1366×768 / 1280×800 laptops**
- `DialogContent` is `max-h-[92vh] overflow-hidden flex flex-col`, and a `ScrollArea` wraps the tab content. On 853px-tall viewports the Organization grid's last row (Employment Status / Location / Reporting Manager) sits exactly where the dialog clips, and the ScrollArea's viewport isn't visibly scrollable — admins resort to browser zoom-out.
- Root cause: the `<Tabs>` wrapper has `flex-1 min-h-0` but the inner `ScrollArea` uses Radix's default that doesn't expose an always-visible scrollbar, so users don't realise they can scroll. Combined with extra footer height (DialogFooter + Tabs list) on shorter screens, the bottom field row is visually cut off with no scroll affordance.

## Fix plan

### A. Surface the real edge-function error (UserManagement → createUser)
1. Replace `supabase.functions.invoke('create-employee', …)` in the `createUser` mutation with the existing `invokeAdminEdgeFunction<…>('create-employee', payload)` helper (`src/lib/adminEdgeFunction.ts`), which already does a raw `fetch`, parses JSON, and throws `new Error(payload.error || payload.message)` on non-2xx. This is the same pattern already used for `password-rollout` and `update-user-email` in the same file.
2. Adjust the success path to read `result.profile` (the helper returns the parsed JSON directly, not `{ data, error }`).
3. Keep the existing `onError` toast — it will now display the actual reason ("A user with this email address has already been registered", "Unknown employee category: …", etc.).
4. No change to the edge function itself (it already returns structured `{ error }` JSON with appropriate status codes).

### B. Make the Add New User dialog usable on 1366×768 / 1280×800 without zoom
Edit only the Add User `DialogContent` block (around line 1963) in `src/pages/admin/UserManagement.tsx`:
1. Replace the Radix `ScrollArea` wrapper with a native `<div className="flex-1 min-h-0 overflow-y-auto pr-2 -mr-2 mt-3">` so a standard browser scrollbar is always visible and the content scrolls reliably inside the dialog.
2. Tighten the dialog chrome on short viewports: change `max-h-[92vh]` to `max-h-[calc(100vh-2rem)]` and add `sm:max-h-[92vh]` so on 768–853px-tall laptops the dialog uses the full available height minus a 16px gutter, leaving the footer + scrollable form fully reachable.
3. Apply the same two changes to the Edit User `DialogContent` (line 1634) for parity — same root cause exists there.
4. No changes to the field layout, labels, ordering, master-data lookups, or business logic.

### C. Tests (regression protection)
- Extend `src/test/userManagement.addUserAccess.test.ts` (or add `src/test/userManagement.createUserError.test.ts`) with a pure-function test that simulates a non-2xx edge-function response and asserts the error message from the response body (`error: "Failed to create user: …"`) is the one thrown — i.e. that we no longer mask it as "non-2xx status code".
- No UI snapshot test for the scroll fix; it is a CSS-only change.

### D. Documentation
- Append a short entry to `docs/adr/` (next free ADR number) covering both fixes, and update `mem/features/admin/non-login-user-provisioning` only if the resulting error wording materially changes the runbook (likely no change needed).
- Add the helper-usage rule ("admin edge-function calls must go through `invokeAdminEdgeFunction` so errors surface") to `POLICY.md` if not already present.

## Files to change

```text
src/pages/admin/UserManagement.tsx       (createUser mutation + 2 DialogContent blocks)
src/test/userManagement.createUserError.test.ts   (new)
docs/adr/ADR-085.md                      (new)
POLICY.md                                (1-line rule, if missing)
```

## Risk & impact

- **Data**: none — no schema or RLS change, no edge-function logic change.
- **Workflow**: none — the create flow is unchanged; only error surfacing and dialog layout improve.
- **UI**: Add User / Edit User dialogs gain a visible scrollbar and use full viewport height on short laptops. No field reordering.
- **Regression risk**: low — `invokeAdminEdgeFunction` is already used for two other admin flows in the same file; swapping the helper is a localised mechanical change. The CSS swap from Radix `ScrollArea` to a native overflow div on this one dialog cannot affect other screens.
- **Rollback**: revert the single file diff; the ADR/test additions are safe to keep.

## Not Applicable
- Pagination, backup coverage, RLS, master-data hardcoding — none touched.

Awaiting approval to implement.