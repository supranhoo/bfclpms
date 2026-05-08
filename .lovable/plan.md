## RCA: Why the Org KPI propagation record is inconsistent

### Current verified data
For **Training & Development → Completion of Mandated Training Hours → April 2026**, active mapped employees are **50**.

Backend state now shows:
- **50 / 50** have an `org_kpi_values` value entered.
- **40 / 50** have `review_submissions` scorecard data.
- **10 / 50** still have **no scorecard submission row** and their `kpis.status` is still `kra_set`.
- **Atul Kumar Khaitan** now has scorecard data because he was individually propagated at **2026-05-08 11:43 UTC**.
- Only Atul’s `org_kpi_values.status` is now `propagated`; the other 49 still show `entered`.

### Why-Why Analysis

#### Why 1: Why does the UI now say “1 propagated / 49 not propagated”?
Because the row-level status badge reads from `org_kpi_values.status`, not directly from `review_submissions`.

Current data:
- Atul’s OKV status = `propagated`
- Other 49 OKV rows = `entered`

So the statement is technically matching the OKV status field, but it is **not the full truth** of scorecard propagation.

#### Why 2: Why do 39 other employees have scorecard data but still show OKV status `entered`?
Because propagation writes the actual scorecard result into:
- `kpis.status`
- `review_submissions`

Then the frontend separately tries to mark `org_kpi_values.status = 'propagated'` after propagation.

That second status update is not the source of truth and did not happen consistently for historical/previous propagations.

#### Why 3: Why were 10 employees still missing from scorecards after “propagate all 50”?
Because the current propagate flow loops row-by-row in the browser. For employee scope it:
1. saves all entered rows to `org_kpi_values`,
2. loops through `scopedValues`,
3. calls `propagate_org_kpi_value` once per employee,
4. then separately updates OKV status.

This is fragile. If any loop exits early, UI state is stale, preview mismatch happens, a row is skipped, or a user only propagates selected/visible rows, the system can leave:
- OKV value saved,
- but no `review_submissions` row,
- and `kpis.status` still `kra_set`.

That is exactly what the 10 remaining employees show.

#### Why 4: Why did the system not clearly report incomplete propagation?
There is a contract mismatch in the propagation RPC result.

Current database function returns keys like:
- `propagated`
- `skipped`
- `results`
- `skipped_details`

Frontend expects:
- `propagated_count`
- `skipped_count`
- `details`
- `skipped`

Because of this mismatch, the UI summary/validation can under-report or misinterpret what actually happened. This is a major RCA finding.

#### Why 5: Why is the process over-complicated?
Because propagation truth is split across three places:

```text
org_kpi_values      = entered source value + local UI status
kpis.status         = workflow stage
review_submissions = actual employee scorecard value
```

The system treats `org_kpi_values.status` as if it proves scorecard propagation, but the real proof is `review_submissions` + `kpis.status != kra_set`.

### Root Cause
The root cause is **not just bad data**. It is a process/design issue:

1. **Propagation source of truth is split.**
   `org_kpi_values.status` can disagree with actual scorecard data.

2. **Frontend and backend propagation result contracts are mismatched.**
   The RPC returns `propagated`, but the frontend reads `propagatedCount`/`propagated_count` style data.

3. **Propagation is row-by-row from the browser.**
   A 50-employee propagation should be one atomic backend operation or one well-audited batch, not 50 separate client calls plus separate status updates.

4. **UI status recently became more visible, but it exposed the wrong source of truth.**
   The “1 propagated / 49 not propagated” statement is true only for OKV status, not true for scorecard data. The more accurate current status is:
   - **40 have scorecard data**
   - **10 still missing scorecard data**
   - **49 OKV rows still incorrectly marked entered**

### Employees still missing scorecard data
These 10 currently have OKV value entered but **no `review_submissions` row**:
- Anant Shankar Shet
- Mandala Naga Raju
- Monu Kumar Soni
- Mrutyunjaya Mohanty
- Parshu Ram Shukla
- S.Lingamurthy Raju
- Sujeet Kumar Singh
- Sunkara Satyanarayana
- V.A.V.S.S. Ganapathi Varma
- Y R V S Murthy

### Risk & Impact Report
- **Data impact:** Fixing this should not alter historical approved scores. It should only repair open `kra_set` rows that already have OKV values.
- **Workflow impact:** Propagation should advance only eligible rows from `kra_set`/allowed pre-review state into scorecard data.
- **UI/UX impact:** UI wording must distinguish “value entered” from “scorecard populated”.
- **Regression risk:** Medium-high, because Org KPI propagation touches KPI workflow, scorecards, audit logs, and reporting.
- **Mitigation:** Add regression tests for mixed OKV vs scorecard states and update documentation/POLICY with one authoritative propagation definition.

## Proposed implementation plan

### 1. Fix the status definition
Change row/header propagation badges to be based on **actual scorecard state**:
- Propagated = matching `review_submissions` exists with value/N/A and `kpis.status` advanced beyond `kra_set`.
- Entered only = OKV value exists but scorecard is not populated.
- Mismatch = OKV status says propagated but scorecard is missing, or scorecard exists but OKV status says entered.

### 2. Fix the RPC/frontend result contract
Update the propagation result mapper so the frontend correctly understands both old and current backend return keys:
- `propagated` / `propagated_count`
- `skipped` / `skipped_count`
- `results` / `details`
- `skipped_details` / `skipped`

This prevents false success/false partial messages.

### 3. Stop relying on OKV status as proof
Keep `org_kpi_values.status` only as a helper display field, not the proof of propagation. The proof should come from `review_submissions` and `kpis.status`.

### 4. Add a repair action/report
Add an admin-facing repair/check path for this exact mismatch:
- “Entered but not in scorecard”
- “Scorecard populated but OKV status stale”
- “OKV propagated but scorecard missing”

For the current 10, the repair should propagate only eligible open rows and audit the action.

### 5. Add regression tests
Add tests covering:
- 50 OKV values entered, 40 scorecards populated, 10 missing → UI must show 40 scorecard populated / 10 pending, not 1/49.
- RPC result key mismatch is normalized correctly.
- Atul-style single-row propagation updates the row’s scorecard state.

### 6. Update DOCUMENTATION.md and POLICY.md
Document the policy clearly:
- “Propagated” means scorecard populated, not merely OKV status.
- OKV is the source-entry table; `review_submissions` is the scorecard table.
- Any propagation UI/report must reconcile both.

### Immediate conclusion
Your suspicion is valid: the previous statement was incomplete. The process currently over-relies on `org_kpi_values.status`; the real backend state shows **40 scorecards populated and 10 still missing**, not simply “1 propagated / 49 not propagated.”