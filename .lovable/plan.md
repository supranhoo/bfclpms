# Annual Review System — Implementation Plan (Phase 1)

Build a new Annual Review module alongside the existing monthly/quarterly PMS. New tables and routes are isolated under `annual_review_*` / `/annual-review/*`, while reusing existing `profiles`, evidence storage bucket, notifications engine, and the 7-role RBAC for permissions.

---

## Risk & Impact Report

**Data Impact**
- 5 new tables in `public`: `annual_review_cycles`, `annual_review_templates`, `annual_review_assignment_rules`, `annual_review_instances`, `annual_review_responses`. No changes to existing PMS tables.
- New evidence rows live in the existing `evidence-files` / safety bucket pattern under `annual-review/{instance}/{role}/...`.
- Backup coverage is automatic via `get_backup_table_order()` (Core memory) — new tables included by default.

**Workflow Impact**
- Independent from existing PMS workflow (`review_submissions`, `workflow_templates`). No status, RLS, or trigger changes to existing engine.
- Reviewer chain is **snapshotted at instance creation** (manager_id, skip_id, bu_head_id columns on `annual_review_instances`) so mid-cycle org changes don't break the review. Initial resolution uses `profiles.reporting_manager_id`.

**UI/UX**
- New top-level menu entry "Annual Review" guarded by Profile-Based Menu Access (mem rule).
- Reuses shadcn/ui, semantic tokens, ConfirmDestructiveDialog (Core), `is_active=false` user filtering (Core).

**Regression Risk**
- Low. Module is namespace-isolated. No edits to PMS hooks, scoring logic, or notification triggers; we only enqueue into the existing notifications dispatcher.

**Mitigation**
- Vitest unit tests for scoring math, eligibility evaluator, translation resolver, RLS smoke test via dummy users.
- Feature-flag gate via `admin_feature_flags` row `annual_review_enabled` (default false) so we can dark-launch.

---

## Step-by-Step Plan

### Step 1 — Database migration (single migration)
Tables, GRANTs, RLS, `advance_annual_review_status` RPC, `updated_at` triggers, feature flag row, menu_registry entry.

Key schema deltas vs the blueprint:
- `annual_review_instances` adds `manager_id uuid`, `skip_id uuid`, `bu_head_id uuid`, `hr_id uuid` (snapshotted chain), plus `language_pref text default 'en'`.
- `annual_review_responses` adds `evidence` jsonb (`[{path,name,size,mime}]`) — reuses existing storage bucket, no new bucket.
- All status checks use a Postgres enum `annual_review_status` rather than text CHECK (per PLpgSQL Standards memory).
- `has_role` (existing security-definer) used in RLS to avoid recursion.

**Verification:** `supabase--linter` clean; manual SELECT/INSERT smoke as authenticated and admin roles.

### Step 2 — Types, constants, hooks, services
- `src/types/annualReview.ts` — Cycle, Template (sections JSONB types), Instance, Response, Rule.
- `src/lib/reviewConstants.ts` — score color map (0–5), stage labels, status badge palette.
- `src/services/annualReview/annualReviewService.ts` — typed wrappers for all CRUD + RPC + storage signed-URL helper.
- `src/hooks/useAnnualReview.ts` — TanStack Query hooks (`useCycles`, `useTemplate`, `useInstance`, `useSaveResponseDraft` with 2s debounce, `useSubmitResponse`, `useAdvanceStatus`, `useUploadEvidence`, `useFinalizeInstance`).
- `src/hooks/useTranslation.ts` — language resolver with static hi/es dictionary + dynamic template translations.

**Verification:** Vitest covers debounce, weighted score, eligibility operators, translation precedence.

### Step 3 — Shared components (`src/components/annual-review/`)
`AnnualReviewStatusBadge`, `AnnualReviewStageTracker`, `CriteriaScoringMatrix` (math ribbon + circular 0–5 + bottom evidence block), `SystemScoresPanel`, `SystemScoresUploadDialog` (SheetJS via `xlsx` — already in deps; verify before adding), `HrFinalizationSheet`, `LanguageSwitcher`, `CoachingNoteCallout`.

