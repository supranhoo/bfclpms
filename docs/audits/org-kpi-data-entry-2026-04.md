# Org KPI Data Entry — End-to-End Gap Audit

**Date:** 2026-04-21
**Scope:** Org-level KPIs only, Sep 2025 → Jun 2026
**Method:** 6 audit passes (DB census, RPC review, UI classification, counting unit, repair coverage, audit-trail)
**Companion file:** `/mnt/documents/org-kpi-gap-census.xlsx`

---

## Executive summary

| Headline | Number |
|---|---|
| Total org-level KPI assignments audited (12 months) | **3,057** |
| **Active integrity bugs (B + C + F)** requiring repair | **105** |
| Half-propagated rows (B) — OKV value but no submission | **14** (March 2026 only) |
| Status-stuck rows (C) — submission exists, status not advanced | **6** (Jan: 1, Feb: 1, Mar: 4) |
| **Bulk propagation failures (F)** — OKV says propagated, 0 employees advanced | **87** (Feb: 77, Mar: 8, Jan: 2) ⚠️ NEW DISCOVERY |
| Orphaned ownership (I) — KPIs with no data owner | **44 distinct** (mostly old periods) |
| Self-review w/o OKV (D) — verify legitimate | **23** scattered |

The previously-tracked symptoms (B + C = 20 rows) are dwarfed by **bucket F (87 rows)** — a third, undetected bug variant where `org_kpi_values.status` is marked `propagated` but the per-employee propagation loop completed zero workflow advances. February 2026 is the worst-affected period.

---

## Pass 1 — Data integrity census

See `org-kpi-gap-census.xlsx → "Gap Census"` sheet for full per-period numbers.

### Critical buckets (active bugs)

| Period | A: Empty | **B: Half-Prop** | **C: Stuck** | D: Self-no-OKV | **F: Prop-Fail** | I: No-Owner |
|---|---|---|---|---|---|---|
| Sep 2025 | 0 | 0 | 0 | 0 | 0 | 7 |
| Oct 2025 | 0 | 0 | 0 | 0 | 0 | 7 |
| Nov 2025 | 2 | 0 | 0 | 0 | 0 | 9 |
| Dec 2025 | 6 | 0 | 0 | 0 | 0 | 11 |
| Jan 2026 | 1 | 0 | 1 | 0 | **2** | 2 |
| Feb 2026 | 23 | 0 | 1 | 4 | **77** | 2 |
| Mar 2026 | 39 | **14** | 4 | 2 | **8** | 0 |
| Apr 2026 | 712 | 0 | 0 | 10 | 0 | 6 |
| **Totals** | **783** | **14** | **6** | **16** | **87** | **44** |

- **Bucket H (true duplicates):** 0 across all periods. The earlier `dup_count` artefact came from per-employee OKV rows being mistakenly aggregated as definitions. **Resolved — not a bug.**
- **Bucket E (impossible state):** 0. Good — no half-broken transitions out of `self_review`.
- **Bucket G (abandoned drafts > 7d):** 0. Good.

### Why bucket F was missed earlier

`org_kpi_values.status='propagated'` is set on the *definition* row (the NULL-employee_id row), but the per-employee fan-out (the loop in `propagate_org_kpi_value`) can advance 0 employees if every target KPI's status doesn't match `'kra_set'` (e.g., already advanced, or stepped back to a different state). The RPC silently returns success with `propagated_count=N` where N counts loop iterations, NOT actual UPDATE row counts. **This is a different bug class than B and C.**

---

## Pass 2 — RPC behaviour audit

Two overloaded versions of `propagate_org_kpi_value` exist (3-arg with `p_remarks`, and 2-arg legacy). Both share the same defects:

| Defect | Impact |
|---|---|
| **No transaction boundary inside loop.** Each iteration's INSERT and UPDATE are auto-committed in plpgsql implicitly, but if the UPDATE matches 0 rows, the INSERT into `review_submissions` still succeeds. | Source of bucket C (status-stuck): submission created, status never advanced. |
| **`UPDATE kpis SET status='self_review' WHERE id=… AND status='kra_set'`** silently no-ops if status is not `kra_set`. The loop counter still increments. | Source of bucket F: returns `propagated_count=N` even when N=0 employees actually advanced. |
| **No audit log entry** is written by the RPC itself. All `kpi_audit_logs` entries for propagation are written by the calling React code AFTER the RPC returns. | If RPC succeeds and UI crashes before logging, no audit trail. |
| **No RLS-denial handling.** plpgsql `SECURITY DEFINER` bypasses RLS, so this is not currently an issue, but if `SECURITY DEFINER` is ever removed the loop will silently skip denied rows. | Latent — not active. |
| **The v2.65.6 forward-guard** (presumably a check that `org_kpi_values` write succeeded before the per-employee loop) only protects bucket B, not C or F. | Confirmed by census: B=14 in March only (post-guard new ones), C+F=93 across multiple periods. |

### Recommended RPC patch (out of scope for this loop, listed as P1)
- Capture `GET DIAGNOSTICS row_count = ROW_COUNT` after the UPDATE.
- If `row_count = 0` for an `is_org_level=true` KPI, raise NOTICE, append to a `'skipped'` array in the result JSON, and DO NOT increment `propagated_count`.
- If 0 rows total advance for the entire batch, set `org_kpi_values.status` back to `'draft'` instead of leaving it `'propagated'`.
- Insert `kpi_audit_logs` row inside the loop body (currently the responsibility of the React caller).

---

## Pass 3 — UI classification matrix

