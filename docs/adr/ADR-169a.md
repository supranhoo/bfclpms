# ADR-169a — Schema-truth reset for completed-review supersede

Date: 2026-07-25
Status: Accepted

## Context

The completed-review **Edit workflow & reviewers** path failed in sequence on
two columns that do not exist on `annual_review_instances`:
`weighted_final_score`, then `completed_at`. The first correction removed only
the first reported column, allowing the second mismatch to surface.

The live completion contract uses `finalized_at` and `finalized_by`.

## Decision

The supersede reset writes only verified instance columns and clears:

- `total_score`
- `final_rating`
- `criteria_weighted_score`
- `finalized_at`
- `finalized_by`

The reset remains transactional. Responses are archived only for stages that
are actually removed; responses for retained stages stay locked and preserved.
Canonical role/status mappings remain unchanged.

## Verification

`supersedeResetColumns.test.ts` resolves the final chronological function
migration and rejects either phantom column. It also locks the complete reset
set, canonical Dept/BU statuses, and retained-stage response behavior.

## Consequences and rollback

No rows are changed by deployment. A successful supersede intentionally clears
final aggregates and finalization ownership before reopening. Rollback restores
the preceding function definition, but would reintroduce the save failure.