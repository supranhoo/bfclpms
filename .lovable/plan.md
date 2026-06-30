
## Symptom

Auditor toast: **"Write skipped — self_not_submitted"** on the Bulk Review cell for Jyoti Prakash Dwivedi → *Implement 5S practices* (May 2026), even though:

- Self has submitted (Self tile shows Value 2, "2S Achieved")
- Manager has already approved (Value 2, Rating 2, "Approved.")
- The "Current" stage is Manager Check; auditor is the next stage

## Root cause (DB-verified)

`review_submissions.a68e9d59-80b5-4781-a821-a388e5cf904c` actual row:

| column | value |
|---|---|
| `self_score` | **NULL** |
| `self_achieved_value` | 2 |
| `self_remarks` | "2S Achieved" |
| `submitted_at` | 2026-06-05 12:48 UTC |
| `manager_score` | 2.00 |
| `manager_achieved_value` | 2 |
| `manager_rating` | red |

In `public.bulk_write_stage_scores(...)` (migration `20260629090420_*.sql`, lines 173–187) the gate is:

```sql
ELSIF NOT p_is_override AND v_cur.self_score IS NULL THEN
  v_reason := 'self_not_submitted';
```

This conflates **"self stage submitted"** with **"self stage computed a numeric `self_score`"**. For this Org-KPI / Employee row the Self stage was submitted via `self_achieved_value` + `self_remarks` (qualitative / propagated Org KPI path); `self_score` is never populated until rating is derived later. Worse, the Manager already wrote a score on top of it (`manager_score = 2.00`), proving Self is complete — yet the bulk RPC still skips the Auditor write.

The single-cell auditor write path doesn't use this guard, which is why per-cell submissions work elsewhere and only Bulk Review trips it.

## Risk & impact

- **Data:** Read-only RCA; the proposed fix only widens the "self submitted" predicate. Cannot create or overwrite scores that other guards (`final_locked`, `auditor_takes_precedence`, `row_version_conflict`, RLS) already protect.
- **Workflow:** Restores auditor bulk writes for every Org KPI and every qualitative KPI whose Self stage stores `self_achieved_value`/`self_remarks` without a numeric `self_score`. No change to the single-cell path.
- **Regression:** New predicate is strictly *more permissive than today's broken check, strictly more restrictive than "no guard at all"*. It still blocks rows where Self has truly never submitted (no self_score, no self_achieved_value, no self_remarks, AND no downstream score exists).
- **Scalability:** Same row already locked `FOR UPDATE`; we only widen a boolean — zero added IO.
- **Backup:** No schema change. `bulk_write_stage_scores` is a function; functions are part of the database object set already covered by the existing backup pipeline.

## Plan (single migration + tests + docs)

### 1. Migration — `CREATE OR REPLACE` `public.bulk_write_stage_scores(...)`
- Add `self_achieved_value`, `self_remarks`, `submitted_at`, `functional_manager_score` to the `SELECT … INTO v_cur` clause.
- Replace the self-submitted guard with:
  ```sql
  ELSIF NOT p_is_override
        AND v_cur.self_score              IS NULL
        AND v_cur.self_achieved_value     IS NULL
        AND NULLIF(btrim(COALESCE(v_cur.self_remarks,'')),'') IS NULL
        AND v_cur.submitted_at            IS NULL
        AND v_cur.manager_score           IS NULL
        AND v_cur.functional_manager_score IS NULL
        AND v_cur.skip_level_score        IS NULL
        AND v_cur.hr_pms_score            IS NULL
  THEN
    v_reason := 'self_not_submitted';
  ```
  Rationale: any one of these signals proves Self has submitted (or a downstream stage has already accepted Self, which would be impossible otherwise).
- No other guard/branch/audit-log/return shape changes — surgical edit per project knowledge §3.

### 2. Repair check (read-only verification only — no data write)
Re-query the affected row after migration to confirm bulk auditor write now proceeds (manual retry by user from the same UI).

### 3. Unit + integration tests
- `src/test/bulkWriteStageScoresSelfSubmittedGuard.test.ts` — pure TS mirror of the predicate covering 6 cases:
  1. `self_score` set → allowed
  2. `self_achieved_value` set, score null → allowed (this bug)
  3. `self_remarks` set, no value/score → allowed
  4. Only `manager_score` set (Self snapshot lost in legacy data) → allowed
  5. All self/downstream signals null → blocked with `self_not_submitted`
  6. `p_is_override = true` → always allowed (existing semantic preserved)

### 4. Documentation
- `DOCUMENTATION.md` → §"Bulk Review skip taxonomy" amend the `self_not_submitted` row to document the multi-signal definition of "self submitted".
- `POLICY.md` §"Bulk Review benign skip reasons" → clarify that `self_not_submitted` means **none** of `{self_score, self_achieved_value, self_remarks, submitted_at, downstream stage score}` are present.
- New ADR `docs/adr/ADR-102.md` — title: *Bulk Review "self submitted" predicate widened beyond numeric self_score* — capturing the bug, fix, and rejected alternatives (a. silently NULL→0 on bulk write — rejected, hides data quality; b. block auditor stage entirely for Org KPIs — rejected, contradicts ADR-067 propagation model; c. lift the guard altogether — rejected, re-opens write-before-self path).

### 5. Rollback strategy
Migration is `CREATE OR REPLACE`. Rollback = re-run the previous body from `20260629090420_*.sql`. No data shape change → zero-cost rollback.

### Out of scope (deliberately)
- Why `self_score` is NULL on Org-KPI / qualitative rows in the first place (separate ADR-067 / qualitative-rating flow — file a follow-up issue if needed).
- Single-cell auditor path (already works, do not touch).

## What I need from you to start

Approve this plan; on approval I'll open the migration in `supabase--migration` for your review, then write tests + ADR + docs in the same step.
