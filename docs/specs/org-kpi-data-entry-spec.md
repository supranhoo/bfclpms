# Org KPI Data Entry — Canonical Specification (SSOT)

**Status:** Authoritative reference for the Org KPI Data Entry pipeline.
**Last updated:** 2026-04-21
**Owners:** Platform / PMS module
**Companion files:**
- `docs/audits/org-kpi-data-entry-2026-04.md` — most recent gap audit
- `docs/specs/org-kpi-fix-roadmap.md` — sequenced fix plan derived from this spec

> Any future change to Org KPI behaviour MUST update this document in the same commit. If this spec and the code disagree, the spec is authoritative until the discrepancy is resolved by an explicit, audited change.

---

## 1. Purpose & Scope

### 1.1 What is an "Org KPI"?
An **Organization-level KPI** is a KPI whose *achieved value is identical* for every employee assigned to it within the same review period (e.g., "Plant availability %", "Coal cost per MW"). Instead of each employee entering the same number, a single **Data Owner** enters the value once and the system **propagates** it to every assigned employee's individual KPI workflow.

| Property | Org KPI | Individual KPI |
|---|---|---|
| Achieved value source | One Data Owner per (category, KRA, KPI) | The employee themselves |
| Storage of definition value | `org_kpi_values` (one row per period+scope) | none — value lives only on `review_submissions.achieved_value` |
| Per-employee workflow row | `kpis` row with `is_org_level=true` | `kpis` row with `is_org_level=false` |
| Self-review pre-fill | Yes — pre-filled from propagation | No — employee enters from scratch |
| Workflow stages | Same as individual (resolved per workflow_template) | Same |

### 1.2 Actors
| Actor | Role in Org KPI lifecycle |
|---|---|
| **Admin** | Configures `kra_categories.is_org_level`, assigns Data Owners, runs repair tools, can override any state. |
| **Data Owner** | Person designated in `org_kpi_data_owners` for a given (category, KRA, KPI). Enters and propagates the achieved value. May be one or many per KPI. |
| **Employee** | Receives propagated value as a pre-filled self-review; submits with their own remarks/evidence. |
| **Manager / Skip-Level / HR PMS / Auditor / Management** | Standard downstream review stages, identical to individual KPIs. |

### 1.3 Periods & Companies
- Periods: monthly (Jan–Dec) within a fiscal year (July–June). Multi-month KPIs (Quarterly, Bi-Monthly, Half-Yearly, Yearly) are propagated *per active sub-period* and percolate at final approval (see §4 step 9).
- Company-scoping: Org KPIs respect the universal Company Filter — data owners and assignments are scoped to the employee's resolved company.

### 1.4 Out of scope (this spec)
- Scoring math (covered by `mem://architecture/pms/universal-scoring-logic`).
- Manager-and-above review stage internals (covered by workflow engine spec).
- Non-org-level (individual) KPIs.

---

## 2. Data Model

All joins between Org KPI tables use the natural key **`(category_id, kra_name, kpi_name, review_period, review_year)`**. KRA/KPI names are normalized via the `nk()` helper (`lower + collapse whitespace + trim`) before comparison — see `mem://features/admin/org-kpi-management-suite`.

### 2.1 `kra_categories`
| Column | Purpose |
|---|---|
| `id` | Category PK; used as `category_id` everywhere downstream. |
| `is_org_level` | **The flag.** When `true`, every KPI created under this category is treated as an Org KPI. |
| `name` | Display name. |

### 2.2 `kpis` (per-employee instance row)
Org KPI rows are distinguished by `is_org_level=true` AND `employee_id IS NOT NULL`. The `employee_id IS NULL` variant is reserved for the legacy "definition row" pattern and is not used by the current propagation path.

| Column | Purpose for Org KPIs |
|---|---|
| `id` | PK. |
| `employee_id` | The assigned employee. |
| `category_id`, `kra_name`, `kpi_name` | Natural key into `org_kpi_values` and `org_kpi_data_owners`. |
| `is_org_level` | Always `true` for Org KPIs. |
| `status` | The **per-employee instance state**: `kra_set → self_review → manager_check → … → approved`. |
| `review_period`, `review_year` | The period this assignment is for. |
| `frequency`, `frequency_cycle_start` | Drives multi-month percolation. |
| `workflow_template_id` | Resolved per period via `get_employee_workflow_info`. |

