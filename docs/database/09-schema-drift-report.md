# 09 — Schema Drift Report

Comparison axes: live catalog ↔ `src/integrations/supabase/types.ts` ↔ `supabase/migrations/` (885 files) ↔ application code.

## Tables, views, enums — clean

| Axis | Live | types.ts | Drift |
|---|---:|---:|---|
| Base tables | 248 | 248 | none |
| Views + matviews | 11 | 11 | none |
| Enums | 35 | 35 | none |

No table exists in the database that is missing from `types.ts`, and no typed table is missing from the database.

## Functions — 130 missing from `types.ts`

| Category | Count | Assessment |
|---|---:|---|
| Trigger functions (bound to a trigger, `returns trigger`) | 120 | **Expected.** Not exposed over PostgREST. |
| Internal helpers with no app call site | 5 | Expected. |
| **RPCs actively called from the app** | **5** | **Real drift.** |

The five untyped-but-called RPCs:

| RPC | Call site | Root cause |
|---|---|---|
| `bulk_write_stage_scores` | `src/hooks/useBulkReview.ts` | 2 overloads |
| `get_kpi_journey_report` | `src/hooks/useKpiJourneyReport.ts` | 2 overloads |
| `reassign_annual_review_reviewer` | `src/services/annualReview/annualReviewService.ts` | 2 overloads |
| `set_annual_review_enabled_stages` | `src/services/annualReview/annualReviewService.ts` | 2 overloads |
| `transition_safety_incident` | `src/hooks/useSafetyIncidents.ts` (×2) | 2 overloads |

**Confirmed cause:** every one of the five has exactly two overloads in `pg_proc`. The Supabase type generator omits overloaded routines because it cannot express them, so each call site must use `(supabase as any).rpc(...)`. Consequence: argument names, argument types and return shapes for five of the most consequential write RPCs in the system are unchecked at compile time. The `completed_at` phantom-column class of defect (ADR-169a) is exactly what type coverage would have caught.

The fix is not a type-generator workaround — it is to collapse each pair to a single signature with defaulted parameters, then drop the redundant overload, at which point types regenerate automatically.

## Code ↔ schema drift

- `kpi_categories` referenced in `supabase/functions/bulk-zero-score-non-submitters/index.ts` — table does not exist (see F-01).
- No other unknown table reference. (`audit_logs` appears only inside a regression assertion in `src/test/bugBountyFixes.test.ts`; `avatars` is a storage bucket, not a table.)

## Documentation drift

- `src/test/rls-policies.test.ts` asserts `EXPECTED_TABLE_COUNT = 46` and "8 security definer functions". Live values are **248** tables and **375** security-definer functions. The test is self-referential (`expect(46).toBe(46)`) so it passes while documenting a state five-fold out of date.
- `docs/safety/phase1/tickets/T-003-backup-coverage.md` describes a hardcoded 81-table list in `create-backup`. That list is gone — coverage is now RPC-discovered. The ticket is stale and should be closed.
