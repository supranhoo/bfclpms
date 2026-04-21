

## RCA — Why "Org KPI Data Entry" shows ~10 pending but the report shows 21

**Both numbers are correct under their own definition. The gap is 14 rows that are truly broken — same v2.65.6 half-propagation bug, in rows that escaped the earlier repair.**

### Direct DB evidence (Biswajit, March 2026)

| Bucket | Count |
|---|---|
| `kpis` rows in `status='kra_set'` (what the report calls "Pending") | **21** |
| ↳ rows with `org_kpi_values.achieved_value` filled but **no** `review_submissions` row → **half-propagated** | **14** |
| ↳ rows with submission row created but `kpis.status` still `kra_set` → **status-stuck** | **2** |
| ↳ rows truly empty (no value entered) | **5** |
| Org KPI Data Entry "Pending Report" rows (counts only the 5 truly empty) | **5–10** |

### Why the gap exists

The "Pending Report" on Org KPI Data Entry (`OrgKpiDataEntry.tsx` lines 919/940/963) classifies a row by `org_kpi_values.achieved_value`:
- value present + status `propagated`/`approved` → **"Propagated"** (hidden from Pending)
- value present + other status → **"Entered"** (hidden from Pending)
- value absent → **"Pending"**

The Scorecard Detail report classifies by `kpis.status`:
- `kra_set` → **"Pending"** (regardless of whether `org_kpi_values` was filled)

When propagation half-fails — value lands in `org_kpi_values` but `review_submissions` is never created and `kpis.status` stays `kra_set` — the two views diverge:
- Org KPI Data Entry says: "value entered, you're done" ✅
- Scorecard Detail says: "still pending review" ✅
- Reality: stuck. Employee can't submit, manager can't review.

### Org-wide footprint (March 2026, all data owners)

- **14 half-propagated rows** across **6 distinct KPIs** affecting **13 employees** (all under Biswajit)
- **4 status-stuck rows** (have submission, but `kpis.status` never advanced) — different bug variant

Examples confirmed in DB:
- "Handle all breakdowns…" (Monthly): 3 employees half-propagated
- "Raw Material Plan & Other MIS" (Monthly v2 — Ramchandra & Subhransu): 2 half-propagated
- "Refractory life - Campaign life tonnage wise": multiple half-propagated
- "Pending metal for jigging" (Anant): half-propagated
- "Consumable cost" (Jitendra), "Ensure target availability of furnace" (Mandala), "Handle all breakdowns E&I" (Mandala), Bi-Monthly variant (Prabhat): all half-propagated

### Why the previous repair didn't fix these

