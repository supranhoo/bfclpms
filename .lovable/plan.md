

## Plan — Re-evaluating the Three "Overdoing" Claims

I audited each claim against the actual code/schema. Verdict: **2 of 3 are false alarms; 1 is partially valid but small-scope.** No big refactor warranted.

---

### Claim 1 — `nk()` Natural Key Joins on `kra_name`/`kpi_name`

**Verdict: FALSE ALARM. Do not change.**

Evidence:
- `nk()` exists in **3 client-side files only** (`OrgKpiDataEntry.tsx`, `useOrgKpiDataOwner.ts`, `useOrgLevelKpis.ts`) — used to build **JS Map keys** for in-memory grouping after the rows are already fetched. It **never runs in a SQL JOIN**.
- The actual DB joins use **`category_id + kra_name + kpi_name + review_period + review_year`** which is backed by a **UNIQUE INDEX** (`20260106132841_*.sql` line 19). Postgres uses this index — no string manipulation per row.
- Server-side matching in `propagate_org_kpi_value`, `change_org_kpi_scope_cascading`, `trg_sync_org_status_to_future_open_periods`, etc. is all **plain equality on indexed columns** — no `lower()`, no `regexp_replace()`.
- The `category_id` is already a UUID FK; `kra_name`/`kpi_name` are governed by the KRA Library Master, so non-breaking-space drift is prevented at the source.

Adding a `kpi_template_id` or `content_hash` would be a multi-month refactor of every KPI row, every audit log, every report, and every import path — for **zero performance gain** and the introduction of a new identity that has to be kept in sync with the human-readable name everyone already uses.

**Action: no change. Document the rationale.**

---

### Claim 2 — Redundant `achieved_value` Storage in `review_submissions`

**Verdict: FALSE ALARM. The current design is correct for HR audit law.**

Evidence:
- `review_submissions.achieved_value` is **not a cache** — it is the **employee's submitted self-value at submission time**, which by HR policy must be **immutable per submission**. Org KPI propagation pre-fills it but the employee/reviewer can subsequently amend their own row (sub-factors, remarks, evidence, score overrides).
- The 8-stage scoring fallback chain (`mem://architecture/pms/universal-scoring-logic`) and `final_score` immutability rule (`mem://features/review/final-score-governance-and-immutability`) **explicitly require a frozen per-employee snapshot** so that approved scores can never silently change when an admin edits the OKV row years later.
- A live FK to `org_kpi_values.id` would mean: edit one OKV → 5,000 already-approved final scores silently change → audit/legal nightmare.
- Storage cost: a numeric column × 5,000 rows = ~40 KB. This is not a cost concern.

The user's "fix" (live FK lookup) would directly violate `final-score-governance-and-immutability` which has been explicitly enforced across multiple migrations.

**Action: no change. Document why this is intentional immutability, not redundancy.**

---

### Claim 3 — One Audit Row per Propagated KPI

**Verdict: PARTIALLY VALID but the proposed fix is wrong. Small optimization possible.**

Evidence:
- `usePropagateOrgKpiValue.ts` line 251–259 inserts one `ORG_KPI_PROPAGATED` row **per KPI** in `kpi_audit_logs`.
- These per-KPI rows are **load-bearing**, not noise:
  - `KpiTimeline.tsx` (line 89) renders them in each employee's Review Journey.
  - `KpiJourneySection.tsx` (line 522) labels them.
  - `repair-stepped-back-siblings/index.ts` (line 81–82) **reconstructs submission data from these rows** for the rollback engine.
- Collapsing them into a single `ORG_KPI_BULK_PROPAGATED` row with a JSON blob would **break three downstream features**: per-KPI timeline display, per-KPI journey labels, and the step-back recovery engine.

What **is** valid: the existing `PROPAGATION_PARTIAL` summary row (migration `20260421173624_*.sql` line 122–137) already inserts one row per skipped KPI — that one **could** legitimately collapse into a single summary because nothing reads it per-KPI.

**Proposed light optimization (only if you want it):**
- Keep `ORG_KPI_PROPAGATED` per-KPI (required by 3 features).
- Add an additional **single** `ORG_KPI_BULK_PROPAGATION_SUMMARY` row per propagation call carrying `{batch_size, propagated_count, skipped_count, owner_id, period}` — useful for analytics dashboards without touching the per-KPI rows.
- Optionally compact `PROPAGATION_PARTIAL` from N rows to 1 summary row (no consumer reads it per-row today).

---

### Recommended Action: Documentation-Only Update (no code changes)

Because the first two claims would actively damage the system and the third has no net benefit, the deliverable is a **single documentation entry** that records the rationale so this doesn't get reopened later.

#### Files to update

1. **`DOCUMENTATION.md`** — new section §"Design Decisions & Rejected Refactors" (v2.66.7.3):
   - Why client-side `nk()` is not a perf concern (it's a JS Map key, not a SQL predicate).
   - Why `achieved_value` is intentionally duplicated per submission (immutability mandate).
   - Why `ORG_KPI_PROPAGATED` is per-KPI by design (consumed by 3 features).

2. **`POLICY.md`** — append:
   - "Submission Snapshot Immutability": once a value lands in `review_submissions`, it is the employee's frozen submission and is never recomputed from the OKV source.
   - "Per-KPI Audit Granularity": every propagation/score event must be individually addressable for timeline display and rollback recovery.

3. **`mem://features/admin/org-kpi-management-suite`** — add note (13): "Submission snapshot is immutable per HR audit policy; OKV-to-submission link is by-value, not by-FK."

4. **`mem://architecture/pms/universal-scoring-logic`** — add note: "review_submissions stores frozen submission values per HR immutability policy; never replace with live FK to source tables."

#### Optional follow-up (not in this loop unless requested)

- Add `ORG_KPI_BULK_PROPAGATION_SUMMARY` summary row alongside per-KPI rows (purely additive, no consumer impact).
- Compact `PROPAGATION_PARTIAL` from N rows to 1 summary row.

### Risk & Impact Report

- **Data Impact**: None — documentation only.
- **Workflow Impact**: None.
- **UI/UX**: None.
- **Regression Risk**: Zero.
- **Mitigation**: By documenting the rationale, future contributors won't re-propose these refactors.

### Out of Scope

- Any change to the schema, RPCs, propagation flow, audit logging, or `nk()` helper.
- The optional bulk-summary audit row (deferred unless requested).

### Deliverables

- DOCUMENTATION.md v2.66.7.3 entry (Design Decisions & Rejected Refactors).
- POLICY.md additions (Snapshot Immutability + Per-KPI Audit Granularity).
- Two memory file updates.