### 2.3 `org_kpi_values` (the Data Owner's entry)
One row per `(category_id, kra_name, kpi_name, review_period, review_year, scope)`. Scope is either department-wide (`department_id` set) or whole-org (both null). For per-employee variants (rare, used by Compliance KPI), `employee_id` is set.

| Column | Purpose |
|---|---|
| `id` | PK. |
| `category_id`, `kra_name`, `kpi_name` | Natural key. |
| `review_period`, `review_year` | Period. |
| `achieved_value` | The number the Data Owner entered. |
| `sub_factors` | JSON for Compliance KPI's multi-factor breakdown (`mem://features/admin/compliance-kpi-sub-factors`). |
| `remarks` | Data Owner's note. |
| `evidence_urls` | Files attached at definition time (cascade to all employees). |
| `status` | The **definition state**: `draft → propagated → (sent_back) → propagated → approved`. |
| `entered_by`, `propagated_by`, `propagated_at` | Audit fields. |
| `department_id`, `employee_id` | Optional scoping. NULL in both = whole-org. |

### 2.4 `org_kpi_data_owners`
| Column | Purpose |
|---|---|
| `id` | PK. |
| `category_id`, `kra_name`, `kpi_name` | The KPI this ownership applies to. |
| `owner_id` | The user who can enter/propagate. Multiple rows allowed per KPI = co-ownership. |
| `assigned_by`, `created_at` | Audit. |

### 2.5 `review_submissions` (per-employee workflow row)
Created by propagation. One row per `kpi_id` (unique constraint). Holds all stage scores/ratings/remarks/evidence and the final achieved_value.

| Column relevant to Org KPI | Purpose |
|---|---|
| `kpi_id` | FK to `kpis`. |
| `achieved_value` | **Copied from `org_kpi_values.achieved_value` at propagation time.** |
| `self_remarks`, `self_evidence_urls` | Employee fills these on submit. |
| `auto_advance_reason` | Set to `'Org KPI propagated by data owner'` on creation. |
| `*_score`, `*_rating` per stage | Standard. |
| `final_score`, `final_rating` | Standard. |

### 2.6 `kpi_audit_logs`
Every state transition MUST emit a row. Action codes used by the Org KPI pipeline:

| Action | When |
|---|---|
| `ORG_KPI_VALUE_ENTERED` | Data Owner saves a draft. |
| `ORG_KPI_PROPAGATED` | Definition row advances `draft → propagated`. |
| `ORG_KPI_PROPAGATED_TO_EMPLOYEE` | One per employee whose `kpis.status` actually advanced. |
| `ORG_KPI_SENT_BACK` | Reviewer rejects and rolls definition back to `draft`. |
| `STATUS_STUCK_REPAIRED` | Repair tool advanced a stuck `kra_set` instance. |
| `HALF_PROPAGATION_REPAIRED` | Repair tool created the missing `review_submissions` row. |
| `PROPAGATION_FAILURE_RESET` | Repair tool reset OKV from `propagated` back to `draft` after detecting bucket F. |

### 2.7 Join contract (cross-table key)
```
org_kpi_values  ⟷  kpis                 ⟷  review_submissions
(category_id,       (category_id,             (kpi_id → kpis.id)
 nk(kra_name),       nk(kra_name),
 nk(kpi_name),       nk(kpi_name),
 review_period,      review_period,
 review_year)        review_year,
                     is_org_level=true,
                     employee_id)
```
`nk()` = lower + collapse-whitespace + trim. Mismatches here are the #1 historical cause of "phantom pending" rows — see Version History v2.55.x.

---

## 3. Lifecycle State Machine

