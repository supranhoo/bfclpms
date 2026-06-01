# Configurable KPI Final Score Rules

Adds an admin-configurable rule that decides how `review_submissions.final_score` is computed at approval time, with a new **Final Score Rules** tab inside `System Settings → Workflow Config`. Default behavior (last-completed terminal stage wins) is preserved unless a rule is explicitly configured.

---

## 1. Current Final Score Derivation (analysis)

Today there are **two converging paths** that stamp `final_score`:

1. **Client-side approval writes** (e.g. `useAdminDataEntry.ts`, `useBulkReview.ts`, `BulkReviewDashboard.tsx`, `useReviewSubmission.*`):
   - When the workflow advances to `approved`, the score being entered at that stage is written directly into `final_score` in the same upsert.
   - There is also a post-upsert "recompute" branch that picks the current stage score.

2. **Server-side cascade** in migrations (`bulk_write_stage_scores`, `bulk_finalize_stage`, repair RPCs):
   - `COALESCE(rs.final_score, rs.management_score, rs.auditor_score, rs.hr_pms_score, rs.skip_level_score, rs.manager_score, rs.self_score)` — i.e. terminal/highest-completed stage wins.

3. `final_rating` is then derived from `final_score` by a generic CASE band (red/yellow/green/blue), enforced by a clamp trigger in `20260325091641`.

4. Display-only fallback chain lives in `src/lib/carriedScoreResolver.ts` and `src/hooks/useEmployeeScoresForPeriod.ts` — these read scores, they do **not** stamp `final_score`. They will keep working unchanged because they only run when `final_score` is NULL.

**Key files / functions that currently decide `final_score`:**

| Layer | File / RPC | Role |
|---|---|---|
| Client | `src/hooks/useAdminDataEntry.ts` (≈L245–L386) | Stamps `final_score` on approval + recompute branch |
| Client | `src/hooks/useBulkReview.ts` | Bulk approve preview/write |
| Client | `src/pages/review/BulkReviewDashboard.tsx` | Mgmt bulk approve |
| Client | `src/components/review/BulkSignoffPreview.tsx` | Preview cascade |
| Client | `src/lib/carriedScoreResolver.ts` | Display-only cascade (read path) |
| RPC | `public.bulk_write_stage_scores` | Server cascade COALESCE |
| RPC | `public.bulk_finalize_stage` (mgmt approve) | Server COALESCE |
| RPC | Repair/reconciliation scripts in `data-repair-engine` | Backfill `final_score` |
| Trigger | `clamp_final_score` (`20260325091641`) | Bounds + recomputes `final_rating` |

---

## 2. Proposed Data Model (minimal, additive)

Two new tables + four nullable columns on `review_submissions`. No destructive change.

```sql
-- A. Rule definition (versioned, immutable snapshot via JSONB)
CREATE TABLE public.workflow_final_score_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL CHECK (scope_type IN ('template','employee','department','pms_grade')),
  scope_value text,                       -- NULL when scope_type='template' (uses template_id)
  workflow_template_id uuid NOT NULL REFERENCES public.workflow_templates(id),
  review_period text,                     -- NULL = applies ongoing
  review_year   int,
  rule_type text NOT NULL,                -- enum below
  stage_weights jsonb,                    -- e.g. {"manager":60,"skip_level":40}
  missing_score_policy text NOT NULL DEFAULT 'block'
                       CHECK (missing_score_policy IN ('block','ignore','zero')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- B. Resolution log (audit trail of which rule produced each final_score)
ALTER TABLE public.review_submissions
  ADD COLUMN final_score_rule_type text,
  ADD COLUMN final_score_rule_snapshot jsonb,        -- frozen rule at approval time
  ADD COLUMN final_score_explanation text,
  ADD COLUMN final_score_calculated_at timestamptz;
```

