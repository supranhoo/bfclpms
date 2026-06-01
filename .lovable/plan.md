## One-time backfill of missing `kpi_audit_logs` stage rows — Jan 2026 → present

Approved scope: **A** (Jan 2026 → present, ~6,363 affected KPIs) + **X** (anchor timestamps only to fields that physically exist in `review_submissions`; never fabricate).

### What "deep search, no assumption" means in this run
The migration runs against the *live* gap set, not a snapshot. Two `WHERE NOT EXISTS` guards make the operation safe and re-runnable:
1. The KPI row has a real score in `review_submissions` for that stage.
2. No `kpi_audit_logs` row already exists for that KPI in the action-key family below.

Every value written is **copied verbatim** from `review_submissions`. Nothing is computed, inferred, or estimated.

### Risk & Impact Report
- **Data Impact:** INSERT-only into `kpi_audit_logs`. ~20K new rows expected. Zero rows updated or deleted across all tables. `review_submissions`, `kpis`, `performance_reviews`, `workflow_config`, `org_kpi_*`, scores, ratings, remarks, statuses, `final_score`, evidence URLs — all untouched.
- **Workflow Impact:** None. No RPC, trigger, RLS policy, or workflow_config row is modified. The 6 new `BACKFILL_*` action keys are additive vocabulary.
- **UI/UX Impact:** `KpiTimeline.tsx` `actionConfig` gains 6 entries (same icon/colour as canonical counterparts, label suffixed " (backfilled)"). `groupTimelineEvents` (`mem://architecture/database/kpi-audit-logs-canonical`) continues to collapse cascades correctly because `BACKFILL_*` rows have distinct human-action semantics, not cascade semantics.
- **Regression Risk:** Very low — pure additive INSERT with action keys outside the canonical workflow vocabulary, so no report RPC, scoring formula, or status aggregator filters on them.
- **Scalability Impact:** ~20K inserts inside a single transaction. Verified `kpi_audit_logs` already holds 100K+ rows; PG handles this in seconds. Single `idx(kpi_id, action)` already supports the NOT EXISTS guard.
- **Mitigation:** Idempotent guards · single transaction · explicit `run_id` UUID in metadata for one-line rollback · per-stage row count assertion in verification step.

### Timestamp policy (X) — exactly what gets written
Per-stage rule, sourced only from `review_submissions`:

| Stage | `created_at` | `metadata.timestamp_known` |
|---|---|---|
| Self | `submitted_at` (real) | `true` |
| Manager / Skip-L / HR PMS / Auditor / Mgmt | `submitted_at` (anchor) | `false` *unless* this stage is the **last completed** stage for the KPI, in which case `created_at = updated_at` and `timestamp_known = true` |

"Last completed stage" is determined dynamically by inspecting which `*_score` column is the highest in the canonical workflow order that is non-null for that KPI. No fabrication of `+N minutes`.

### Action vocabulary (additive, never collides with canonical)
`BACKFILL_SELF_REVIEW_SUBMITTED`, `BACKFILL_MANAGER_REVIEWED`, `BACKFILL_SKIP_LEVEL_REVIEWED`, `BACKFILL_HR_PMS_REVIEWED`, `BACKFILL_AUDITOR_REVIEWED`, `BACKFILL_MANAGEMENT_REVIEWED`.

Each row carries:
```
performed_by = NULL                        -- per Core: automated → NULL
old_value    = NULL
new_value    = jsonb_build_object(
  'stage_score',  rs.<stage>_score,
  'stage_rating', rs.<stage>_rating,
  'achieved_value', rs.<stage>_achieved_value,
  'stage_remarks', rs.<stage>_remarks,
  'status',       <canonical status literal>
)
metadata = jsonb_build_object(
  'source',                'submission_backfill',
  'reason',                'historical_import_gap_jan2026_onwards',
  'run_id',                '<single UUID generated at migration start>',
  'timestamp_known',       <bool>,
  'observed_submitted_at', rs.submitted_at,
  'observed_updated_at',   rs.updated_at
)
```

`new_value->>'status'` uses the canonical vocabulary required by `mem://architecture/database/kpi-audit-logs-canonical`: `self_review`, `manager_check`, `skip_level_check`, `hr_pms_review`, `audit`, `management_review`.

### Plan steps

```text
Step 1 — Migration (single transaction)
  ├─ BEGIN
  ├─ SELECT gen_random_uuid() INTO v_run_id
  ├─ INSERT kpi_audit_logs … FROM review_submissions rs JOIN kpis k
  │     WHERE k.review_year >= 2026 AND <month >= Jan 2026>
  │       AND rs.self_score IS NOT NULL
  │       AND NOT EXISTS (canonical or backfill row already present)
  │     [one INSERT per stage: Self, Manager, Skip-L, HR PMS, Auditor, Mgmt]
  ├─ Verification asserts inside same TX:
  │     • row count delta matches gap-scan totals (±0)
  │     • SELECT count(*) FROM review_submissions snapshot diff = 0
  │     • SELECT count(*) FROM kpis status diff = 0
  └─ COMMIT  (or ROLLBACK on any assertion failure)

Step 2 — UI registration (KpiTimeline.tsx)
  └─ Add 6 entries to actionConfig, suffix label " (backfilled)",
     reuse existing canonical icon/colour for each stage.

Step 3 — Tests
  ├─ src/test/kpiTimelineBackfillActions.test.ts
  │     • renders all 6 BACKFILL_* keys with " (backfilled)" suffix
  │     • verifies they pass through groupTimelineEvents as human actions, not cascades
  └─ Extend src/test/bugBountyFixes.test.ts with BUG-0xx regression
     proving review_submissions scores are unchanged after backfill (snapshot diff = 0)

Step 4 — Documentation sync (SAME generation step as code)
  ├─ DOCUMENTATION.md → Version History v2.<next>:
  │     "One-time backfill of missing per-stage audit log rows
  │      for Jan 2026–present historical import cohort"
  ├─ POLICY.md §<next>:
  │     "BACKFILL_* action keys: provenance-tagged, system-attributed,
  │      copy verbatim from review_submissions, never alter scores/ratings/status,
  │      timestamps only when physically available."
  └─ CHANGELOG_2026.md current week row.
```

### Rollback (single statement)
```sql
DELETE FROM kpi_audit_logs
 WHERE action LIKE 'BACKFILL_%'
   AND metadata->>'run_id' = '<the uuid from Step 1>';
```

### Out of scope (explicitly will NOT happen)
- No changes to scores, ratings, remarks, achieved values, statuses, `final_score`, evidence URLs, RLS, triggers, RPCs, workflow_config, or backup denylist.
- No back-dating of canonical action keys (`SELF_REVIEW_SUBMITTED`, `MANAGER_FORWARDED`, etc.). Only the new `BACKFILL_*` family is written.
- No re-computation or interpolation of any value.
- No fabrication of timestamps that don't exist in source data.
- Sep–Dec 2025 cohort (2,646 KPIs) **not** touched — outside Jan-2026 governance cutoff (`mem://infrastructure/database/migration-governance`). Can be addressed in a separate approved run if you decide later.

### Post-run verification queries (will be reported back to you)
1. Per-stage delta count matches the pre-scan gap totals.
2. `review_submissions` row-level checksum before vs after = identical.
3. `kpis.status` distribution before vs after = identical.
4. Spot-check Murthy's KPI `7d203837-…`: timeline now shows Self → Manager → Skip-L → HR PMS → Auditor with the existing live `AUDITOR_REVIEWED` (2026-06-01) row intact.

Awaiting your approval on this plan to proceed.