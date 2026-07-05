
# Brainstorm — Bulk Template Factory for AY 2025–26

Goal: stop hand-building 50+ templates. Give HR **one page** to (1) seed all templates from a matrix, (2) manage the 8 system-score KPIs as a shared library with per-Dept/Grade weight overrides, (3) apply the Self → Dept Head → BU Head workflow across all templates in one click, and (4) manage Hindi translations centrally.

---

## Problem today
- 50+ templates × 4 employee-buckets × EN/HI × 8 system KPIs = manual repetition.
- Editing one KPI wording or weight means opening every template.
- Workflow (`enabled_stages`) is set per template/instance — no "apply to all".
- Bilingual authoring is done one string at a time in `TemplateEditorDialog`.

## Target model — 3 building blocks

```text
                         ┌────────────────────────────────┐
  1. Template Archetype  │ 4 archetypes drive every dept  │
                         │  A. Has KRAs (≥1 mo in AY)     │
                         │  B. No KRA · M-grade (M1–M7)   │
                         │  C. No KRA · W-grade (W1–W5)   │
                         │  D. No KRA · T-grade (trainee) │
                         └───────────────┬────────────────┘
                                         │
  2. System-KPI Library ────────► resolves weights ──────► 3. Generated Templates
     (8 KPIs, EN+HI, scoring)          per (Dept, Grade)    (Dept × Archetype × Grade)
```

### Block 1 — Template Archetypes (new table)
`annual_review_template_archetypes` — 4 rows, HR-editable:
- `code` (A/B/C/D), `name`, `description`
- `default_criteria` JSONB (the qualitative criteria for that bucket)
- `default_enabled_stages` JSONB — seeded to `['self','dept_head','bu_head']`
- `default_stage_weights` JSONB
- `display_mode`, `default_language`, `translations`

Zero-hardcoding: no code path picks bucket by grade string; the archetype is picked by a **rule** row (see §Assignment).

### Block 2 — System-KPI Library (new tables)
Replaces the "systemTemplate" hack. Two tables so weights are matrix-driven:

- `annual_review_system_kpis` — 8 canonical rows
  - `key` (`lti_rate`, `sti_rate`, `ua_uc_nm`, `s5`, `training_attended`, `fugitive_pm10`, `annual_production`, `annual_pm`)
  - `name_en`, `name_hi`, `description_en`, `description_hi`
  - `scoring_rules` JSONB — the 5→0 / 4→1 … bands you listed
  - `uom_type` (`count | percent | days | rating`)
  - `active` bool

- `annual_review_system_kpi_weights` — matrix
  - `system_kpi_id`, `department_id` (nullable = wildcard), `grade` (nullable = wildcard), `weight_pct`
  - Unique on (`system_kpi_id`, `department_id`, `grade`) with NULL treated as "any"
  - Resolver picks most-specific match, sums must ≤ 100 per (dept, grade)

Editing one KPI's name or scoring band → every generated template inherits it (SSOT).

### Block 3 — Template Factory (generator)
New page: `/annual-review/admin/factory`. Inputs:
1. Cycle picker
2. Multi-select departments (or "all active")
3. Grade buckets to include (M, W, T)
4. Archetypes to generate (A/B/C/D checkboxes)
5. Apply-workflow toggle: `Self → Dept Head → BU Head` (defaults on)
6. Language default + `bilingual` display mode

Preview grid → shows the N templates that will be created/updated, weight totals per (dept, grade), and any weight-sum errors before commit.

"Generate" writes/upserts rows in `annual_review_templates` with:
- `sections.system_scores` = resolved list from library + resolved weight matrix
- `sections.criteria` = archetype defaults
- `sections.stage_weights` = archetype default (Self/Dept/BU)
- `sections.display_mode = 'bilingual'`
- `translations` = union of library + archetype HI strings
- `default_enabled_stages = ['self','dept_head','bu_head']`

Re-running the factory is **idempotent** — matches by `(cycle_id, department_id, archetype_code, grade_bucket)` and updates in place. Reason field required, audit row written.

---

## Assignment (which employee gets which template)

Extend `annual_review_assignment_rules` with:
- `archetype_code` (A/B/C/D)
- `grade_bucket` (`M | W | T | any`)
- `requires_kra_in_ay` bool (drives archetype A)
- `min_kra_months_in_ay` int (default 1)

Seeder resolves per employee:
1. Has ≥ `min_kra_months_in_ay` KRAs in AY window → archetype A template for their dept
2. Else look up by grade prefix (M/W/T) → archetype B/C/D
3. Else fall through to a global "unassigned" flag surfaced on the Progress tab

