# Scoring Ladders — one KPI, different scoring per employee

## What exists today (verified)

- A console KPI node is keyed by **title** (`bu_console_variant_key` builds a second key from description + formula + scoring logic + target). Because that variant key exists, the same metric scored differently per person shows up as "N variants" and gets pulled into the merge/normalise queue — the console currently treats legitimate per-person scoring as drift.
- **Target rules** (`bu_console_target_rules_apply`, ADR-288) already resolve a value per employee by *level, designation, department, manages-people, default*, with priority ordering and respect for hand-tuned rows. But a rule can only set the **target**.
- **Row tuning** (`bu_console_row_override`, ADR-282) already allows per-employee `weightage`, `target_value`, `frequency`, and for numeric KPIs the `R0–R5` bands. Qualitative KPIs keep their ladder group-owned.
- **Org KPI central approval** (registry, approval chains, propagation) already carries one centrally approved value down to mapped employees.

So roughly 60% of the machinery is here; it is split across three features that don't know about each other, and the uniqueness rule fights it.

## Decisions taken

- A KPI is **unique by title**. Description, formula, scoring logic and target may differ per employee without splitting the KPI.
- A ladder tier may set **target, R0–R5 bands, formula/scoring-logic text, and weightage**.
- Cascade targets can be **auto-split from a parent number or typed per tier** — chosen per KPI.
- Roll-up is **configurable per KPI**, and where a KPI is rolled up it reuses the existing **Org KPI central value + approval chain** rather than a new pipeline.

## The design

### 1. Uniqueness moves to title

`bu_console_variant_key` stops contributing to "is this the same KPI". The variant badge, merge proposals and the lookalike scanner key on the normalised **title** only. Definition drift is still visible, but as an informational "3 scoring tiers" chip on the KPI node, not an amber warning, and only when the differences are attributable to a ladder. Untiered KPIs whose text drifted keep the existing "needs normalising" warning, so the clean-up tooling built in ADR-313/315 does not lose its purpose.

### 2. A scoring ladder object

Each console KPI can carry an optional ladder: an ordered list of tiers. A tier is *who it applies to* (reusing the existing target-rule dimensions — level, designation, department, manages-people, explicit employee list, default) plus *what it sets* (target, R0–R5, formula text, scoring-logic text, weightage). Tiers resolve exactly like target rules do today: lowest priority number wins, `default` last, and a hand-tuned employee row still beats the ladder unless the admin explicitly resets tuned rows.

```text
KPI "Plant 100 trees"  (unique by title)
├─ Tier 1  BU Head            target 100   bands 60/80/100   formula "total plantation across BU"
├─ Tier 2  Department Head    target 25    bands 15/20/25    formula "own department plantation"
└─ Tier 3  Everyone else      target 5     bands 3/4/5       formula "individual plantation"
```

### 3. Cascade: auto-split or explicit

Per KPI the admin picks one:
- **Auto-split** — type the parent number once; the system divides it across the tier below, equally or weighted by headcount/weightage, and shows the resulting per-person number in the preview before anything is written.
- **Explicit** — type each tier's number; the system only *validates* that the children sum back to the parent and warns (never blocks) on a mismatch.

### 4. Roll-up reuses Org KPI

Per KPI the admin picks how achievement arrives:
- **Independent** — each employee enters their own value (today's behaviour).
- **Central / rolled up** — the KPI is registered as an Org KPI; one central value moves through the existing approval chain and propagates to every mapped employee, who is then scored against *their own tier's* bands. This is the "one KPI for all, different scoring per person" case, and needs no new approval pipeline.

### 5. Monitoring

The KPI drawer gains a **Ladder** view: tiers as rows, and per tier the headcount, target, achieved (or the central value), tier average score, and the roll-up check (children sum vs parent target). The Performance Console tree shows the tier a person falls in next to their score, so a low score is immediately readable as "missed their own tier target", not "wrong KPI definition". The existing history/audit trail records tier changes like any other definition edit.

## Technical notes

- New table `bu_console_kpi_scoring_tiers` (kpi identity by category + KRA + normalised title, tier priority, match dimension/value, target, r0–r5, formula text, scoring-logic text, weightage, cascade mode, effective month span), with GRANTs, RLS mirroring `bu_console_can_read/can_write`, and an audit row per change.
- New RPCs: `bu_console_ladder_upsert` (dry-run + commit, reusing the existing preview/skip-reason contract), `bu_console_ladder_apply` (writes resolved values into `kpis` rows for a month span, respecting `final_score_locked` and the ADR-323 descriptive/protected classification), `bu_console_ladder_resolve` (pure resolution used by preview and by the drawer).
- `bu_console_target_rules_apply` becomes a thin wrapper over the ladder resolver so there is one resolution path, not two.
- `bu_console_variant_key` is retained for drift reporting but removed from node identity in `bu_console_tree`, `bu_console_definition_search`, `bu_console_generate_merge_proposals`.
- Client mirrors: `src/lib/review/scoringLadder.ts` (pure resolution, mirrors the SQL), `LadderDialog.tsx`, ladder tab in `KpiDetailDrawer.tsx`; `targetRuleModel.ts` folds into the new module.
- Roll-up mode writes into the existing `org_kpi_central_registry` / approval-chain tables — no second propagation path.
- Tests: tier resolution precedence, tuned-row precedence, auto-split arithmetic and remainder handling, roll-up validation warning, locked-row protection, and uniqueness-by-title regression in `kpiVariants.test.ts`.
- Documentation: ADR-324 plus `POLICY §KPI-SCORING-LADDER`, amending `§CONSOLE-VARIANT-NORMALISE` (uniqueness is title-only) and `§KPI-SCOPE-SINGLE-VOCABULARY`.

## Risk and rollback

- **Data**: additive only — a new table plus new RPCs; existing target rules keep working through the wrapper. No historical score is touched; ladder application obeys the existing locked-final-score guard, so closed months (Jul 2025–Jun 2026) cannot move.
- **Regression**: relaxing uniqueness could hide genuine duplicate KPIs — mitigated by keeping the drift report and the merge queue, driven by text similarity rather than by node identity.
- **Rollback**: drop the ladder table and revert `bu_console_variant_key` back into node identity; nothing else depends on it.

## Build order

1. Ladder table + RLS + audit (migration).
2. Resolver RPCs and the target-rule wrapper, with tests.
3. Uniqueness switch to title-only, drift chip, merge-queue re-key.
4. Ladder dialog and drawer tab, cascade preview.
5. Roll-up wiring into Org KPI central approval.
6. ADR-324, POLICY and DOCUMENTATION updates.
