# Annual Review Module — Policy

_Business rules. Update in the same PR as any logic change._

## Internationalisation (2026-06)
- Every user-visible string in the annual review module MUST be rendered through `useAnnualReviewI18n().t(key, englishFallback)`.
- Template-authored content (criterion / system-score / eligibility / self-review-field labels and descriptions) MUST go through `tTemplate(kind, id, field, englishFallback)`. Keys follow `<kind>.<id>.<field>`.
- Provider: `AnnualReviewI18nProvider` is mounted at every annual-review page root (`EmployeeAnnualReview`, `TeamAnnualReview`, `HrFinalizationSheet`). Child components that consume the context never receive `t` via props.
- Resolution precedence (unchanged): `current === default → fallback` → `template.translations[lang][key]` → `UI_I18N[lang][key]` → english fallback. Numeric data is never translated.

## Reviewer-chain mapping (2026-06)

- **Manager** = `profiles.reporting_manager_id`.
- **Skip Manager** = manager's `reporting_manager_id`.
- **BU Head** = `business_units.head_user_id` of the employee's BU
  (the BU is resolved through the employee's `department_id`).
  - This value is admin-managed in **Admin → Settings → Organization → Org Heads**.
  - It can be **auto** (derived from the top of the BU's reporting hierarchy via
    `public.resolve_bu_head(bu_id)`) or **manual** (set via `set_bu_head` RPC).
  - If no BU head is configured the seeder falls back to the legacy ancestor walk
    (2 hops above the skip manager) so old cycles continue to seed.
- **Department Head** = `departments.head_user_id` of the employee's department.
  - Admin-managed inline on the Departments tab. Auto-derived via
    `public.resolve_department_head(dept_id)` or manually set via
    `set_department_head` RPC. Snapshotted to `annual_review_instances.dept_head_id`
    at seed time. Nullable when the department has no candidates.
- **HR Head (HR Finalization)** = `head_user_id` of the BU named "HR" (case-insensitive)
  within the cycle's company. Managed inline on the Business Units tab through the
  same Auto/Manual controls as any other BU head (`resolve_bu_head` / `set_bu_head`).
  No separate HR Finalization screen.
  - If unconfigured (no BU named HR, or its head is empty) the seeder falls back
    to the legacy `hrUserId` argument.
- Per-instance overrides (`annual_review_assignment_overrides` via
  `reassign_annual_review_reviewer`) continue to take precedence over the
  snapshotted reviewer columns.
- Every change (auto-recalc, manual set, HR BU change) is recorded in
  `system_audit_logs` with action prefix `org_heads.*`.
- Writes are restricted to `admin` and `hr_pms`.

## Eligibility
- Seeding scopes to `is_active = true AND is_dummy_employee = false`.
- Rule matching is priority-ordered (lower wins). Empty filter set matches all.
- Filter dimensions: designation, pms_grade, level, department, business unit (joined via department).
- Seeder MUST page the `profiles` read via `fetchAllPaged` (POLICY §94 / `mem://architecture/profiles-query-policy`). The active roster exceeds the 1000-row PostgREST cap; an unranged read silently drops >60% of employees.

### Single-employee template assignment
There are two ways to assign a template to one employee:

**Recommended — per-employee override (post-seed):**
1. Open **Admin → Progress**, find the employee.
2. While they are still in `not_started` or `pending_self`, click **Change template**.
3. Pick the new template, enter a reason (min 3 chars), Save.
4. The override is audit-logged. It survives re-seeds and only affects that one employee.

The override is stored on `annual_review_instances.template_override_id` and resolved via the
`resolveTemplateId(instance)` helper — UI components MUST go through that helper, never read
`template_id` directly. Once the review has progressed past `pending_self`, the override
is locked (RPC raises).

**Rule-based (pre-seed) — useful when targeting an exact filter combination:**
1. Open **Admin → Rules**, pick the active cycle.
2. Create a new rule whose filters uniquely identify that employee.
3. Set **priority = 1** so this rule wins before any broader rule.
4. Pick the desired template and save.
5. Click **Seed instances by rules**.

Caveats:
- The seeder writer (`writeSeedRowsPreservingOverrides`) updates seeded columns
  (`template_id`, reviewer chain, `assigned_rule_id`) on re-seed but **never touches
  `template_override_id`**. Any per-employee override survives re-seed.
- If your filter combo also matches other employees, they will receive the same template.
  Tighten filters or use the per-employee override instead.

**Bulk CSV/XLSX (many employees at once):**
1. Admin → Progress → **Bulk template assignment** → Download template.
2. In the workbook, fill `New Template` and `Reason` only for rows you want to change.
   Use the literal value `CLEAR` in `New Template` to remove an existing override.
3. Upload → preview classifies every row as Apply / Skip / Error → click **Apply**.
4. Each successful row hits the same `set_annual_review_template_override` RPC so
   stage gate, role gate, and audit log are identical to the single-row UI.

## Reviewer chain
- Snapshotted at seed time from `profiles.reporting_manager_id` (manager → skip → bu_head). HR is the configured HR user.
- Mid-cycle change: HR/admin inserts an `annual_review_assignment_overrides` row. Overrides take precedence over the snapshot for that instance + role.

## Per-employee workflow override
- Each instance has `enabled_stages` (subset of `self / manager / skip_manager / bu_head / hr`).
  Any stage (including `self`) may be disabled per employee; the chain must
  contain at least one stage. When `self` is disabled the cycle starts at the
  first remaining enabled stage and no self ratings are captured.
- Disabled stages are **skipped entirely** — the next reviewer in the
  surviving chain becomes active immediately. If the last enabled stage is
  not `hr`, completing that stage finalizes the review (sets `completed`
  and stamps `finalized_at`).
- Mutation gate: only admin / hr_pms, only while `overall_status ∈ {not_started, pending_self}`,
  reason ≥ 3 chars. Server-side RPC `set_annual_review_enabled_stages` enforces all three and writes an
  `annual_review.enabled_stages_set` audit row.
- Two UI paths in **Admin → Progress**:
  - **Change workflow** row action (per employee, 4 checkboxes + reason).
  - **Bulk workflow assignment** XLSX dialog
    (columns: Employee Code, Full Name, Current Stages, Manager (Y/N), Skip (Y/N), BU (Y/N), HR (Y/N), Reason).
- The seeder (`writeSeedRowsPreservingOverrides`) never writes
  `enabled_stages`, so per-employee workflow overrides survive re-seed —
  identical guarantee to `template_override_id`.
- Resolver SSOT: `src/lib/annualReview/stageChain.ts` (`enabledChain`,
  `nextStatus`, `prevStatus`). UI must render the stepper through the
  resolver — never hardcode the 5-stage chain.

## Stages & status
- `not_started → pending_self → pending_manager → pending_skip → pending_bu → pending_hr → completed`.
- Send-back reverts to the previous stage and clears `is_locked` on the affected response.

## Scoring
- Criteria score cascades HR → BU → Skip → Manager → Self (first non-empty wins).
- Overall = criteria score + system scores, capped at 100.
- `final_rating` is mutable only via `override_annual_review_rating` (reason ≥ 3 chars, audit-logged) until cycle is closed.

## Acknowledgment & rebuttal
- Employees may acknowledge and optionally add a rebuttal note.
- Allowed even after the cycle is closed (explicit carve-out on `block_when_annual_cycle_closed`).

## Cycle lifecycle
- `draft → active → closed` is the happy path. `closed → active` only via `reopen_annual_review_cycle` (HR/admin, mandatory reason, audit-logged).
- Reopen is always manual.

## Bulk operations
- Bulk finalize affects only `pending_hr` instances.
- Bulk send-back skips `pending_self`, `not_started`, `completed`.
- Both record per-instance audit entries.

## Reporting
- `/reports/annual-review` is read-only. Bulk operations live in Admin → Progress only.
- Exports cover the currently visible page (≤ 100 rows). Narrow filters for wider exports.
- Summary/status counts MUST use count-only queries (`head: true, count: 'exact'`) or a paged read. Unpaged `.select(column)` reads are forbidden for cycle-wide aggregates — the Data API caps payloads at 1000 rows and silently undercounts large cycles.

## Version history
- 2026-06-14 — Initial policy. Documented reopen, reassignment override precedence, and export scope.
- 2026-06-15 — Added per-employee configurable workflow (`enabled_stages` + bulk XLSX + override-safe seeder).
- 2026-06-15 — Added Carry KRA Score system-score source. Template authors may configure a System Score with `source = 'carry_kra'` and a `carry_config` choosing `overall_avg`, `last_n_months`, or `selected_months`. The carry value is the **average of monthly KRA averages** for the cycle's fiscal year (July–June). Monthly scores are weight-aware aggregates of the employee's `review_submissions` (cascade `final_score → auditor → manager → self`), excluding `is_na`. The value is fed into `system_scores[<id>]`, displayed read-only with a monthly breakdown, and is NOT scaled to the score's weight cap. Reads inherit existing PMS RLS; snapshots cached on `annual_review_instances.carry_score_snapshots`.
- 2026-06-15 — Carry KRA mapping preview. Any Carry KRA source MUST be previewable from the Template Editor before publish. The preview (`CarryKraMappingPreview`) is read-only, scoped to active employees only, and MUST reuse `buildCarrySnapshot` — never re-implement aggregation. This keeps "what admins verify" identical to "what the employee sees".
- 2026-06-15 — Carry KRA is a **System Score source only**, never a Criterion source. Rationale: Carry KRA produces an already-weighted percentage contribution (same shape as Safety/HR/Env) and is summed via the System Scores branch in `src/lib/annualReview/scoring.ts`. Exposing it on Criteria would double-count or require parallel math. Any future request to back a Criterion with carried KPI data must instead add a new System Score and reference it from the criterion's description.
- 2026-06-15 — Carry KRA monthly breakdown columns **Total Score / Out Of / %** are display-only transparency aids derived from the same weighted aggregation. They MUST NOT be referenced by appraisal math — the SSOT for the appraisal contribution remains `computeCarryRating` → `computeCarryContribution`.
- 2026-06-15 — `system_scores[<id>]` values MUST be percentage-point contributions (i.e. already on the appraisal /100 scale). For `source = carry_kra`, the only place that scales the raw 0–5 KPI rating into percent points is `computeCarryContribution(rating, weight)` in `src/services/annualReview/carryKraScore.ts`. Persisting the raw 0–5 rating directly is forbidden — it would silently under-count appraisal totals by `KPI_SCALE_MAX` (= 5).
- 2026-06-15 — Fiscal year derivation is centralized in `fyStartFromCycle(cycle)` (`src/lib/annualReview/fiscalYear.ts`). All surfaces that fetch time-series PMS data for an annual review MUST derive `fyStart = cycle.review_year - 1` through this helper. Passing `cycle.review_year` directly to a service that expects `fyStart` is a regression and will fetch from the wrong fiscal window.
- 2026-06-15 — Bilingual joined option labels (`"<English> / <translated>"`) are a **display-only transparency aid** rendered by `tTemplateBilingual` when `currentLanguage !== defaultLanguage`. The persisted value for any criterion score is always the numeric `option.score` (0–5). Reviewer UIs MUST NOT persist, compare, or parse the joined label string.- 2026-06-15 — Template translation lookup key is `kind:id:field` (colon-separated). Writers (`CriterionOptionsDialog`, `TemplateEditorDialog`) and readers (`tTemplate`, `tTemplateBilingual` in `AnnualReviewI18nContext`) MUST use the same shape. Mixing dot/colon separators silently drops translations.

- 2026-06-15 — `TemplateSections.display_mode` controls **reviewer-facing label rendering only**. Persisted appraisal data (scores, option IDs, weighted totals, stage transitions) MUST be unaffected by the chosen mode. Default mode for legacy templates without the field is `bilingual` to preserve existing UX.
