Phase 15: Safety mobile polish pass
=====================================

## What this does
- Replaces ad-hoc `Loader2` full-page spinners with `SafetySkeletonBlock variant="detail"` on: SafetyIncidentDetail, SafetyAuditRunDetail, SafetyDrillDetail, SafetyAnalytics.
- Adds `SafetyStickyActionBar` parity to SafetyDrillNew and SafetyAuditRunNew (mobile-only sticky CTA, desktop footer preserved behind `hidden md:flex`).
- Zero schema / RLS / RPC / writer changes. Pure presentational consistency.

## QA Sign-Off (2026-05-30)
- All 46 safety + mobile-layout tests pass; build passes.
- In-button micro-spinners (per-action pending state) intentionally preserved.
- Existing `safetyMobileLayout.test.tsx` contract continues to enforce sticky-bar / skeleton invariants.
- Rollback: revert the 6 file edits (no migration).