### 3.1 Definition state (`org_kpi_values.status`)
```
        ┌──────────────────────────── send_back ───────────────────────────┐
        │                                                                  │
        ▼                                                                  │
    ┌────────┐    save     ┌────────┐   propagate    ┌────────────┐    final approval
 ●─►│ (none) │────────────►│ draft  │───────────────►│ propagated │──────────────────► approved
    └────────┘             └────────┘                └────────────┘
                                ▲                          │
                                │                          │
                                └────── repair (bucket F) ─┘
```

### 3.2 Per-employee instance state (`kpis.status`)
Driven by the resolved `workflow_template`. Canonical order:
```
kra_set → self_review → manager_check → skip_level_check → hr_pms_review → audit → management_review → approved
```
Org KPI specifics:
- A propagation attempt advances `kra_set → self_review` and **only** `kra_set → self_review` (no leapfrogging).
- An employee whose `kpis.status` is past `kra_set` when propagation runs is **skipped**, not advanced again. The new RPC contract (per §7) requires this skip to be logged and reflected in the returned skipped[] array; the legacy RPC silently increments the success counter (= bug F).

### 3.3 Cross-table contract (the integrity invariant)
> **When `org_kpi_values.status = 'propagated'` for `(cat, kra, kpi, period, year)`, then for every `kpis` row with the same natural key AND `is_org_level = true`: either `kpis.status` is past `kra_set`, OR a row in the RPC's `skipped[]` audit metadata explains why it was not.**

Violations:
- **Bucket B** = OKV row exists, employee has `kpis.status='kra_set'`, no submission. (RPC crashed mid-loop.)
- **Bucket C** = OKV + submission exist, but `kpis.status='kra_set'`. (RPC's UPDATE no-op'd silently.)
- **Bucket F** = OKV.status='propagated' but **zero** employees actually advanced. (Bulk RPC failure; legacy RPC reports success.)

---

## 4. End-to-End Happy-Path Flow

| # | Actor | UI / RPC | Storage write |
|---|---|---|---|
| 1 | Admin | Admin → KRA Library → toggle `is_org_level=true` on category | `kra_categories.is_org_level=true` |
| 2 | Admin | Admin → Org KPI Data Owners → assign owner | INSERT into `org_kpi_data_owners` |
| 3 | System | KRA rollover (`mem://features/admin/enhanced-kra-rollover-system`) creates per-employee `kpis` | INSERT into `kpis` (status=`kra_set`, is_org_level=true) |
| 4 | Data Owner | Org KPI Data Entry → opens card → enters value → Save Draft | UPSERT `org_kpi_values` (status=`draft`) + `kpi_audit_logs` (`ORG_KPI_VALUE_ENTERED`) |
| 5 | Data Owner | Same screen → clicks **Propagate** → calls RPC `propagate_org_kpi_value(p_definition_id, p_remarks)` | See 5a–5c |
| 5a | RPC | For each `kpis` row matching the natural key and `is_org_level=true`: | — |
| 5a.i | RPC | INSERT `review_submissions` row with `achieved_value` copied from OKV, `auto_advance_reason='Org KPI propagated by data owner'` | INSERT |
| 5a.ii | RPC | `UPDATE kpis SET status='self_review' WHERE id=… AND status='kra_set'` | UPDATE (must check `ROW_COUNT`) |
| 5a.iii | RPC | `INSERT kpi_audit_logs (action='ORG_KPI_PROPAGATED_TO_EMPLOYEE', metadata={skipped:bool, reason})` | INSERT |
| 5b | RPC | After loop: `UPDATE org_kpi_values SET status='propagated' WHERE id=p_definition_id` ONLY IF at least one employee advanced. | UPDATE |
| 5c | RPC | Returns `{ propagated_count, skipped: [{kpi_id, reason}…] }` | — |
| 6 | React caller | Inserts top-level audit log `ORG_KPI_PROPAGATED` for the definition transition | INSERT |
| 7 | Employee | Self-review sheet shows pre-filled `achieved_value` → adds remarks/evidence → Submit | UPDATE `review_submissions` + `kpis.status → manager_check` |
| 8 | Reviewers | Standard workflow advances per resolved template | Standard |
| 9 | System | On final approval of a multi-month KPI's terminal sub-period, `percolate_multimonth_score` trigger fires and copies the final score/rating to all sibling sub-periods | INSERT/UPSERT `review_submissions`, UPDATE `kpis.status='approved'`, INSERT `kpi_audit_logs` (`SCORE_PERCOLATED`) |

