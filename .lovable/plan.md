
# Phase 19.5 — Increment Eligibility Criteria (System Settings → Scoring)

## 1. Assumptions
- Placement: new card section appended to the existing **Scoring** tab in `src/pages/admin/SystemSettings.tsx` (below Score Calculation Mode / Daily Aggregation cards). No new top-level route.
- Org master tables already in DB: `companies`, `levels`, `locations`, `categories`. Division / Business Unit may exist as text on `profiles` or as dedicated masters — to be confirmed during build (will degrade to free-text "All / —" if no master exists).
- "Assessment Year" is a label like `2025-26`, stored as `text` (no new master needed). The list of available years is derived from existing configs + a rolling N-year window from current fiscal year (July–June).
- Access: Admin and HR PMS only — gated via existing role guard on the System Settings page.
- This phase delivers **configuration storage + evaluator + UI**. The Increment Calculation Engine / Increment Calculation Report is a follow-up phase that will consume the evaluator output (§7).
- Approval workflow scaffolded but **OFF by default** in v1 (Save Draft + Publish only). A system setting flag toggles Submit→Approve later.

## 2. Clarifications (please confirm before build)
1. **Division / Business Unit source** — dedicated masters, or text columns on `profiles`? If text, dropdown options are derived from `DISTINCT` values; if masters exist, FK dropdowns.
2. **Disciplinary Actions** — count of events in the year, or "any active"? Spec implies count (`≥` threshold) — I'll model as numeric count from the existing disciplinary records source (TBD which table).
3. **Training Compliance** — days completed, programs completed, or % completion? I'll model as numeric value + a `unit_label` on the criterion (days / programs / %) so HR can pick.
4. **Approval workflow** in v1 — Save/Publish only, or full Submit→Approve→Reject active immediately?

## 3. Risk & Impact Report
- **Data Impact:** 3 new tables (`increment_eligibility_configs`, `increment_eligibility_criteria`, `increment_eligibility_audit`). Additive only. No edits to existing tables. Composite unique index on the 7-key scope.
- **Workflow Impact:** New admin-only configuration surface. Zero runtime impact on PMS until the increment engine consumes it (follow-up phase).
- **UI/UX Impact:** New collapsible card on the Scoring tab; no nav changes. Filter bar reuses the existing `SafetyFilterBar` pattern (Search-on-submit).
- **Regression Risk:** Very low — isolated module; no touches to existing scoring, KPI, or workflow logic.
- **Scalability:** ≤ few hundred config rows / year × criteria. Server-side query filtered by scope; criteria table client-paginated (small N). Evaluator is O(criteria) per employee.
- **Security:** RLS — read/write to `admin` + `hr_pms` via `has_role`. Audit table append-only for those roles; read for the same.
- **Mitigation:** Additive migration, soft-delete via `is_active`, full audit trail, no destructive operations, rollback = drop the 3 tables.

## 4. Data Model

```text
increment_eligibility_configs
  id uuid pk
  company_id uuid null            -- null = applies to all
  division_id uuid null            -- null = all
  business_unit_id uuid null
  level_id uuid null
  category_id uuid null
  location_id uuid null
  assessment_year text not null    -- e.g. '2025-26'
  status text not null             -- 'draft'|'pending_approval'|'approved'|'archived'
  copied_from_config_id uuid null fk self
  created_by uuid, approved_by uuid null, approved_at timestamptz null
  created_at, updated_at
  UNIQUE (company_id, division_id, business_unit_id, level_id,
          category_id, location_id, assessment_year)

increment_eligibility_criteria
  id uuid pk
  config_id uuid fk -> configs(id) on delete cascade
  criterion_key text       -- 'absent_days'|'lwp_days'|'disciplinary_actions'
                           --   |'training_compliance'|<custom_snake_case>
  criterion_name text
  description text
  comparison_operator text -- '>='|'<='|'>'|'<'|'='
  threshold_value numeric
  unit_label text null     -- 'days'|'programs'|'%'|...
  is_active bool default true
  effective_date date
  sort_order int
  created_at, updated_at

increment_eligibility_audit
  id, config_id, criterion_id null,
  performed_by uuid, performed_at timestamptz,
  action text   -- 'create'|'modify'|'delete'|'activate'|'deactivate'
                --   |'submit'|'approve'|'reject'|'copy'|'publish'
  previous_value jsonb, revised_value jsonb,
  company_label text, assessment_year text
```

