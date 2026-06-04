## Archived 2026-06-04 — see ADR-072
The publish-unstick plan succeeded and is now archived. Production was
restored by three concurrent factors (forced republish, flag flip,
override clear). Single-factor sufficiency is NOT proven and will not be
tested in production.

Authoritative references:
- `docs/adr/ADR-072.md` — Menu/Sidebar 3-factor restoration RCA + I1–I4
- `POLICY.md` §Menu-CAPA
- `mem/features/admin/menu-setting-capa` — removal criteria
- `src/test/menu/` — 5-file regression suite locking the invariants

The historical unstick plan follows for reference only; do not re-run.

---

## Goal (historical)
Unstick the greyed-out **Publish → Update** button and ship the pending frontend changes (sidebar fix marker `2026-06-04b`) to `pms.bfclalloys.com`. The live bundle `index-CjfF6RVN.js` contains neither `data-capa-build` nor `2026-06-04`, confirming the publish pipeline is stuck on an old deployment despite multiple source edits.

## Root cause
Lovable's publish dialog computes a diff against the last deployed commit. For reasons on the platform side, it currently believes there is no diff even though the source clearly differs from the deployed bundle. Editing `AppSidebar.tsx` alone has not flipped the Update button to enabled.

## Approach
Make a **larger, multi-file, guaranteed-visible diff** that the publish pipeline cannot dedupe, then ask the user to refresh the Lovable editor tab before clicking Update (the disabled state itself can be a stale React state in the editor UI).

## Steps

1. **Add a visible build-stamp diff across 3 files** (no behavior change):
   - `index.html` — add/replace a `<meta name="build-stamp" content="2026-06-04-r3">` tag in `<head>`.
   - `src/components/layout/AppSidebar.tsx` — bump marker to `2026-06-04-r3` and add a short comment line above it.
   - `src/main.tsx` — add a single `console.info("[build] 2026-06-04-r3")` at top of file.
   Three small touches in three different files virtually guarantees the platform sees a non-empty diff.

2. **User action (cannot be done from the agent):**
   - **Hard-refresh the Lovable editor tab itself** (Ctrl/Cmd-Shift-R on `lovable.dev`), not just the preview. This clears any stale "no changes" state in the publish dialog.
   - Open Publish → click **Update**. If still greyed, click the small refresh icon next to the Update button (if present) or close + reopen the dialog.

3. **Verify the deploy actually shipped** by checking the live bundle hash:
   - `curl -s https://pms.bfclalloys.com/ | grep index-`
   - The hash should change from `index-CjfF6RVN.js` to something new.
   - The new bundle should contain `2026-06-04-r3`.

4. **Verify in browser:**
   - Hard refresh `pms.bfclalloys.com/dashboard`.
   - DevTools → Elements → search `build-stamp` (meta tag) and `data-capa-build`.
   - DevTools → Console → look for `[build] 2026-06-04-r3`.
   - If all three are present, the deploy is live. The sidebar should then populate for admin (since `menu_overrides_enabled=false` already returns hardcoded items in the latest source).

## Decision gate
- **If after step 1 the Update button enables** → user clicks Update, we verify in step 3.
- **If the Update button is still greyed even after editor hard-refresh and 3-file diff** → this is a Lovable platform bug, not something further code changes can fix. I will direct the user to Lovable support with the deployment id `eb8a7840-5649-4cea-a73e-cfc16dfadf5d` and the source-vs-bundle mismatch evidence.
- **If Update fires but bundle hash does not change** → publish pipeline is silently failing; same escalation path.
- **If bundle hash changes and marker appears but sidebar still empty** → bundle is fresh; I will then add a hard static admin sidebar fallback that bypasses `useMenuAccess` entirely.

## Out of scope
- No data, schema, RLS, or business-logic changes.
- No changes to `useMenuAccess` or menu resolver in this step — that work only runs if step 4 proves the bundle is fresh and the sidebar is still empty.
- No DNS / Cloudflare / custom-domain changes (confirmed not the cause).

## Risk
- Three tiny additive edits with no runtime impact. Fully reversible by deleting the lines. No regression risk.
