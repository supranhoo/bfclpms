---
name: Annual Review status/enabled_stages invariant
description: ADR-200 — overall_status may never point at a stage absent from enabled_stages; re-anchor SSOT and self-healing trigger
type: feature
---

`annual_review_instances.overall_status` (any `pending_*`) MUST always name a
stage present in `enabled_stages`. Otherwise the reviewer gets routed to a form
whose submit raises `stage X is not enabled for this instance`.

## SSOT
- SQL: `public.annual_review_reanchor_status(p_enabled jsonb, p_status)` — nearest
  ENABLED stage at/after the current one, else nearest before, else NULL.
- TS mirror: `src/lib/annualReview/reanchorStatus.ts`
  (`reanchorStatus`, `isDeadEndStatus`, `roleForStatus`).
- `annual_review_first_pending_status` covers all 7 stages (dept_head and
  management were missing before ADR-200).

## Enforcement
Trigger `tg_ar_status_within_enabled_stages` (BEFORE INSERT OR UPDATE OF
overall_status, enabled_stages) self-heals by re-anchoring and logs
`annual_review.deadend_reanchor`. It raises only when no stage is enabled.
Never write a stage-contraction routine that mutates `enabled_stages` without
re-anchoring — the trigger is a safety net, not the mechanism.

## Repair history
2026-07-29: 4 instances (101851, 101769, 101149, 100010) stuck at `pending_dept`
with `enabled_stages = [self, bu_head]` after the 2026-07-23 BU-terminal dedup +
ADR-127b reversal. Advanced to `pending_bu`; 100010's dept_head response
re-labelled `bu_head` (same reviewer 102050). Snapshot:
`annual_review_dept_deadend_repair_2026_07`.