### 4.1 Send-back path
If a downstream reviewer rejects an Org KPI:
- For the rejected employee's row, `kpis.status` rolls back to the configured step-back stage (typically `kra_set` or `self_review`).
- The OKV definition is **not** automatically rolled back — other employees' workflows continue. A separate Admin action ("Send back to Data Owner") sets `org_kpi_values.status='draft'` and clears `propagated_at`. Contract: emit `ORG_KPI_SENT_BACK` audit log.

---

## 5. UI Surface Map

| Surface | File | Centric to | Pending predicate | Entered predicate | Propagated predicate | Stuck predicate | Counting unit | Audience |
|---|---|---|---|---|---|---|---|---|
| **Org KPI Data Entry main grid** | `src/pages/admin/OrgKpiDataEntry.tsx` | Definition (OKV) | `!hasValue` (val.achieved_value null) | `hasValue && !isStuck && val.status NOT IN (propagated, approved)` | `hasValue && !isStuck && val.status IN (propagated, approved)` | `hasValue && key in kraSetKpiRowsByKey` (any employee still kra_set) | KPI cards (header) + employee assignments (sub-tile) | Data Owner + Admin |
| **Org KPI Pending Report** | `src/components/admin/OrgKpiPendingReport.tsx` | Definition (OKV) | mirrors above | mirrors above | mirrors above | mirrors above | Employee assignments + distinct KPI count | Data Owner + Admin |
| **OrgKpiEntryCard** | `src/components/admin/OrgKpiEntryCard.tsx` | Single KPI editor | n/a | n/a | n/a | n/a | One KPI | Data Owner + Admin |
| **Scorecard Detail report** | reporting suite | Instance (kpis.status) | `kpis.status='kra_set'` | `kpis.status='self_review'` | `kpis.status` past `self_review` | (no concept) | KPI rows = employee assignments | Manager + Admin |
| **Employee Dashboard / Self Review Sheet** | review module | Instance | `kpis.status='kra_set'` | `kpis.status='self_review'` | past `self_review` | (no concept) | KPI rows | Employee |
| **Admin Data Repair tab** | `src/components/admin/DataRepairTab.tsx` | Both | scan finds bucket B/C/F rows | n/a | n/a | scan_stuck finds bucket C | Submission rows OR OKV rows depending on scan | Admin only |

**Divergence note:** Surfaces 1, 2, 3 are OKV-centric; 4, 5 are instance-centric. They will disagree whenever a row is in bucket B, C, or F. The v2.65.7 + v2.65.8 patches narrowed the gap by adding "Stuck" detection on surfaces 1+2; bucket F still produces silent disagreement until the RPC patch (Roadmap step 3) ships.

---

## 6. Counting & Classification Rules (canonical vocabulary)

Every surface MUST adopt this vocabulary and label its counts. New surfaces inherit these definitions.

| Term | Definition | Unit |
|---|---|---|
| **KPI card** | One unique `(category_id, kra_name, kpi_name)` tuple within the selected period. | KPI |
| **Employee assignment** | One `kpis` row (one KPI for one employee for one period). | row |
| **Pending** | The Data Owner has not yet entered an achieved value for this KPI/period. | KPI cards (definition view) OR employee assignments (instance view) — surface MUST label which |
| **Entered** | OKV row exists with achieved_value, but status is still `draft`. | KPI cards (or assignments) |
| **Propagated** | OKV.status='propagated' AND at least one employee instance is past `kra_set`. The strict invariant per §3.3. | KPI cards (or assignments) |
| **Stuck** | OKV value exists but at least one assigned employee's `kpis.status` is still `kra_set`. Caused by RPC bug B/C/F. Requires admin repair. | Employee assignments (the precise count of broken rows) |
| **Completion %** | `(Entered + Propagated) / Total` over employee assignments, NOT KPI cards. | percentage |

