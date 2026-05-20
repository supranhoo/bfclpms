# Phase 2 — Safety UX Polish (Permits & Assets)

Closes the three `Candidate / Phase 2` gaps from `docs/safety/phase0/gap-checklist.md`:

1. **Permits** — Loading skeletons (Partial → Done)
2. **Permits/New** — Sticky action bar parity (Partial → Done)
3. **Assets** — Skeleton + empty-state coverage (Partial → Done)

Pure presentation work. No schema, RPC, route, or business-logic changes.

## Risk & Impact Report

- **Data Impact**: None.
- **Workflow Impact**: None — same forms, same submit handlers, same role gates.
- **UI/UX Consistency**: Replaces inline `Loader2` spinners with sanctioned skeletons; aligns Permit/New action bar with the Incident/New pattern that already exists.
- **Regression Risk**: Low. Mitigation: keep mutation handlers, validation, and `isPending` wiring untouched; only swap the wrapper markup.

## Scope

### A. Shared primitive (new, small)
Create `src/components/safety/SafetySkeletonBlock.tsx` — a thin wrapper around shadcn `<Skeleton>` exposing two presets:
- `variant="list"` (table-row stack for list pages)
- `variant="detail"` (header + 2 content cards for detail pages)

This gives Permits, Assets, and any future Safety page one sanctioned skeleton, matching the policy "no ad-hoc UI primitives in Safety" rule.

### B. Permits

1. **`SafetyPermits.tsx`** — pass a `loadingSkeleton` slot to `SafetyResponsiveList` (extend the component to accept one and prefer it over the `Loader2` block when provided). Use `variant="list"`.
2. **`SafetyPermitDetail.tsx`** — replace the centred spinner with `<SafetySkeletonBlock variant="detail" />`. Keep the not-found `<Card>` branch intact.
3. **`SafetyPermitNew.tsx`** — wrap the existing Cancel / Save Draft / Submit for Approval buttons in `<SafetyStickyActionBar>`, matching `SafetyIncidentNew.tsx`. Keep the disabled / pending logic identical; only the container changes.

### C. Assets

1. **`SafetyAssets.tsx`** — same `loadingSkeleton` slot wired to `SafetyResponsiveList` (variant `"list"`).
2. **`SafetyAssetDetail.tsx`** — swap centred spinner for `<SafetySkeletonBlock variant="detail" />`; keep the "not found" message branch.
3. **`SafetyAssetNew.tsx`** — wrap the Cancel / Register Asset buttons in `<SafetyStickyActionBar>` for parity with Permit/New and Incident/New. No new validation.

### D. `SafetyResponsiveList` extension
Add optional `loadingSkeleton?: ReactNode`. When provided and `showLoading` is true, render it instead of the existing `Loader2` block. Backward compatible — all current callers keep the spinner if they don't pass the prop.

## Verification

- Rerun `src/test/safety/**` (incident, permit, drill, training, audit, analytics) — must stay green.
- Manual:
  - `/safety/permits` and `/safety/assets` show skeleton rows on first load (no spinner flash).
  - `/safety/permits/:id` and `/safety/assets/:id` show skeleton on first load; not-found card still appears when applicable.
  - `/safety/permits/new` and `/safety/assets/new` show sticky action bar on mobile and desktop, identical to `/safety/incidents/new`.
- Mobile viewport (≤768px) — sticky action bar pinned to bottom; safe-area inset respected (already handled by `SafetyStickyActionBar`).

## Docs to update atomically

- `docs/safety/phase0/gap-checklist.md` — flip the three Phase-2 rows from `Partial` to `Done`.
- New `docs/safety/phase2/ux-polish.md` — record what changed, screenshots/refs, verification steps.
- `.lovable/plan.md` — replace Phase 1.5 closeout with this Phase 2 summary.
- `mem://features/safety/hardening-baseline` (or new `mem://features/safety/ux-polish-phase2`) — note the new `SafetySkeletonBlock` and `loadingSkeleton` slot so future agents don't reinvent.

## Out of scope

- Any non-Safety pages (general Skeleton refactor stays out).
- Stage-aware copy, day-grouped timeline, RCA polish — those are Phase 3.
- Analytics / TRIR / LTIFR cards — Phase 7.
- Conflict UX / queue inspector — Phase 4.