Migration includes `GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated` + `GRANT ALL … TO service_role`, RLS enabled with `has_role(auth.uid(),'admin') OR has_role(auth.uid(),'hr_pms')`, and an `AFTER INSERT/UPDATE/DELETE` trigger on criteria/configs that writes the audit row (captures old/new JSON).

## 5. UI Specification

**Location:** Admin → System Settings → **Scoring** tab → new card appended after existing Scoring cards.

```text
┌─ Increment Eligibility Criteria ─────────────────────────────────────────┐
│ Organization-wide rules that disqualify employees from increments before │
│ percentage calculation. Configured per scope and assessment year.        │
├──────────────────────────────────────────────────────────────────────────┤
│ FILTERS (SafetyFilterBar pattern)                                        │
│  [Company ▾]  [Division ▾]  [Business Unit ▾]  [Level ▾]                 │
│  [Category ▾] [Location ▾]  [Assessment Year ▾ *required]                │
│                                          [ Reset ]  [ Load / Search ]    │
├──────────────────────────────────────────────────────────────────────────┤
│ COPY FROM PREVIOUS YEAR   ( ) Yes   (•) No                               │
│   If Yes → [ Source Assessment Year ▾ ]            [ Copy → ]            │
├──────────────────────────────────────────────────────────────────────────┤
│ CRITERIA TABLE                                       [ + Add Criterion ] │
│ ┌──────────┬──────────────┬──────┬────────┬──────┬──────────┬──────┬───┐ │
│ │ Name     │ Description  │ Oper │ Thresh │ Unit │ Effective│ Act. │ … │ │
│ ├──────────┼──────────────┼──────┼────────┼──────┼──────────┼──────┼───┤ │
│ │ Absent   │ Total absent │  ≥   │   10   │ days │ 01-Apr-25│ [✓]  │ ✎ │ │
│ │ LWP      │ LWP days …   │  ≥   │    5   │ days │ 01-Apr-25│ [✓]  │ ✎ │ │
│ │ Disc.    │ Warnings …   │  ≥   │    2   │count │ 01-Apr-25│ [✓]  │ ✎ │ │
│ │ Training │ Completed pr.│  ≤   │    3   │ prog.│ 01-Apr-25│ [✓]  │ ✎ │ │
│ └──────────┴──────────────┴──────┴────────┴──────┴──────────┴──────┴───┘ │
│                                                                          │
│ STATUS: Draft  •  Last saved: 2026-05-30 11:42  •  by: Admin User        │
│                                                                          │
│ [ View Audit Trail ] [ Version History ]                                 │
│                       [ Save Draft ] [ Publish ] [ Submit for Approval ] │
│                                            [ Approve ]  [ Reject ]       │
└──────────────────────────────────────────────────────────────────────────┘
```

**Add/Edit Criterion dialog** (shadcn `Dialog`):
- Criteria Name (text, required)
- Description (textarea)
- Comparison Operator (Select: ≥ ≤ > < =)
- Threshold Value (number, required)
- Unit Label (text, optional — days / programs / % / count)
- Effective Date (shadcn DatePicker with `pointer-events-auto`)
- Active (Switch)
- [ Cancel ] [ Save ]

**Delete** uses `ConfirmDestructiveDialog` (project standard for destructive actions).

**Version History drawer:** lists prior approved configs for the same scope; row click → read-only snapshot view + "Restore as Draft" button (creates a new draft seeded from snapshot).

**Audit Trail drawer:** table of `increment_eligibility_audit` rows for the current config — User / Date & Time / Action / Previous → Revised / Company / Assessment Year.