**Rule type enum (string, not pg enum, so additions don't need migrations):**

`terminal_stage` (default / current behavior), `self_final`, `manager_final`, `functional_manager_final`, `skip_level_final`, `hr_pms_final`, `auditor_final`, `management_final`, `hr_calibration_final`, `mgmt_calibration_final`, `avg_manager_skip`, `avg_self_manager_skip`, `avg_all_completed`, `weighted_custom`.

**Resolution precedence (matches workflow-template resolution):**

```text
employee + (period, year)
  → department + (period, year)
  → pms_grade + (period, year)
  → template default (workflow_template_id only)
  → NULL  ⇒ fall back to terminal_stage (current behavior)
```

A SECURITY DEFINER function `public.resolve_final_score_rule(p_employee_id, p_template_id, p_period, p_year)` returns the chosen row.

---

## 3. Proposed UI

**Location:** `System Settings → Workflow Config`. Add a new tab next to existing tabs: **Final Score Rules**.

### 3.1 List view

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Workflow Config                                                              │
│ [Templates] [Departments] [PMS Grades] [Employees] [Final Score Rules ★NEW]  │
├──────────────────────────────────────────────────────────────────────────────┤
│ Filters: Review Period [Jun 2026 ▼]  Scope [All ▼]  Template [All ▼]  [+ New]│
├──────────────────────────────────────────────────────────────────────────────┤
│ Scope     │ Applied To  │ Template       │ Period   │ Rule              │ ⋯ │
│ Template  │ Standard 7  │ Standard 7-stg │ Ongoing  │ Terminal stage    │ ✎ │
│ Dept      │ Operations  │ Standard 7-stg │ Jun 2026 │ Mgr 60% + Skip 40%│ ✎ │
│ Employee  │ E. Sharma   │ Compact 4-stg  │ Jun 2026 │ HR PMS final      │ ✎ │
└──────────────────────────────────────────────────────────────────────────────┘
Empty state: "No custom rules. All approvals use last completed stage."
```

### 3.2 Rule Builder drawer (right-side `Sheet`)

```text
┌─ Configure Final Score Rule ──────────────────────────── × ─┐
│ Context                                                     │
│  Scope: ◉ Template ○ PMS Grade ○ Department ○ Employee      │
│  Applied To:  [searchable Select]                           │
│  Review Period: [Jun ▼] [2026 ▼]  ☐ Ongoing                 │
│  Workflow Template: Standard 7-stage  (auto from scope)     │
│  Stages in this template:                                   │
│   Self → Manager → Func. Mgr → Skip → HR PMS → Audit → Mgmt │
├─────────────────────────────────────────────────────────────┤
│ Rule Type  (RadioGroup, grouped)                            │
│  ─ Single-stage ──                                          │
│   ○ Last completed stage (default, current behavior)        │
│   ○ Self  ○ Manager  ◐ Func. Mgr (disabled — not in wf)     │
│   ○ Skip  ○ HR PMS   ○ Audit  ○ Management                  │
│   ○ HR Calibration   ○ Mgmt Calibration                     │
│  ─ Averages ──                                              │
│   ○ Avg of Manager + Skip                                   │
│   ○ Avg of Self + Manager + Skip                            │
│   ○ Avg of all completed reviewer stages                    │
│  ─ Weighted ──                                              │
│   ● Custom weighted rule                                    │
├─────────────────────────────────────────────────────────────┤
│ Stage Weights  (only when Weighted selected)                │
│  ┌────────────────────┬──────────┬────────────┐             │
│  │ Stage              │ Include  │ Weight %   │             │
│  │ Self               │ [ ]      │   [  ]     │             │
│  │ Manager            │ [✓]      │   [ 60]    │             │
│  │ Functional Manager │ [—] N/A  │     —      │             │
│  │ Skip Manager       │ [✓]      │   [ 40]    │             │
│  │ HR PMS             │ [ ]      │   [  ]     │             │
│  │ Audit              │ [ ]      │   [  ]     │             │
│  │ Management         │ [ ]      │   [  ]     │             │
│  └────────────────────┴──────────┴────────────┘             │
│  Total: 100% ✓                                              │
│                                                             │
│  Missing reviewer score:                                    │
│   ◉ Block approval  ○ Treat as 0  ○ Ignore & renormalise    │
├─────────────────────────────────────────────────────────────┤
│ Live Preview (sample scores)                                │
│  Self 3.5 · Manager 4.0 · Skip 3.5 · HR — · Audit —         │
│  → 4.0×60% + 3.5×40% = 3.80   Rating: Green                 │
│  "60% Manager + 40% Skip Manager = 3.80"                    │
├─────────────────────────────────────────────────────────────┤
│                                  [Cancel]  [Save Rule]      │
└─────────────────────────────────────────────────────────────┘
```

UI behaviour rules:
- Stages absent from the selected template are rendered disabled with an inline "Not in this workflow" badge.
- `N/A` KPIs never reach this resolver — `final_score` stays NULL (see §6).
- Saving validates: total = 100, at least 1 stage included, no negative weights, every included stage is in the template.
- A neutral banner at the top of the tab: "Default behavior (last completed stage) applies wherever no rule is configured."

---

## 4. Resolver Function Design (single SSOT)

New file `src/lib/finalScoreResolver.ts` — **pure, no I/O**, identical input/output contract to the SQL twin.

```ts
export type FinalScoreRuleType =
  | 'terminal_stage' | 'self_final' | 'manager_final'
  | 'functional_manager_final' | 'skip_level_final' | 'hr_pms_final'
  | 'auditor_final' | 'management_final'
  | 'hr_calibration_final' | 'mgmt_calibration_final'
  | 'avg_manager_skip' | 'avg_self_manager_skip'
  | 'avg_all_completed' | 'weighted_custom';

export interface FinalScoreResolveInput {
  stageScores: Partial<Record<WorkflowStage, number | null>>;
  workflowStages: WorkflowStage[];        // stages actually in the effective template
  rule: { type: FinalScoreRuleType; stage_weights?: Record<WorkflowStage, number>;
          missing_score_policy: 'block'|'ignore'|'zero' } | null;
  isNa?: boolean;
}

export interface FinalScoreResolveResult {
  final_score: number | null;
  final_rating: RatingLevel | null;
  rule_type_used: FinalScoreRuleType;
  stage_weights_used?: Record<WorkflowStage, number>;
  explanation: string;
  missing_warnings: string[];
  blocked?: { reason: string };
}
```

A **mirror PL/pgSQL function** `public.fn_resolve_final_score(p_submission_id, p_rule jsonb)` returns the same shape so all server RPCs (`bulk_write_stage_scores`, `bulk_finalize_stage`, repair tools) can call it.

All write paths are refactored to:
1. Call `resolve_final_score_rule(...)` to fetch the effective rule (or NULL).
2. Call `fn_resolve_final_score(...)` to compute.
3. Persist `final_score`, `final_rating`, `final_score_rule_type`, `final_score_rule_snapshot`, `final_score_explanation`, `final_score_calculated_at`.

When `rule IS NULL` the resolver returns `terminal_stage` behavior — byte-identical to today's `COALESCE` cascade.

---

## 5. Approval / Reconciliation Paths That Must Call the Resolver

| Path | Current location | Change |
|---|---|---|
| Single-row reviewer approval | `useReviewSubmission*` hooks | Use resolver before stamping `final_score` |
| Admin Data Entry approve/recompute | `src/hooks/useAdminDataEntry.ts` L245–L386 | Replace direct score writes with resolver result |
| Bulk sign-off | `bulk_write_stage_scores` RPC | Use `fn_resolve_final_score` |
| Management bulk approve | `bulk_finalize_stage` RPC + `BulkReviewDashboard.tsx` | Same |
| Repair / backfill | `data-repair-engine` RPCs | Same; gated behind explicit admin trigger only |
| Sent-back / step-back | `workflow-resilient-status-stepback` RPCs | Clear `final_score*` columns (unchanged semantics) |

Reports (`EmployeePerformanceSummary`, `WorkflowResolutionReport`, KPI matrix etc.) keep reading `review_submissions.final_score` — **no report-side recomputation**.

---

## 6. Backward Compatibility & Risks

| Risk | Mitigation |
|---|---|
| Historical `final_score` rewritten | Resolver only runs at approval time or via explicit Admin "Recalculate" tool. Migration backfills `final_score_rule_type='terminal_stage'` for existing approved rows without touching `final_score`. |
| Weighted rule with missing stage score | `missing_score_policy` decides: block (default), zero, or renormalize. Block surfaces a toast and prevents `approved` transition. |
| N/A KPIs | Resolver short-circuits when `is_na=true` → `final_score=NULL`. Matches POLICY §88. |
| Template without a configured stage | Stage is filtered from weights at resolve time; if weights become empty → block. |
| Rule change mid-cycle | Snapshot stored in `final_score_rule_snapshot` per submission — past approvals stay tied to the rule they were approved under. |
| Reports drift | Reports continue reading stored `final_score`; no parallel calculation. |
| Performance | Rule fetch is one indexed lookup per submission (cached per `(employee, template, period)` in the client). |

---

## 7. Test Plan

Unit (`src/test/finalScoreResolver.test.ts`):
- Default → terminal_stage matches today's `COALESCE` for all 7 stage combinations.
- Each single-stage rule returns that exact score.
- `avg_manager_skip` / `avg_self_manager_skip` / `avg_all_completed` average correctly, ignore NULL.
- `weighted_custom` — 60/40, 50/25/25, 10/40/30/20 produce expected values.
- Missing score policies: `block` returns `blocked`, `zero` substitutes 0, `ignore` renormalizes.
- Stages not in workflow are dropped from weights.
- `isNa=true` → null/null/no rule applied.
- `final_rating` band maps to red/yellow/green/blue.

Integration:
- Admin Data Entry approval with each rule type writes correct `final_score` + snapshot.
- Bulk approve via `bulk_write_stage_scores` produces identical results to the TS resolver (parity test).
- Step-back clears all `final_score_*` columns.
- Reports unchanged: snapshot of `EmployeePerformanceSummary` row counts pre/post migration is identical for already-approved data.

UI:
- Rule builder validation: total ≠ 100 disables Save with inline error.
- Stages outside template are disabled.
- Live preview matches resolver output.
- Empty state renders when no rules exist.

---

## 8. Acceptance Criteria Mapping

All criteria in the request are covered: configurable per scope with precedence, default unchanged, validation = 100%, stages bound to workflow, single resolver shared by approve/bulk/reconcile, reports untouched, historical safety, N/A handled.

---

## 9. Out of Scope (explicit)

- Bulk retroactive recalculation of historical approvals (separate Admin tool, future).
- New rule types beyond the listed enum.
- Per-KPI-category rules (only per workflow scope as requested).