**Required labelling:** Every numeric tile MUST display its unit (e.g., "12 KPIs" or "47 employee assignments"). Ambiguous counts (just "12") are forbidden going forward — see roadmap step 6.

---

## 7. Repair Tooling Reference

| Bucket | Signature | Handled by | Repair action |
|---|---|---|---|
| **A** | `kpis.status='kra_set'` + no OKV | (no tool — correct state) | none |
| **B** | OKV exists + `kpis.status='kra_set'` + no submission | `repair-orphaned-propagations` (action: `scan` / `repair`) | INSERT submission, UPDATE kpis.status, audit log `HALF_PROPAGATION_REPAIRED` |
| **C** | OKV + submission exist + `kpis.status='kra_set'` | `repair-orphaned-propagations` (action: `scan_stuck` / `repair_stuck`) | UPDATE kpis.status only, audit log `STATUS_STUCK_REPAIRED` |
| **D** | `kpis.status='self_review'` + OKV missing | (no tool — verify legitimate manual entry) | manual review |
| **E** | `kpis.status='self_review'` + OKV exists + submission missing | (no tool — currently impossible state, would flag) | manual investigation |
| **F** | OKV.status='propagated' + zero employees advanced | **GAP — Roadmap step 2** (`scan_propagation_failures` / `repair_propagation_failures`) | UPDATE OKV.status='draft', clear propagated_at, audit log `PROPAGATION_FAILURE_RESET` |
| **G** | OKV.status='draft' + age > 7 days | (no tool — preventive monitoring only) | scheduled report |
| **H** | Multiple OKV rows for same natural key | (no tool — confirmed 0 occurrences after natural-key normalization) | n/a |
| **I** | `kpis.is_org_level=true` + no `org_kpi_data_owners` row | **GAP — Roadmap step 4** (orphaned-ownership UI) | inline owner assignment |

See `mem://features/admin/data-repair-engine` for the repair engine architecture and `mem://features/admin/workflow-reconciliation-logic` for the related (non-Org) reconciler.

---

## 8. Version History (since inception)

| Version | Date | Change | Why | Files / artifacts | Residual gap |
|---|---|---|---|---|---|
| v2.40.x | 2025-Q3 | Initial Org KPI suite: `is_org_level` flag, `org_kpi_values`, Data Owner role, propagation RPC v1. | Eliminate per-employee duplicate entry of plant-wide metrics. | `kra_categories`, `org_kpi_values`, `org_kpi_data_owners`, `propagate_org_kpi_value` v1 | RPC had no row-count check (became bug F later). |
| v2.50.x | 2025-Q4 | Natural-key normalization (`nk()` helper) added to all OKV/KPI joins. | Whitespace + case mismatches were creating phantom-pending rows. | `src/utils/orgKpiKey.ts`, `useOrgKpiOwnershipMap` | None known. |
| v2.55.x | 2026-Q1 | Compliance KPI sub-factors support; per-employee OKV rows allowed for that one KPI family. | Compliance KPI required factor-level breakdown. | `org_kpi_values.sub_factors`, `OrgKpiEntryCard` | Mem: `mem://features/admin/compliance-kpi-sub-factors` |
| v2.60.x | 2026-Q1 | Copy KRAs tool preserves Org KPI data-owner mapping when cloning between employees. | Cloning was creating orphaned `is_org_level=true` rows with no owner. | `mem://features/admin/copy-kras-org-kpi-integrity` | Bucket I still possible if owners removed after clone. |
| v2.65.6 | 2026-04 | Forward-guard added: RPC checks `org_kpi_values` write succeeded before per-employee loop. | Half-propagated rows (bucket B) were appearing after RPC crashes. | `propagate_org_kpi_value` | Only protects bucket B, not C or F. |
| v2.65.7 | 2026-04 | Dual-count UI: header tile labels "X KPIs" vs "Y employees mapped"; Pending Report distinguishes assignments vs distinct KPIs. | Users were comparing apples-to-oranges between header and report. | `OrgKpiDataEntry.tsx`, `OrgKpiPendingReport.tsx` | 4 of 6 count tiles still unlabelled (roadmap 6). |
| v2.65.8 | 2026-04 | "Stuck" classification + `scan_stuck`/`repair_stuck` actions in repair engine. | Bucket C rows had no detection or fix. | `DataRepairTab.tsx`, `repair-orphaned-propagations` edge fn | Only fixes existing rows; new bucket C still possible until RPC patch. |
| **v2.65.9 (planned)** | 2026-Q2 | Bucket F detection + repair (`scan_propagation_failures` / `repair_propagation_failures`). | Audit 2026-04 found 87 silent propagation failures. | edge fn + `DataRepairTab.tsx` | Stops bleed; root cause fixed in v2.65.10. |
| **v2.65.10 (planned)** | 2026-Q2 | Atomic propagation RPC patch: `GET DIAGNOSTICS row_count`, skipped[] return, audit log inside loop, OKV.status revert on zero advance. | Eliminates the source of buckets B, C, and F. | `propagate_org_kpi_value` | Pre-flight preview still missing (roadmap 5). |
| **v2.65.11 (planned)** | 2026-Q2 | Orphaned-ownership UI + pre-flight propagation preview + remaining unit labels. | Bucket I + UX polish. | `OrgKpiDataEntry.tsx`, new admin sheet | none anticipated |