### Step 4 — Pages (`src/pages/annual-review/`)
- `EmployeeAnnualReview.tsx` — self-review tab; stepper + read-only system scores + criteria matrix + qualitative fields + autosave indicator + submit confirm modal.
- `TeamAnnualReview.tsx` — 1/3 list + 2/3 detail desktop; mobile collapses list and opens Sheet/Drawer. Side-by-side prior responses.
- `AnnualReviewAdmin.tsx` — 4 tabs (Progress, Cycles, Templates builder with self-review field CRUD + reordering + multilingual settings, Rules) + HR Finalization Sheet + XLSX bulk upload.

### Step 5 — Routing, menu, feature flag
- Register `/annual-review`, `/annual-review/team`, `/annual-review/admin` in `App.tsx`.
- Insert into `menu_registry` (gated by feature flag + role: Employee sees self, Manager/Skip/BU sees team, HR/Admin sees admin).
- Notifications: enqueue into the existing notifications engine on each status advance.

### Step 6 — Tests + docs
- `src/test/annualReview/*.test.ts` — scoring math, eligibility evaluator, translation hook, RLS contract (mocked).
- Update `DOCUMENTATION.md` (architecture section) + `POLICY.md` (annual review workflow rules) + ADR-090.
- Save `mem://features/annual-review/overview` describing snapshot chain, scoring formula, feature-flag gate.

---

## UI Changes Summary

| Where | What changes | Interaction |
|---|---|---|
| Top nav (role-gated) | New "Annual Review" entry | Routes to `/annual-review` |
| `/annual-review` | Employee self-review page | Stepper, system scores read-only, criteria scorecard, qualitative fields, autosave footer, submit modal |
| `/annual-review/team` | Reviewer portal | Desktop split (1/3 sidebar + 2/3 detail); mobile collapses to drawer |
| `/annual-review/admin` | HR console with 4 tabs | Progress grid + drawer finalize sheet, cycle scheduler, template builder, rule editor, XLSX upload |
| All views | Status badges + stage tracker | Semantic colors matching reviewConstants |

Responsiveness: every page works ≥360px wide; admin tables use sticky headers and horizontal scroll on mobile.

---

## Technical Details

**Status enum**
```
annual_review_status: not_started, pending_self, pending_manager, pending_skip, pending_bu, pending_hr, completed
```

**RLS summary**
- Cycles/Templates/Rules: read for `authenticated`; write for `admin` + `hr_pms` via `has_role`.
- Instances: employee sees own row; reviewers see rows where they are the snapshot manager/skip/bu/hr; admin/hr full. Update gated by `overall_status` matching reviewer's stage.
- Responses: reviewer sees own; chain above sees subordinates'; employee sees all once `completed`.

**RPC**
```sql
advance_annual_review_status(p_instance_id uuid, p_reviewer_role text) returns text
-- SECURITY INVOKER; verifies caller is the snapshotted reviewer for current stage, locks the matching response row, advances overall_status, enqueues notification for next role.
```

**Scoring (lib/scoring.ts)**
```
total_criteria   = Σ (weight_i * score_i)
max_criteria     = Σ (weight_i * 5)
system_total     = Σ system_scores  (already-weighted)
overall          = system_total + total_criteria   // capped at 100
```

**Eligibility evaluator** — generic `evaluate(operator, actual, expected) -> boolean` covering `equals | not_equals | gt | gte | lt | lte`.

**Translation precedence** — `currentLang === defaultLang` → fallback; else `template.translations[lang][key]` → static `UI_I18N[lang][key]` → fallback.

**Phase-2 (not in this plan)** — SLA cron edge function, escalation banners, reports & comparison charts. Schema reserves fields for them; we will plan separately.

---

## Rollback Strategy

- Feature flag `annual_review_enabled = false` instantly hides UI without DB rollback.
- Migration is additive only; a single down-migration drops the 5 tables, enum, RPC, menu rows, and feature-flag row.

---

After approval, Step 1 (migration) ships first and waits for your approval before Steps 2–6 are written.
