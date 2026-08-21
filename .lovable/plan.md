# Observation reply attachment — "Upload failed: new row violates row-level security policy" (101715)

## Assumptions
- Reporter is Jitendra Bharti (101715, manager, active, has a login).
- The failure happens when adding an attachment to an observation **reply** (Attachments 0/3 box), not when posting the reply text.

## What the reads confirmed
- Reply attachments go to the private `review-evidence` bucket at path `<auth-user-id>/<observationId>/observation-replies/<timestamp>_<name>.<ext>` (`MultiFileUpload.tsx`, `ObservationReplyThread.tsx`).
- The only matching storage INSERT policy is `Users can upload their own evidence files`: `bucket_id = 'review-evidence' AND auth.uid()::text = (storage.foldername(name))[1]`.
- The bucket has no size or MIME restriction (limits are client-side only: 2 MB, JPEG/PNG/PDF/Excel).
- The path prefix the UI builds comes from the React `user` object, not from the live session.
- Uploads for other users and other folders succeeded the same day, and `observation-replies` has 466 objects historically — so the folder and policy are not globally broken. This is session/actor specific.

## Root cause (primary hypothesis — must be confirmed as step 1)
The uploader trusts the in-memory React `user.id` for the folder prefix. When the browser's access token has expired (or the refresh silently failed after a long-idle tab), the client still renders a "signed-in" user, but the request reaches Postgres with `auth.uid() = NULL`. The WITH CHECK comparison then fails and storage returns exactly "new row violates row-level security policy".

### 5-Why
1. Why did the upload fail? The storage INSERT policy rejected the row.
2. Why was it rejected? `auth.uid()` did not equal the first path segment.
3. Why did they differ? The path was built from cached client state while the request carried no/stale identity.
4. Why did the client keep cached state? The auth context does not re-validate the session before privileged writes and does not sign out on refresh failure.
5. Why did nobody notice? The error is surfaced verbatim as "Upload failed", with no diagnosis, no session recovery and no retry — so it looks like a permission bug rather than an expired session.

## Fix plan
1. **Confirm the cause** — reproduce with an artificially expired token in a Playwright run against the reply box, and add one-off structured logging (`status`, `hasSession`, `uidMatchesPrefix`) so the next real occurrence is self-diagnosing.
2. **Identity from the session, not from React state** — in `MultiFileUpload.uploadFile`, resolve the acting user via `supabase.auth.getSession()` immediately before upload and build the path from that id; abort with a clear message if there is no session.
3. **Recover instead of failing** — on a `42501`/RLS error, refresh the session once and retry the upload a single time; only then fail.
4. **Actionable message** — replace the raw Postgres text with "Your session expired — sign in again to attach files", plus a "Sign in" action, when the diagnosis is a missing/mismatched session. Keep the raw reason in a collapsible detail line for support.
5. **Stop the silent-zombie session** — when the auth context detects a refresh failure, clear state and route to sign-in rather than leaving a stale `user` object.
6. **If step 1 disproves the hypothesis** — the diagnostics will report the observed `auth.uid()` versus the path prefix, and the fix moves to whichever mismatch they show (for example an `upsert` conflict path requiring an UPDATE policy for own-folder objects); no policy is loosened without that evidence.

## Risk & impact
- **Data**: no schema or policy change in the primary path; storage policies stay as strict as today.
- **Workflow**: none — same upload flow, plus one retry.
- **UI/UX**: only the failure toast text and an inline sign-in action change.
- **Regression**: `MultiFileUpload` is shared by self, reviewer, auditor, management, observation and bulk-approval surfaces, so path building must stay byte-identical for the happy path; covered by unit tests on the path builder.
- **Rollback**: single component plus auth-context guard; revertable independently.

## Deliverables
- Unit tests: path built from session id, RLS-error retry-after-refresh, no-session abort, message mapping.
- `ADR-305` (evidence upload session-bound identity), `POLICY.md` entry, `DOCUMENTATION.md` version bump.
