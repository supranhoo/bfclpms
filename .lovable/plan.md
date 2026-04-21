

## Deep Audit Plan — Org KPI Data Entry End-to-End Gap Analysis

### Why this audit
We've patched 3 symptoms in the last week (half-propagation, status-stuck, dual-count UI) — all pointing to the same underlying problem: **the Org KPI Data Entry surface and the downstream workflow data model can drift apart silently**. Before patching a 4th symptom, do one structured audit that maps every divergence point and ranks them. Output is a written gap register plus a prioritized fix list — no code changes in this loop.

---

### Scope

**In scope (Org-level KPIs only, all periods):**
1. The data entry UI (`OrgKpiDataEntry.tsx`, `OrgKpiEntryCard.tsx`)
2. The propagation RPC (`propagate_org_kpi_value`) and its forward-guard
3. The three storage layers: `org_kpi_values`, `review_submissions`, `kpis.status`
4. The two reporting surfaces: Org KPI Pending Report vs KPI Scorecard Detail
5. The repair tooling (`repair-orphaned-propagations` + new status-stuck pass)
6. Counting/classification logic in every surface (Pending / Entered / Propagated / Stuck)

**Out of scope:** non-org-level KPIs, scoring math, manager-and-above review stages.

---

### Method — 6 audit passes

**Pass 1 — Data integrity census (DB-only, read-only)**
For every active period (last 12 months), count rows in each of these 9 buckets:

| # | Signature | Meaning |
|---|---|---|
| A | `kpis.status='kra_set'` + no `org_kpi_values` row | Truly empty (correct) |
| B | `kpis.status='kra_set'` + `org_kpi_values` exists + no submission | **Half-propagated** |
| C | `kpis.status='kra_set'` + `org_kpi_values` exists + submission exists | **Status-stuck** |
| D | `kpis.status='self_review'` + `org_kpi_values` missing | Manual entry (no propagation) — verify legitimate |
| E | `kpis.status='self_review'` + `org_kpi_values` exists + submission missing | Impossible — flag |
| F | `org_kpi_values.status='propagated'` + 0 employees actually advanced | Bulk propagation failure |
| G | `org_kpi_values.status='draft'` + age > 7 days | Abandoned drafts |
| H | Multiple `org_kpi_values` rows for same (cat, kra, kpi, period) | Duplicate definitions |
| I | `kpis.is_org_level=true` but no `org_kpi_data_owners` mapping | Orphaned ownership |

Output: a CSV per period showing counts in each bucket + a summary heatmap.

**Pass 2 — RPC behaviour audit (read-only code review)**
Read `propagate_org_kpi_value` end-to-end. Document:
- Exact transactional boundary (what's inside `BEGIN/COMMIT`?)
- Failure modes that can leave partial state
- Whether the v2.65.6 forward-guard covers all failure paths or only the one that surfaced
- What happens on RLS denial mid-loop (does it abort or skip?)

**Pass 3 — UI classification audit (code review)**
For each of the 4 surfaces below, write down the exact predicate it uses to classify a row:

| Surface | "Pending" predicate | "Entered" predicate | "Propagated" predicate | "Stuck" predicate |
|---|---|---|---|---|
| OrgKpiDataEntry main grid | ? | ? | ? | ? (newly added) |
| OrgKpiPendingReport sheet | ? | ? | ? | ? |
| Scorecard Detail report | ? | ? | ? | (none) |
| Employee dashboard | ? | ? | ? | (none) |

Goal: prove all four surfaces use the **same** definitions, or list exactly where they diverge.

**Pass 4 — Counting unit audit**
Confirm every "count" in every surface declares its unit (KPI cards vs employee-assignments vs submissions). Flag any count that's ambiguous in the UI (after v2.65.7 only one tile was clarified — audit the rest).

**Pass 5 — Repair tooling coverage audit**
For each of the 9 signatures from Pass 1, mark which is covered by which repair tool:

| Signature | `repair-orphaned-propagations` (scan) | `repair-orphaned-propagations` (scan_stuck) | `reconcile_workflow_statuses` | None |
|---|---|---|---|---|
| B (half-propagated) | ✓ | | | |
| C (status-stuck) | | ✓ (new) | | |
| E, F, G, H, I | ? | ? | ? | ? |

Identify gaps where no tool exists.

**Pass 6 — Audit-trail completeness**
For every state transition in the org-KPI lifecycle (draft → propagated → submitted → advanced → stuck-recovered), confirm a `kpi_audit_logs` entry exists. List any silent transitions.

---

### Deliverables (in this loop, after approval)

1. **`docs/audits/org-kpi-data-entry-2026-04.md`** — full written audit with:
   - Census numbers per period
   - RPC failure-mode table
   - 4-surface classification matrix
   - Coverage matrix
   - Audit-trail gap list
2. **`/mnt/documents/org-kpi-gap-census.xlsx`** — raw counts per period for all 9 signatures, reviewable by user.
3. **Ranked fix list** — each gap tagged P0/P1/P2 with effort estimate. No code written; user picks what to implement next.

### What this loop will NOT do

- No DB migrations
- No edge function changes
- No UI changes
- No data repair execution

This is purely an inspection + report loop. After you read the audit, you decide which P0/P1 items to schedule.

### Risk & Impact

- **Data:** read-only.
- **Workflow:** none.
- **Output:** one markdown report + one xlsx + a ranked list.
- **Time:** ~1 working session of focused inspection.

### Why this is the right next step

Three back-to-back patches in one week on the same surface = the surface needs a proper audit, not a 4th patch. This produces the map; you choose the route.