The user approved the repair plan two messages ago but the repair tool was **never actually executed** (it required an admin to click "Repair Orphaned Propagations" in the UI, which doesn't appear to have been done). The forward-guard from v2.65.6 is in place and is preventing **new** half-propagations, but the **historical** rows remain.

The 4 status-stuck rows (submission exists but `status` still `kra_set`) are a **second bug variant** that the existing "Repair Orphaned Propagations" tool may not handle, because it likely keys off "no submission row exists".

---

## Plan — Two-part repair, no new code

### Part 1 — Run the existing Data Repair tool (handles the 14 half-propagated rows)

**Action (admin, in UI):**
1. Open **Admin Settings → Data Repair → "Repair Orphaned Propagations"**.
2. Click **Scan** — expect **14 rows** listed for March 2026.
3. Verify the list matches the KPIs above (Handle all breakdowns, Raw Material Plan, Refractory life, Pending metal for jigging, Consumable cost, Ensure furnace availability).
4. Click **Repair** — this will, for each row:
   - Create the missing `review_submissions` row from `org_kpi_values.achieved_value`.
   - Compute `self_score` and `self_rating` from the KPI's R5–R1 thresholds.
   - Advance `kpis.status` from `kra_set` → `self_review`.
   - Write a `kpi_audit_logs` entry.

**Expected outcome:** Scorecard Detail "Pending" count for Biswajit drops by 14 (from 21 → 7). Org KPI Data Entry "Pending Report" count is unchanged (already excluded these from "Pending"). Both views converge on the same 5–7 truly-empty rows.

### Part 2 — Extend the repair tool to handle the 4 status-stuck rows

The existing tool likely targets the signature `org_kpi_values has value + no review_submissions`. The 4 status-stuck rows have a different signature: `org_kpi_values has value + review_submissions exists + kpis.status='kra_set'`. They need their own repair.

**Add a second scan/repair pass to `useRepairOrphanedPropagations` (or create a sibling hook `useRepairStatusStuckOrgKpis`):**

- **Scan signature:** `kpis.status='kra_set'` AND `is_org_level=true` AND a `review_submissions` row exists for that `kpi_id` with non-null `self_score`.
- **Repair action:** simply `UPDATE kpis SET status='self_review' WHERE id=…` (no submission creation needed — it already exists). Audit-log it.
- **UI:** add a second card in Data Repair: "Repair Status-Stuck Org KPIs" with dry-run + confirm.

~50 lines. Reuses existing `ConfirmDestructiveDialog` and audit pattern.

### Part 3 — Reconcile the two reports' definitions (UI clarity)

Add a second classification in `OrgKpiDataEntry.tsx` `pendingReportRows` so a row with value entered but `kpis.status='kra_set'` for any of its assigned employees is flagged as **"Stuck"** (orange) instead of "Propagated" (green). This makes the half-propagation visible on the Org KPI Data Entry page itself, so the data owner knows to ask admin for repair instead of thinking "I'm done".

Implementation:
- Pull `kpis.status` for each employee in the same fetch that populates `mappedEmployeesMap`.
- In the row-classification block (lines 919/940/963), add: if `hasValue` but **any** matching `kpis` row is still `kra_set`, mark `status='Stuck'` and include in Pending Report.
- Add "Stuck" filter chip alongside Pending/Entered/Propagated.

~40 lines. Pure additive, no logic regression.

### Files touched

| File | Change |
|---|---|
| `src/hooks/useRepairOrphanedPropagations.ts` (or new sibling) | Add status-stuck signature + repair pass. |
| `src/components/admin/DataRepairPanel.tsx` (or wherever the existing repair card lives) | Add "Repair Status-Stuck Org KPIs" card. |
| `src/pages/admin/OrgKpiDataEntry.tsx` | Add "Stuck" classification + filter chip; cross-check `kpis.status` in row builder. |
| `src/components/admin/OrgKpiPendingReport.tsx` | Include "Stuck" rows in pending-only sheet; add column note. |
| `DOCUMENTATION.md` | v2.65.8 — Status-stuck repair pass + "Stuck" classification on Org KPI Data Entry. |
| `mem://features/admin/data-repair-engine` | Append status-stuck workflow. |

### Out of scope

- No DB schema change.
- No change to Scorecard Detail report — it's correct.
- No change to `propagate_org_kpi_value` RPC — bug is upstream/historical.
- No automated cron repair.

### Risk & Impact

- **Data:** Part 1 creates 14 `review_submissions` rows + advances 14 `kpis.status`. Part 2 advances 4 `kpis.status` only (no new rows). Audit-logged. Reversible via existing rollback.
- **Workflow:** affected employees' KPIs jump from "KRA Set" → "Self Review" with pre-filled values. Matches the state they should have been in if Propagate had succeeded.
- **UI/UX:** Org KPI Data Entry gains a "Stuck" status chip. Pure additive.
- **Regression risk:** low. Status-stuck repair is the smallest possible operation (single column update). "Stuck" classification reads same data already loaded.
- **Mitigation:** dry-run preview required for both repair passes; admin confirms explicitly.

### Why this closes the loop properly

- Part 1 fixes the 14 historical half-propagations the previous plan identified but never repaired.
- Part 2 catches a sibling bug variant the existing tool misses.
- Part 3 makes the Org KPI Data Entry page **honest** — it stops claiming "Propagated" for rows that didn't actually reach the workflow, so the discrepancy you just hit can't recur silently.

