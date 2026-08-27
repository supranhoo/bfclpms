# PIP detail as a full-page screen

Today a PIP opens in a narrow right-side sheet (`PIPDetailSheet`), so long content (reason, areas for improvement, milestones, audit trail) is squeezed into one cramped scrolling column. Move it to a real page.

## What changes for the user

- Clicking a PIP row in **PIP Management** navigates to a full page at `/admin/pip/:pipId` instead of sliding a panel over the list.
- The page uses the standard app header (title "Performance Improvement Plan", employee name + code as description, status badge on the right, Back to PIP list).
- Content is laid out on a wide two-column grid on desktop (single column on mobile):
  - Left/main: Reason for PIP, Areas for improvement, Milestones, Support plan / success criteria, Audit trail.
  - Right/side: Employee details, Duration, Outcome, and a sticky action bar (Submit / Approve / Reject / Complete / Extend / Cancel / Acknowledge) — same actions and same permission rules as today.
- All confirmation dialogs (approve, reject, complete, extend, cancel, milestone update) stay as dialogs and behave exactly as now.
- The URL is shareable and the browser Back button returns to the list with filters preserved.

## Technical notes

- Extract the current sheet body into `src/components/pip/PIPDetailView.tsx` (props: `pipId`, `onClose`). No logic changes — same hooks (`usePIPDetails`, `usePIPAuditLogs`, mutations), same `availableActions` transition SSOT, same loading skeletons.
- New page `src/pages/admin/PIPDetail.tsx` reads `:pipId` from the route, renders `PageHeader` + `PIPDetailView` inside `mx-auto max-w-7xl space-y-6` (mirrors `PIPCreate.tsx`).
- Register lazy route `/admin/pip/:pipId` in `App.tsx` under the same `ProtectedRoute` roles/menuKey as `/admin/pip`; add it to `usePrefetchRoute`.
- `PIPManagement.tsx`: replace `setSelectedPipId` + `<PIPDetailSheet />` with `navigate('/admin/pip/' + id)`; delete the now-unused sheet state.
- Delete `PIPDetailSheet.tsx` once no references remain (it is only used by PIPManagement).
- Layout guardrails: `min-w-0` on grid children and `break-words` on long policy text so nothing scrolls horizontally; sticky action bar respects safe-area padding on mobile.
- Not applicable: schema, RLS, policy changes — this is presentation only.

## Verification

- Open a PIP from the list → lands on `/admin/pip/<id>`, no horizontal scroll at 1280px and 375px.
- Reload the URL directly → page renders with correct data and role-gated actions.
- Run each action dialog once on a draft/pending PIP to confirm unchanged behaviour.
