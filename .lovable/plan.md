# Fix: honor `template_override_id` end-to-end in Annual Review scoring

## Root cause (verified against DB)

`public.compute_annual_review_weighted_score(instance_id, reviewer_role)` — the SSOT that stamps `annual_review_responses.weighted_score` on every submit — joins:

```sql
JOIN annual_review_templates t ON t.id = i.template_id   -- ❌ ignores override
```

Every other layer (UI form, criteria card, stage_weights_v2 → stage_weights map, `resolveStageWeights`, `computeFinalScore`, exports, progress grid) reads the **effective** template = `COALESCE(template_override_id, template_id)`. This drift silently mis-scores every instance that has an override.

Concrete evidence — test003 (`e35bbe35…`):

| Field | Value | Effect |
|---|---|---|
| `template_id` | Blue-Collar Comprehensive Review | criteria `reviewer_stages` = self/manager/skip/bu/hr (**no dept_head**) |
| `template_override_id` | Generic W with env | criteria include dept_head; `stage_weights_v2 = {system:35, criteria:65}`, `criteria_mix = {dept_head:70, bu_head:30}` |
| Dept Head submission | all 10 criteria = 5 | RPC scores against Blue-Collar → dept_head not listed → **`weighted_score = 0`** |
| Self / BU Head | scored, but against Blue-Collar weights (10/5/10/…) not Generic W env's weights (15/20/20/…) | numbers are wrong even where non-zero |

Blast radius: any instance where `template_override_id IS NOT NULL`. Rating, `Final /100`, Excel/PDF exports, `EmployeeResultsView`, running-final-score card — all downstream numbers are wrong for these users.

## Fix strategy

Change the SSOT — do NOT paper over in UI. Then rescore existing bad rows.

### 1. Migration: patch the SSOT

Rewrite `public.compute_annual_review_weighted_score` so it uses the effective template:

```sql
JOIN annual_review_templates t
  ON t.id = COALESCE(i.template_override_id, i.template_id)
```

Nothing else in the function changes. Search-path, `STABLE`, and signature preserved.

Audit the other three functions that also touch `i.template_id`:

- `create_or_get_annual_review_instance` — must keep using `template_id` for the *initial* seed (override is applied afterwards); leave as-is.
- `set_annual_review_template_override` — writes the override column; correct.
- `block_when_annual_cycle_closed` — only reads cycle metadata; irrelevant.

No other function needs changing (verified by full `pg_proc` scan).

### 2. Migration: rescore existing responses affected by override

For every `annual_review_responses` row whose instance has a non-null `template_override_id`:

```sql
UPDATE annual_review_responses r
   SET weighted_score = public.compute_annual_review_weighted_score(r.instance_id, r.reviewer_role)
  FROM annual_review_instances i
 WHERE i.id = r.instance_id
   AND i.template_override_id IS NOT NULL;
```

Same call as the on-submit trigger, so results are identical to what a fresh submission would stamp. Log the row count in the migration description for audit.

### 3. Client-side parity check (defensive, tiny)

`src/lib/annualReview/finalScore.ts` (and any other TS reader) already prefers the override; grep confirms this in the four call sites. No functional change needed there. Add one unit test asserting that when `template_override_id` is set, `resolveEffectiveTemplateId(instance)` returns the override — locks the invariant so it can't regress.

### 4. Server-side parity contract

Add a SQL comment on `compute_annual_review_weighted_score` documenting the invariant:

> Resolves criteria against `COALESCE(template_override_id, template_id)`. Any new SQL that needs the effective template MUST use `public.annual_review_effective_template_id(instance_id)` (new helper) or the same COALESCE inline. Do NOT re-introduce a bare `i.template_id` join for scoring paths.

Create the tiny helper:

```sql
CREATE OR REPLACE FUNCTION public.annual_review_effective_template_id(p_instance_id uuid)
RETURNS uuid LANGUAGE sql STABLE SET search_path=public AS $$
  SELECT COALESCE(template_override_id, template_id)
    FROM public.annual_review_instances WHERE id = p_instance_id
$$;
```

Not used inside `compute_annual_review_weighted_score` (kept inline for perf), but callable from future functions and from ad-hoc admin queries so the pattern is discoverable.

## Verification (post-migration)

Run in this exact order:

1. `SELECT public.compute_annual_review_weighted_score('e35bbe35…','dept_head');` → expect **325** (10·5 + 5·5 + 10·5 + 10·5 + 5·5 + 5·5 + 5·5 + 5·5 + 5·5 + 5·5 = 5 × 65 weights = 325), not 0.
2. Same for `self` → expect **325** (all 5s under Generic W env's 65-weight criteria set), replacing the stored 255 (which came from Blue-Collar weights).
3. Same for `bu_head` → expect **325**, replacing 275.
4. Reload `/annual-review/admin`: test003 row shows Self 5.0, Dept 5.0, BU 5.0 (rating = 325 / 65 = 5.0). Final /100 blends via 35% system + 45.5% dept + 19.5% bu.
5. Advance the workflow — dept_head stage submit / send-back paths already go through `enabledChain` SSOT and are unaffected.
6. `pnpm vitest run` green including the new `resolveEffectiveTemplateId` test.

## Risk & Impact

- **Data:** rewrites `weighted_score` for every response on override instances. Numbers change from wrong to correct. Store `previous_weighted_score` snapshot in a one-shot audit table (`annual_review_rescore_audit_2026_07`) so the change is reversible.
- **Workflow:** none — status transitions, `enabled_stages`, and RPC signatures unchanged.
- **UI/UX:** admin grid, exports, employee results and running-final-score card show corrected numbers automatically (they already read `weighted_score`).
- **Regression:** low. Fix is one JOIN and a set-based UPDATE. No API surface change.
- **Rollback:** revert the SSOT to the previous body + `UPDATE r SET weighted_score = a.previous_weighted_score FROM annual_review_rescore_audit_2026_07 a WHERE a.response_id = r.id`.

## Not in scope

- Any UI presentation change (already handled by prior `/5` rating work).
- Changing `enabled_stages`, template assignment, or org-head resolution.
- Backfilling instances that have `template_override_id IS NULL` — they were always computed correctly.

## Documentation & policy sync (mandatory)

- `POLICY.md` — new subsection §AR-EFFECTIVE-TEMPLATE-SSOT: "Every read that maps a response to criteria/weights (SQL or TS) MUST use the effective template = `COALESCE(template_override_id, template_id)`. Bare `template_id` reads are reserved for provenance/audit only."
- `DOCUMENTATION.md` — Annual Review scoring diagram updated; add version-log entry: "Fixed template_id vs template_override_id drift in compute_annual_review_weighted_score; rescored existing override instances."
- `mem/features/annual-review/overview.md` — one-line note under scoring bullet.
- New ADR: `docs/adr/ADR-106.md` capturing the drift, fix, and rescore migration.
