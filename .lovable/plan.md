

## Plan — Fix April Bi-Monthly Cycle Anchor Drift (158 → 147 Discrepancy)

### Root Cause Analysis (RCA)

The count gap is **not a bug in display** — it's a **data drift in cycle anchors** introduced by the rollover engine pre-v2.66.7.

**The math:**

| Period | Monthly | Daily | Bi-Monthly (visible) | Quarterly (visible) | **Total shown** |
|---|---|---|---|---|---|
| March | 142 | 4 | 10 (Feb-Mar terminating in Mar ✓) | 2 | **158** ✓ |
| April | 146 | 4 | **0** (all 14 anchored Feb-Mar → already terminated → hidden) | 1 (mid-cycle, locked) | **147** (should be ~161) |

**Confirmed in DB**: all 33 Bi-Monthly Org KPI rows in April carry `frequency_cycle_start = 'Feb-Mar'`. Same for January, February, and March. **No row has been re-anchored to `Apr-May`** despite April starting a new cycle. The v2.66.7 frequency-aware lock correctly hides them — the lock is right, the anchor is stale.

**Why it happened**: The auto-rollover engine copies `frequency_cycle_start` verbatim from the source month. Pre-v2.66.7 this was harmless because the cycle lock didn't enforce it. v2.66.7's terminal-period awareness now exposes the drift: April with anchor `Feb-Mar` is treated as already-terminated.

### Fix — Two parts

#### Part 1: Data Repair (one-shot, ~165 rows)

Re-anchor every Bi-Monthly / Quarterly / Half-Yearly / Yearly Org-level KPI row to the correct cycle for its `(review_period, review_year)`:

| Frequency | Apr 2026 anchor | May 2026 anchor | Jun 2026 anchor |
|---|---|---|---|
| Bi-Monthly | `Apr-May` | `Apr-May` | `Jun-Jul` |
| Quarterly | `Apr-Jun` | `Apr-Jun` | `Apr-Jun` |
| Half-Yearly | `Apr-Sep` (or `Jan-Jun` per fiscal) | same | same |

- Build a SQL repair via migration: `UPDATE kpis SET frequency_cycle_start = <resolved>` for all rows where `is_org_level = true` AND current anchor doesn't match the period's true cycle.
- Audit-log each correction as `KPI_CYCLE_ANCHOR_REPAIRED` (system-attributed, `performed_by = NULL`).
- Dry-run preview surfaced in **Data Repair** tab as a new tool: **"Repair Frequency Cycle Anchors"** (count + per-frequency breakdown before write).
- Idempotent: subsequent runs find no drift.

#### Part 2: Rollover Engine Hardening (prevent recurrence)

Patch `supabase/functions/auto-rollover-kpis/index.ts` to **resolve the cycle anchor at rollover time** instead of copying it forward:

```ts
// Before (drift-prone):
frequency_cycle_start: source.frequency_cycle_start

// After (cycle-aware):
frequency_cycle_start: resolveCycleAnchorForPeriod(
  source.frequency, target_period, target_year
)
```

`resolveCycleAnchorForPeriod` reuses the existing `resolveTerminalMonth` + `BI_MONTHLY_OPTIONS` / `QUARTERLY_OPTIONS` logic to pick the correct cycle the target period belongs to. Audit-log mismatches as `ROLLOVER_CYCLE_ANCHOR_RESOLVED`.

### After Fix — Expected Counts

- March: **158** (unchanged) ✓
- April: **161** (147 currently + 14 Bi-Monthly Apr-May terminating in May → still hidden in April since April is mid-cycle… so they remain hidden, but **May** will then correctly show ~14 Bi-Monthly entries terminating in May).

Wait — Bi-Monthly Apr-May terminates in **May**, so April is the locked (mid-cycle) month and they will remain hidden in April. **The expected count for April stays 147.** That's actually correct behavior per v2.66.7. The real recovery is:

- **May 2026** will correctly show the 14 Bi-Monthly KPIs (today they would be hidden because their anchor says Feb-Mar already-ended).
- **June 2026** will correctly start a new Jun-Jul cycle.

So the user should see **April 147 (correct as-is)** but the data underneath becomes truthful, and the **May/June views won't lose those 14 KPIs**.

### Documentation & Memory

- `DOCUMENTATION.md` v2.66.7.2 entry covering the anchor repair + rollover hardening.
- Update `mem://features/admin/enhanced-kra-rollover-system` with the cycle-anchor resolution rule.
- Update `mem://features/admin/data-repair-engine` to register the new repair tool.
- Update `mem://features/admin/org-kpi-management-suite` to note the anchor-truth invariant.

### Risk & Impact Report

- **Data Impact**: Updates `kpis.frequency_cycle_start` only on Org KPI rows where the anchor disagrees with the period (~165 rows). Does not touch values, status, or workflow state.
- **Workflow Impact**: KPIs that were silently hidden (because of a stale anchor) become visible in their correct terminal month. No KPI is moved to a different period; only the "which cycle does this row belong to?" metadata is corrected.
- **UI/UX**: April's count stays 147 (correct), May/June views regain the missing Bi-Monthly Org KPIs.
- **Regression Risk**: Low — the repair only flips one column on rows matching strict criteria. Rollover patch is additive (a function call replacing a verbatim copy).
- **Mitigation**: Dry-run preview before write, audit log per row, idempotent repair, and the existing v2.66.7 forward-sync trigger continues to work unchanged.

### Side-Fix: Runtime Error

The summary surfaced `Cannot read properties of undefined (reading 'rows')`. While investigating, fix any unguarded `.rows` access in the Org KPI Data Entry hooks (likely in a propagate / preview RPC handler when the response is null). Quick defensive `?? { rows: [] }` fallback.

### Out of Scope

- Re-propagating the 4 Phase A2 OKVs (still pending; values are zero).
- Fiscal-year boundary anchors for Half-Yearly Apr-Sep vs Jul-Dec (none currently exist in DB; defer until they appear).

### Deliverables

- One migration: anchor repair RPC + audit logging.
- New "Repair Frequency Cycle Anchors" tool in Data Repair tab (Scan → Preview → Apply).
- Patched `auto-rollover-kpis/index.ts` with `resolveCycleAnchorForPeriod` helper.
- Defensive guard for the `.rows` runtime error.
- DOCUMENTATION.md v2.66.7.2 changelog + memory updates.

