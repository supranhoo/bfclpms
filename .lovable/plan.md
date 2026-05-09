
## What you are seeing

Three surfaces, three different verdicts for the **same** employee (Y R V S Murthy / Create & Implement New SOP / April 2026):

| # | Surface | What it says | Where it gets its truth |
|---|---|---|---|
| 1 | Org KPI card header (Org KPI Data Entry) | Stage = **Manager Check**, Achieved 13, Rating 5 | **Card-level** status — ADR-055 fact-based: "every mapped child KPI is past `kra_set`" → effectively propagated |
| 2 | Per-employee row in the same scoped table | **Not propagated** (orange pill) | **Per-row** status — derived from `propagatedEmpIdsByKey` (snapshot RPC) + `submissionFallbackMap`. Falls back to `entered` whenever the row's employee_id is missing from BOTH sets, even if the child `kpis` row already advanced. |
| 3 | Audit Review (View KPI Details) | Self 13 / Rating 5, Manager 14 / Rating 5, stage Manager Check | Reads `review_submissions` directly — the actual scorecard truth. |

So the data is correct end-to-end — the **child `kpis` row is in `manager_check` and `review_submissions` exists**. Only the per-row pill in the scoped table disagrees.

## Where the gap is

`src/pages/admin/OrgKpiDataEntry.tsx` lines ~561-602 build each `ScopedRow.status` from **two narrow proxies for "propagated"**:

```ts
const isPropagatedFact = kk2_propagatedEmps.has(empId);   // snapshot RPC
const fb = submissionFallbackMap?.get(`${kpiKey}||${empId}`); // submissions fallback
if (isPropagatedFact || fb) rowStatus = 'propagated';
else if (okvHasValue) rowStatus = 'entered';   // ← the orange "Not propagated" pill
```

Meanwhile the **card** pill (and the Propagate dialog) use a much simpler, authoritative predicate from `src/lib/orgKpiStatus.ts` / ADR-055:

```ts
isAlreadyAdvancedPastKraSet(mappedEmpIds, kraSetEmpIds)
// i.e. employee's child kpis.status !== 'kra_set'  →  propagated
```

`kraSetEmpIdsByKey` is **already in scope** in `OrgKpiDataEntry.tsx` (line 227) — it is the same data the card uses. The per-row code path simply never consults it, so any employee whose `kpis.status` advanced through a path that didn't populate `propagatedEmpIdsByKey` (legacy propagation, repair RPC, sibling percolation, manual admin save) shows as "Not propagated" while the card above shows propagated and the scorecard shows Manager Check. That is the **drift** you are seeing.

This is the same class of bug ADR-055 fixed at the card level — we just never extended it to the scoped table rows.

## Fix (frontend only — no DB changes, no policy change)

### 1. Single source of truth for "propagated" — per row

Add one helper in `src/lib/orgKpiStatus.ts`:

```ts
export function deriveScopedRowStatus(input: {
  okvStatus: string | null;
  okvHasValue: boolean;
  isInPropagatedSet: boolean;        // snapshot RPC truth
  hasSubmissionFallback: boolean;    // review_submissions truth
  isPastKraSet: boolean;             // ADR-055 fact: kpis.status !== 'kra_set'
}): 'pending' | 'entered' | 'propagated' | 'approved'
```

Order of precedence (matches ADR-055):
1. `okvStatus === 'approved'` → `approved`
2. `isPastKraSet || isInPropagatedSet || hasSubmissionFallback` → `propagated`
3. `okvHasValue` → `entered`
4. else → `pending`

`isPastKraSet` is the **new** signal that closes the gap, and it dominates: if the child KPI has moved on, the row is propagated regardless of whether OKV.status was ever flipped.

### 2. Use it in `OrgKpiDataEntry.tsx`

- Import `deriveScopedRowStatus`.
- In the employee-scope `scopedRows` builder (line 562), pass `isPastKraSet = !kk2_kraSetEmps.has(empId)` where `kk2_kraSetEmps = kraSetEmpIdsByKey.get(kk2)`.
- Do the same in the department-scope builder (line 484) using the dept's mapped employees.

### 3. Make the table header summary use the same definition

`OrgKpiScopedEntryTable.tsx` (lines 106-108) counts propagated/not-propagated from `row.status`, so once step 2 lands the header counts ("X propagated / Y not propagated") will automatically agree with the per-row pills and with the card pill above. No table changes needed.

### 4. Tests (regression guardrail)

- New unit test `src/test/orgKpiScopedRowStatus.test.ts` — covers the four-input matrix, especially the case the user hit: `okvStatus='entered', okvHasValue=true, isInPropagatedSet=false, hasSubmissionFallback=false, isPastKraSet=true` → `propagated`.
- Extend `src/test/orgKpiStatusShared.test.ts` so the row-level helper and the card-level helper agree on the "every child advanced" scenario.

### 5. Policy & doc sync (no behavior change, just record the rule)

- `POLICY.md` — extend the §111.x ADR-055 entry: "The fact-based 'past `kra_set`' override applies to BOTH the card-level pill and the per-row pill in the scoped table. Anywhere the UI labels a row 'propagated', it must consult `kraSetEmpIdsByKey` first."
- `DOCUMENTATION.md` — append RCA-2026-05-09 with the three-surface evidence and the unification.
- `mem://features/admin/org-kpi-propagation-truth.md` — add row-level rule.

## What this fix does NOT do (intentionally)

- It does not write to the database, does not flip stale `org_kpi_values.status='entered'` rows to `propagated`. The row data already shows correctly in the scorecard; we are aligning the **display**, which is the actual user complaint. Backfilling OKV.status is a separate Data Repair concern (already covered by the existing "Repair Gap" tool).
- It does not touch `propagate_org_kpi_value`, the snapshot RPC, or any submission write path. Those remain authoritative for *creating* propagation; this fix only makes the *read* model honest.
- It does not change the Propagate dialog — that already uses ADR-055 via `summarisePropagationPreview` and has been correct.

## Risk & Impact

- **Data**: none — read-only display change.
- **Workflow**: none.
- **UI**: rows that were misleadingly labelled "Not propagated" while the child KPI was already in review will now correctly show "Propagated", matching the card and the scorecard. No false-positive risk because `kraSetEmpIdsByKey` comes from the same snapshot RPC used by the card.
- **Regression**: low — confined to one helper plus two call sites; covered by new unit tests.