**Responsive:** filter grid `grid-cols-1 md:grid-cols-3 lg:grid-cols-4`; criteria table wrapped in horizontal `ScrollArea` on narrow viewports. Validated at 929×574.

## 6. Files to Create / Edit

**New**
- `supabase/migrations/<ts>_increment_eligibility.sql` — 3 tables + GRANTs + RLS + audit trigger function.
- `src/hooks/useIncrementEligibility.ts` — list / load / save / copy / submit / approve / publish queries + mutations (React Query).
- `src/components/admin/scoring/IncrementEligibilitySection.tsx` — card container, filter state, scope resolution.
- `src/components/admin/scoring/EligibilityFilterBar.tsx` — 7 filter dropdowns + Search/Reset.
- `src/components/admin/scoring/CopyFromYearControl.tsx` — Yes/No + source year + Copy action.
- `src/components/admin/scoring/CriteriaTable.tsx` — table + add/edit/delete + active toggle.
- `src/components/admin/scoring/CriterionDialog.tsx` — add/edit form (Dialog + DatePicker).
- `src/components/admin/scoring/EligibilityAuditDrawer.tsx`
- `src/components/admin/scoring/EligibilityVersionHistoryDrawer.tsx`
- `src/lib/incrementEligibility.ts` + `incrementEligibility.test.ts` — pure evaluator `evaluate(employeeMetrics, criteria) → { eligible, failed[] }`.

**Edited**
- `src/pages/admin/SystemSettings.tsx` — append `<IncrementEligibilitySection />` inside `case 'scoring'`.
- `DOCUMENTATION.md` — new "Increment Eligibility" section + Version History entry.
- `POLICY.md` — Increment Eligibility policy (criteria, operators, breach effect).
- `mem/index.md` + `mem/features/admin/increment-eligibility-config` — feature memory.

## 7. Functional Logic & Future Integration

```ts
evaluate(metrics, criteria) -> {
  eligible: boolean,
  failed: Array<{ criterion_name, operator, threshold, actual, unit_label }>
}
```

- Only `is_active = true` and `effective_date <= validation_date` criteria are evaluated.
- If `!eligible` → the (future) Increment Engine MUST set `incrementPercent = 0`, `incrementAmount = 0`, `eligibilityStatus = 'Not Eligible'`, `ineligibilityReason = failed.map(…).join('; ')`, and exclude the employee from increment processing.
- The Increment Calculation Report will surface the columns listed in the spec (Employee Code … Date of Validation). Report wiring is the next phase; this phase ships the evaluator + persistence so the report has a stable contract.

## 8. Tests
- `incrementEligibility.test.ts`:
  - Operator matrix (≥, ≤, >, <, =) — pass / fail boundaries.
  - Inactive criteria are skipped.
  - Criteria with `effective_date > validation_date` are skipped.
  - Custom criteria honored.
  - Multi-failure aggregation preserves all reasons.
  - Empty criteria → `eligible: true`.
  - Spec example: Employee A (12 absent, threshold 10, ≥) → Not Eligible; Employee B (8, 10, ≥) → Eligible.
- Mock data fixtures: 4 default criteria + 1 custom; sample employees A and B.
- Smoke test for `CriteriaTable` add/edit/delete + active toggle (RTL).

## 9. Rollback
- Migration is purely additive. Rollback = `DROP TABLE` the 3 tables. No FK from existing tables, so no cascade impact.

## 10. Post-implementation Notes
- **Zero hardcoding** — all criteria, operators, thresholds, units, scopes stored in DB; new criteria added via UI without code changes.
- **Multi-tenant ready** — `company_id` scope; null = applies to all.
- **Approval workflow** scaffolded but gated by a system setting flag — flip later to activate Submit→Approve→Reject without code edits.
- **Backup** — new tables included automatically via `get_backup_table_order()` (no denylist row needed).
- **Audit trail** — every create/modify/delete/activate/deactivate/copy/submit/approve/reject/publish writes an audit row capturing previous → revised JSON, performer, company label, assessment year, and timestamp.
