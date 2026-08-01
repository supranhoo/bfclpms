# ADR-222a — Exemption penalty rule gets its own dialog

**Date:** 2026-08-01
**Status:** Accepted
**Supersedes:** the combined dialog layout introduced with ADR-222 / ADR-224 (behaviour unchanged)

## Context

`BellCurveConfigDialog` mixed two unrelated policies in one modal:

1. Bell curve **target distribution** and green/amber compliance thresholds (ADR-218).
2. The **exemption penalty rule** applied to employees made eligible via an approved exemption (ADR-222 / ADR-224).

They are owned by different decisions, edited at different times and by different mental models. The single modal was long, and "Save targets" implied the exemption block was part of the target policy.

## Decision

Split into two admin-gated dialogs opened from the Bell Curve Analysis header:

- **Configure targets** → `BellCurveConfigDialog`: band targets, running total, green/amber thresholds, cycle-scope checkbox, `validateConfig`, "Save targets".
- **Exemption penalty** → `ExemptionPenaltyDialog` (new): enable switch, penalty type (`none` | `step_down` | `top_tiers_excluded`), type-specific fields, floor %, the "Effect on each slab" preview, cycle-scope checkbox, "Save rule".

Both are gated by the existing `canConfigure` (Admin / HR PMS) and are available wherever `BellCurveTab` mounts (report + Annual Review Admin tab).

## Invariant

Both dialogs persist to the same `public.annual_review_bell_curve_config` row through `useSaveBellCurveConfig`. Each dialog seeds its draft from the **full** config object and saves it whole, so neither can blank the other's fields. Any future dialog editing this row must follow the same rule (never build a partial payload).

## Non-goals

No change to `applyExemptionPenalty`, `effectiveSlabPercent`, banding, exports, schema, RPCs or RLS. Presentation-only refactor.

## Rollback

Re-inline the exemption block in `BellCurveConfigDialog`, drop `ExemptionPenaltyDialog.tsx` and the header button.
