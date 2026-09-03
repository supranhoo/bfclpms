# Verify and finish: View option on auditor-submitted KRAs

## What the code says now

The card in your screenshot is `src/components/review/MobileKpiCard.tsx` (used on the
dashboard audit view for tablets — 834px counts as tablet). After the last change it
already renders a labelled "View" button next to the **Fwd** badge and next to the
**N/A** badge, replacing the old badge-only / eye-icon-only markup.

Your screenshot still shows the old shape: N/A with a bare eye icon, Fwd with no control
at all. That is exactly the pre-fix markup, which suggests the preview was still serving
the older bundle when the shot was taken — not a second code path. That is unconfirmed,
so verifying it is step 1, not an assumption to build on.

## Plan

1. **Reproduce live at 834x855 in the audit view.** Drive the running preview with an
   authenticated session, open the same employee scorecard, and capture the action area
   of a Forwarded row and an N/A row.

2. **If the View button is present** — report back with the screenshot; the remaining work
   is only a hard refresh on your side. Nothing further to change.

3. **If it is still missing**, continue the root cause from the live DOM rather than guessing:
   - check whether the row takes a different branch than `isForwarded` (log the resolved
     `viewType` and `kpi.status` for that row),
   - check whether the button renders but is clipped by the card's action container or
     pushed out by the horizontal overflow visible at the top of your screenshot,
   - check whether `onView` is undefined on this surface (explore/read-only mode passes
     different handlers), which would suppress the button by design.
   Then fix the specific cause found, in presentation code only.

4. **Regression guard.** If step 3 finds a real cause, extend
   `src/tests/reviewerReopenAffordance.test.tsx` to cover it, and append the finding to
   `docs/adr/ADR-355.md`, DOCUMENTATION.md and roadmap.md.

## Scope and risk

Presentation only. No schema, RLS, RPC, workflow or scoring change; who may edit a KPI
stays governed by `canReviewKpi`. Rollback is a revert of the touched component files.