| Surface | "Pending" predicate | "Entered" predicate | "Propagated" predicate | "Stuck" predicate |
|---|---|---|---|---|
| **OrgKpiDataEntry main grid** | `!hasValue` (val.achieved_value null/undefined) | hasValue && !isStuck && val.status NOT IN (propagated, approved) | hasValue && !isStuck && val.status IN (propagated, approved) | hasValue && key in `kraSetKpiRowsByKey` (any employee still kra_set) |
| **OrgKpiPendingReport sheet** | Same as above (mirrors row-classification block at OrgKpiDataEntry.tsx:932-960) | Same | Same | Same |
| **Scorecard Detail report** | `kpis.status='kra_set'` | `kpis.status IN ('self_review','manager_review',...)` | `kpis.status` past final stage | (no concept) |
| **Employee dashboard** | `kpis.status='kra_set'` | `kpis.status='self_review'` | `kpis.status` past `self_review` | (no concept) |

**Verdict:** Surfaces 1 & 2 use **OKV-centric** predicates. Surfaces 3 & 4 use **kpis.status-centric** predicates. They will **always disagree** for buckets B, C, F. The v2.65.7+v2.65.8 patches narrowed the gap by adding "Stuck" detection on surfaces 1+2, but bucket F still produces silent disagreement (Surface 1+2 say "Propagated" because OKV.status='propagated', Surface 3+4 say "Pending" because kpis.status='kra_set').

---

## Pass 4 — Counting unit audit

| Tile/Count | Unit | Labelled? |
|---|---|---|
| OrgKpiDataEntry header "X KPIs" | KPI cards | ✓ (v2.65.7) |
| OrgKpiDataEntry header "Y employees mapped" | Employee assignments | ✗ ambiguous |
| Pending Report row count | Employee assignments | ✗ ambiguous |
| Pending Report summary "X pending KPI(s)" | Mixed: counts assignments AND distinct KPIs | ✓ (v2.65.7) |
| Scorecard Detail "Pending: N" | KPI rows (=employee assignments) | ✗ ambiguous |
| Repair tool Scan result "Found N orphaned" | Submission rows | ✗ ambiguous |

**Gap:** 4 of 6 user-facing counts don't declare their unit. Only 2 were clarified in v2.65.7.

---

## Pass 5 — Repair tooling coverage

See `org-kpi-gap-census.xlsx → "Repair Coverage"` sheet.

| Bucket | Tool | Status |
|---|---|---|
| B | repair-orphaned-propagations (scan) | ✓ Covered |
| C | repair-orphaned-propagations (scan_stuck) | ✓ Covered (v2.65.8) |
| F | — | **GAP — no detection or repair** |
| I | — | **GAP — no surface lists orphaned KPIs** |
| D, G | — | GAP (low urgency: D=verify, G=preventive) |

---

## Pass 6 — Audit-trail completeness

| Transition | `kpi_audit_logs` entry written? | By whom |
|---|---|---|
| OKV draft → propagated | ✓ | React caller (post-RPC) |
| Per-employee `kpis.status` kra_set → self_review | ✗ | RPC does not log; React loops over results and logs |
| Status-stuck repair (kra_set → self_review) | ✓ | repair-orphaned-propagations edge function |
| Half-propagated repair (creates submission + advances status) | ✓ | repair-orphaned-propagations edge function |
| Bucket F silent skip (loop iteration with 0 row updated) | ✗ | **No log anywhere** — invisible failure |
| OKV.status='draft' set programmatically | ✗ | No log |
| OKV row deletion (admin Discard) | ✓ | React caller |

**Gap:** Bucket F failures are completely invisible in audit logs. The only signal is later divergence between OrgKpiDataEntry and Scorecard Detail counts — which is exactly what the user reported.

---

## Ranked fix list

See `org-kpi-gap-census.xlsx → "Ranked Fix List"` sheet for full table with effort estimates.

### P0 — Do now

1. **Run existing repair tools** (5 min admin click): cleans the 14 B + 6 C rows already flagged. Zero code.
2. **Add Bucket F repair pass** (~1h): single-purpose edge function action `scan_propagation_failures` + `repair_propagation_failures`. Detection signature: `org_kpi_values.status='propagated' AND NOT EXISTS (kpis advanced past kra_set for this definition+period+employee_id IS NULL)`. Repair: revert OKV.status to `draft` so admin can re-propagate cleanly.

### P1 — Schedule next

3. **Bucket I orphaned-ownership UI** (~2h): surface 44 unowned KPIs on Org KPI Data Entry; inline owner assignment.
4. **Atomic propagation RPC** (~2h): patch `propagate_org_kpi_value` per Pass 2 recommendations.
5. **Audit-trail completeness** (~1h): add kpi_audit_logs INSERT inside RPC loop body.
6. **Bucket D verification** (~30 min): SQL spot-check the 23 rows; either confirm benign or convert to bug ticket.

### P2 — Polish

7. **Pre-flight propagation preview** (~1h): "X will advance, Y already past, Z mismatched" before commit.
8. **Bucket G monitoring** (~30 min): scheduled scan + notification.
9. **Unit labels on remaining 4 count tiles** (~1h).
10. **Surface unification spec in DOCUMENTATION.md** (~2h).

---

## What this audit did NOT do

- No DB migrations executed.
- No edge function changes.
- No UI changes.
- No data repair executed (Part 1 of v2.65.8 plan still pending admin click).

## Next decision required from user

Pick which P0/P1 items to schedule. Recommended sequence:
1. Click "Run existing repair tools" first (instant, no code).
2. Approve Bucket F repair pass (1h, biggest impact).
3. Approve Bucket I + atomic-RPC patch as one v2.65.9 release (3h combined).

---

*Audit prepared 2026-04-21. Re-run quarterly or after any propagation-pipeline change.*