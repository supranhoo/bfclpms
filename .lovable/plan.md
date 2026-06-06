## Goal
Add the missing **Timeline** (audit-trail) entry-point to the Bulk Review cell drawer so reviewers can inspect the full per-KPI workflow history — exactly like the Unified Scorecard.

## Why
`KpiReviewPanel` already renders a "Timeline" button when its parent passes an `onOpenTimeline` handler. Unified Scorecard wires this up to `<KpiTimeline …/>`. `BulkCellDrawer` (line 231–255) calls the same `KpiReviewPanel` but **does not pass** `onOpenTimeline`, `onOpenFullHistory`, or `onOpenQueryHistory`, so those entry-points disappear. The user's screenshot confirms — the drawer shows Review Journey, KPI History, Observations, but no Timeline button.

## Scope
UI wiring only. No data, RPC, RLS, schema, or business-logic changes. Pure additive.

## Risk & Impact
- Data Impact: none
- Workflow Impact: none — read-only modal
- UI Impact: a "Timeline" button appears in the drawer's Review Journey header (same component, same icon, same behaviour as Unified Scorecard)
- Regression Risk: minimal — the modal already ships and is used elsewhere with identical props
- Backup/Rollback: revert one file edit

## Technical Plan

### `src/components/review/BulkCellDrawer.tsx`
1. Import `KpiTimeline` from `@/components/dashboard/KpiTimeline`.
2. Add local state `const [timelineOpen, setTimelineOpen] = useState(false)`.
3. Pass `onOpenTimeline={() => setTimelineOpen(true)}` to the existing `<KpiReviewPanel …/>` (line 231).
4. Render `<KpiTimeline isOpen={timelineOpen} onClose={() => setTimelineOpen(false)} kpi={detail.data?.kpi ?? null} workflowStages={…same array already computed for KpiReviewPanel…} />` at the end of the drawer body (sibling to the existing Sheet content).
5. Reset `timelineOpen` to `false` when the drawer's `open` prop flips to `false` (in an existing or new `useEffect`) so it doesn't linger across rows.

## Out of Scope
- Adding `onOpenFullHistory` / `onOpenQueryHistory` (separate UX surfaces; the user only flagged Timeline). Can be a follow-up if requested.
- Restyling the Review Journey header.

## Verification
1. Open Bulk Review → click any cell → drawer opens → **Timeline** button visible in Review Journey header.
2. Click Timeline → audit-log modal opens with the same content as Unified Scorecard's Timeline.
3. Close drawer, open another row → Timeline state is clean.
4. No new console errors; existing Vitest suite still passes.

## Tests
Lightweight wiring assertion — assert `BulkCellDrawer` renders a button labelled "Timeline" when `KpiReviewPanel` exposes one (smoke-render with a minimal fake row). Skip if existing test infra for the drawer is too heavy; visual verification covers it.

## Docs
- `DOCUMENTATION.md` — Bulk Review section: note Timeline parity with Unified Scorecard.
- `mem://features/review/unified-scorecard-component` — append one line noting BulkCellDrawer now matches.
