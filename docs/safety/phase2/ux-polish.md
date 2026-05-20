# Phase 2 — Safety UX Polish

Closes the three `Candidate / Phase 2` rows in `docs/safety/phase0/gap-checklist.md`:

| Surface | Gap | Status |
|---|---|---|
| Permits list / detail | Loading skeletons | Done |
| Permits / New | Sticky action bar parity | Done |
| Assets list / detail / new | Skeleton + empty-state coverage + sticky bar | Done |

## Changes

### New primitive
- `src/components/safety/SafetySkeletonBlock.tsx` — sanctioned skeleton
  placeholder. Two variants:
  - `variant="list"` for list/table pages (configurable `rows`, default 6).
  - `variant="detail"` for detail pages (header card + 2 content cards).

### Extended primitives
- `SafetyResponsiveList` and `SafetyDataTable` now accept an optional
  `loadingSkeleton?: ReactNode` prop. When provided and `isLoading` is
  true, it replaces the legacy centred spinner. All other callers stay
  on the spinner — fully backward compatible.

### Page wiring
- `SafetyPermits.tsx` — passes `<SafetySkeletonBlock variant="list" />`.
- `SafetyAssets.tsx` — passes `<SafetySkeletonBlock variant="list" />`.
- `SafetyPermitDetail.tsx` — first-load skeleton via
  `<SafetySkeletonBlock variant="detail" />`; not-found card branch
  unchanged.
- `SafetyAssetDetail.tsx` — same detail-skeleton swap.
- `SafetyPermitNew.tsx` — desktop in-flow buttons wrapped in
  `hidden md:flex` and mirrored under `<SafetyStickyActionBar>` for
  parity with `SafetyIncidentNew.tsx`.
- `SafetyAssetNew.tsx` — same desktop/mobile mirror pattern.

## Risk & Impact

| Vector | Assessment |
|---|---|
| Data | None — no schema, RPC, or query changes |
| Workflow | None — same mutation handlers, same validation, same role gates |
| UI/UX | Consistent across Incidents / Permits / Assets New screens; skeleton replaces spinner flash |
| Regression | Low — extension props are additive and optional |

## Verification

- `bunx vitest run src/test/safety` — green.
- Manual:
  - `/safety/permits` and `/safety/assets` show skeleton rows on first
    fetch instead of spinner.
  - `/safety/permits/:id` and `/safety/assets/:id` show detail-skeleton
    before data arrives; the "not found" card still appears when
    appropriate.
  - `/safety/permits/new` and `/safety/assets/new` show the sticky
    action bar on mobile (≤768px) and the original in-flow buttons on
    md+.

## Out of scope

- Stage-aware copy / day-grouped timeline / RCA polish (Phase 3).
- Conflict UX / queue inspector / per-file evidence retry (Phase 4).
- Analytics cards & trend charts (Phase 7).
- Non-Safety pages — general Skeleton refactor is not part of this phase.