Pull additional historical detail from: `DOCUMENTATION.md`, `mem://features/admin/org-kpi-management-suite`, `mem://features/admin/copy-kras-org-kpi-integrity`, `mem://features/admin/data-repair-engine`, `mem://features/admin/compliance-kpi-sub-factors`.

---

## 9. Known Gaps & Open Work

Direct copy of the ranked fix list from `docs/audits/org-kpi-data-entry-2026-04.md`. Status reflects state as of this spec's date.

| # | Item | Bucket(s) | Status | Tracked in |
|---|---|---|---|---|
| 1 | Run existing repair tools to clear 14 B + 6 C rows. | B, C | **Pending admin click** | Roadmap step 1 |
| 2 | Bucket F detection + repair pass. | F (87 rows) | **Not yet implemented** | Roadmap step 2 |
| 3 | Atomic propagation RPC patch (row-count check, skipped[], audit-in-loop, OKV revert). | Prevents new B/C/F | **Not yet implemented** | Roadmap step 3 |
| 4 | Orphaned-ownership UI (44 distinct unowned KPIs). | I | **Not yet implemented** | Roadmap step 4 |
| 5 | Pre-flight propagation preview ("X will advance, Y already past"). | UX | **Not yet implemented** | Roadmap step 5 |
| 6 | Unit labels on remaining 4 count tiles. | UX | **Not yet implemented** | Roadmap step 6 |
| 7 | Bucket D verification (23 self_review-without-OKV rows — confirm benign). | D | **Pending SQL check** | one-off |
| 8 | Bucket G monitoring (abandoned drafts > 7d). | G | **Not yet implemented** | optional |
| 9 | Audit-trail completeness inside the RPC loop. | trail | **Bundled with item 3** | Roadmap step 3 |

---

## Glossary

- **OKV** — `org_kpi_values` table (the Data Owner's entry).
- **Definition row** — a single OKV row representing the value for one (KPI, period, scope).
- **Instance row** — a single `kpis` row representing one employee's assignment of one KPI for one period.
- **Natural key** — `(category_id, nk(kra_name), nk(kpi_name), review_period, review_year)` plus optional `department_id`/`employee_id` for scoping.
- **Propagation** — the RPC call that fans an OKV definition out to every assigned employee's `review_submissions` + `kpis.status` workflow.
- **Percolation** — the trigger that copies a multi-month KPI's final score from the terminal sub-period to its siblings.
- **Stuck** — the integrity-violation state where an employee's `kpis.status='kra_set'` despite the OKV claiming `propagated`.

---

*This spec supersedes any previous Org KPI documentation when in conflict. Update it in the same commit as any behavioural change.*