All thresholds live in `annual_review_settings` — no hardcoded grade lists.

---

## Bulk Workflow update ("apply Self→Dept→BU everywhere")

One button on the Factory page + a mirror on the Templates tab:
- Sets `default_enabled_stages = ['self','dept_head','bu_head']` on every selected template
- Optional: cascade to open instances via existing `set_annual_review_enabled_stages` RPC in batches
- Audited via `system_audit_logs`

---

## Bilingual authoring at scale

Two upgrades to shrink authoring time:
1. **KPI Library edit form** captures EN + HI in the same row (name, description, option labels). Every generated template inherits translations — HR edits Hindi once per KPI, not once per template.
2. **Bilingual XLSX round-trip** for archetypes and library:
   - Download: sheets = `System KPIs`, `Weights Matrix`, `Archetype A/B/C/D` with EN + HI columns side-by-side.
   - Upload: delta-only (same governance pattern as `UnifiedBulkDialog`), requires Reason column, validates weight sums.

---

## System-Score KPIs (seed data)

Seeded into `annual_review_system_kpis`, `scoring_rules` JSONB:

| Key | EN Name | Scoring (score → threshold) |
|---|---|---|
| lti_rate | Lost Time Injury (LTI) Rate | `5:0, 4:1, 3:2, 2:3, 1:4, 0:>4` (lower = better) |
| sti_rate | Short Time Injury (STI) Rate | same as LTI |
| ua_uc_nm | UA/UC/NM Reported by self | `5:5, 4:4, 3:3, 2:2, 1:1, 0:0` (higher = better) |
| s5 | Departmental 5S Status | `5:5, 4:4, 3:3, 2:2, 1:1, 0:0` |
| training_attended | Trainings Attended | `5:5, 4:4, 3:3, 2:2, 1:1, 0:0` |
| fugitive_pm10 | Fugitive PM10 / AQI Non-Compliance Days | `5:0, 4:12, 3:24, 2:36, 1:48, 0:>48` |
| annual_production | Annual Production Target vs Actual | `5:100%, 4:95%, 3:90%, 2:85%, 1:80%, 0:<80%` |
| annual_pm | Annual PM Target vs Actual | same as production |

`scoring_rules` shape: `{ direction: 'higher_better'|'lower_better', bands: [{score:5, threshold:0}, ...] }`. Renderer + scorer both read this — zero hardcoding in components.

---

## Risk & Impact Report

- **Data:** 3 new tables + 2 new columns on `annual_review_assignment_rules`. Additive only. Existing templates untouched until HR runs the factory.
- **Workflow:** New default `Self → Dept Head → BU Head` only applied when HR opts in per template selection.
- **UI:** New `/annual-review/admin/factory` tab; existing Template Editor stays for one-offs.
- **Regression:** Factory writes through the same `annual_review_templates` schema so scoring / eligibility / RPCs need no changes. `UnifiedBulkDialog` remains for per-employee edits.
- **Scalability:** Weight resolver is O(rows) with a covering unique index; factory generates ≤ (depts × 4) templates in one txn.
- **Mitigation:** Idempotent upsert keyed by `(cycle, dept, archetype, grade_bucket)`; preview-before-commit; per-run audit rows; bilingual round-trip XLSX for offline review.

---

## Rollout order (phased, each phase ships independently)

1. **P1 — System-KPI Library:** tables + admin CRUD page + seed the 8 KPIs. Existing templates keep working.
2. **P2 — Weight Matrix editor:** (Dept × Grade × KPI) grid + weight-sum validator.
3. **P3 — Archetypes + Factory page:** preview + generate + idempotent re-run.
4. **P4 — Assignment rule extension** (`archetype_code`, `grade_bucket`, `requires_kra_in_ay`) + seeder update.
5. **P5 — Bulk workflow apply + bilingual XLSX round-trip.**
6. **P6 — Tests + DOCUMENTATION.md / POLICY.md updates + migration of existing templates to reference the library.**

---

## Open questions before we build

1. Should archetypes B/C/D share a single set of qualitative criteria, or does each grade family need its own (behaviour/attendance/discipline etc.)?
2. Is the weight matrix keyed by **department** or **department + sub-unit / plant**? (affects unique index)
3. For grade buckets — is `M1–M7 / W1–W5 / T` the exhaustive list, or should it be config-driven from `pms_grades`?
4. Do you want the factory to also generate templates for AY 2026–27 by cloning, or is it strictly current-cycle?
5. Should Dept Head = employee's department's `head_user_id`, or a new "Dept Reviewer" role separate from the org head?

Once you answer these I'll turn the plan into concrete migrations + UI tickets.
