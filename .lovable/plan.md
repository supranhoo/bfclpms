## RCA — Why Prabhat's Bi-Monthly cycle drifted

**Symptom.** The "Achieve organization's production target" Bi-Monthly KPI for Prabhat Kumar Singh is labelled **Apr-May** in April 2026 and **May-Jun** in May/June 2026 — May appears in two overlapping cycles, which is structurally impossible.

**Evidence (DB).** Within the same org-KPI tuple (`category`/`kra`/`kpi`):

| Period | Prabhat `frequency_cycle_start` | Biswajit | Dharmendra |
|---|---|---|---|
| Jan 2026 | `Feb-Mar` | NULL | NULL |
| Feb 2026 | `Feb-Mar` | NULL | NULL |
| Mar 2026 | `Feb-Mar` | NULL | NULL |
| Apr 2026 | `Feb-Mar` | `Feb-Mar` | `Feb-Mar` |
| **May 2026** | **`May-Jun`** | `Feb-Mar` | `Feb-Mar` |
| **Jun 2026** | **`May-Jun`** | `Feb-Mar` | `Feb-Mar` |

Prabhat's May row was inserted by the **`auto-rollover-kpis` edge function** at `2026-05-01 00:00:05` cron run. The June row was inserted by the same edge function at `2026-06-01 10:31:15` (with the `ORG_KPI_AUTO_INHERITED` trigger logging it). Biswajit/Dharmendra's June row was instead created by an `admin_bulk_apply` from the April template, which preserved `Feb-Mar`.

**Root cause.** Two co-located functions hard-code a **standard Jan-anchored cycle** and silently overwrite the per-KPI offset anchor:

1. `supabase/functions/auto-rollover-kpis/index.ts::resolveCycleAnchorForPeriod()` and the call site at line 794:
   ```
   resolvedCycleStart = resolveCycleAnchorForPeriod(source.frequency, targetMonth)
                        ?? source.frequency_cycle_start;
   ```
   The resolver always returns a non-null Jan-anchored value for multi-month frequencies, so the `?? source.frequency_cycle_start` fallback never fires. For May (month_idx 4) it returns `May-Jun`; the source's `Feb-Mar` offset is discarded.

2. DB function `public.resolve_cycle_anchor(frequency, month_idx)` — mirrors the same bug:
   ```
   cycle_start_idx := (p_month_idx / cycle_len) * cycle_len;
   ```
   Used by `repair_org_kpi_cycle_anchors`, which would actively rewrite any offset anchor to the Jan-anchored one if run.

Net effect: every monthly rollover of an offset-anchored multi-month KPI (`Feb-Mar`, `May-Oct`, `Apr-Jun` quarter offsets, etc.) silently mutates the cycle anchor, producing overlapping windows and breaking POLICY §54 (single terminal month per cycle).

**Why only Prabhat is visibly broken here.** He is the **employee-scope owner** for the tuple, so `auto-rollover-kpis` rolls his row forward every month. The other employees get materialised on demand by `materialize_kpis_for_org_kpi` (which copies the template anchor verbatim) or via manual admin bulk-apply — both preserve `Feb-Mar`. Result: divergence inside one org-KPI tuple.

---

## Risk & Impact

- **Data integrity:** broken cycle membership ⇒ wrong terminal month, wrong sibling set, breaks ADR-086 percolation, breaks ADR-087 client locking.
- **Affected scope:** every employee whose multi-month KPI uses any non-Jan-anchored `frequency_cycle_start` (`Feb-Mar`, `May-Oct` Half-Yearly, `Apr-Jun`/`Jul-Sep` Quarterly, `Apr-Mar`/`Jul-Jun` Yearly, plus the synthetic anchors enabled by ADR-087).
- **Blast radius:** any month a rollover has run since the offset was introduced.
- **No data loss** — only the anchor column drifted; achieved values intact.

---

## Plan

### Step 1 — Make the cycle anchor sticky (forward-fix). Verification: code review + new unit test.

`supabase/functions/auto-rollover-kpis/index.ts`:
- Replace the `resolvedCycleStart = resolveCycleAnchorForPeriod(...) ?? source.frequency_cycle_start` line with **anchor preservation**:
  ```
  resolvedCycleStart = source.frequency_cycle_start
                        ?? resolveCycleAnchorForPeriod(source.frequency, targetMonth);
  ```
  i.e. honour whatever the source row already declares; only synthesise an anchor when the source has none. Same change at the sibling-month resolution site (`getCycleMonthsForTarget`) already reads `kpi.frequency_cycle_start`, so just the `buildNewKpi` write path needs the flip.
- Add a structured log when the anchor would have changed, for observability.

### Step 2 — Fix the DB resolver. Verification: SQL unit test on `resolve_cycle_anchor` with `month_idx=4, frequency='Bi-Monthly'` returning the **input-aware** anchor.

Replace `public.resolve_cycle_anchor` with a 3-arg variant `(p_frequency, p_month_idx, p_existing_anchor text)` that:
- Returns `p_existing_anchor` unchanged when it is a valid anchor for the frequency.
- Otherwise computes the standard Jan-anchored fallback (current behaviour) so old callers keep working.

Update `repair_org_kpi_cycle_anchors` to call the 3-arg variant and to **never** rewrite a valid offset anchor — drift is only flagged when the stored value can't satisfy any legal cycle window for the row's `review_period`.

### Step 3 — One-shot data repair for the affected tuple. Verification: re-query the 6 rows above and confirm Prabhat's May/Jun rows show `Feb-Mar`; UI label becomes `Bi-Monthly: Apr-May` (May) and `Bi-Monthly: Jun-Jul` (Jun).

Scoped migration (admin, audited) that, **for the single tuple** (category `c8fbb996…`, kra/kpi name match) and `review_year = 2026`:
- Resets `frequency_cycle_start = 'Feb-Mar'` on the two divergent Prabhat rows (`e08a5e40…` May, `42caf513…` June).
- Emits `KPI_CYCLE_ANCHOR_REPAIRED` audit rows with `system_action=true` and `reason='RCA — rollover anchor drift'`.
- No score / submission / OKV mutation.
- Idempotent (only touches rows whose anchor differs from the tuple's majority anchor).

### Step 4 — Detection guard. Verification: returns 0 drift rows after Step 3.

New read-only RPC `public.detect_org_kpi_cycle_anchor_drift()` (admin) that lists every org-KPI tuple whose rows disagree on `frequency_cycle_start` for the same `review_year`. Wire a small banner on `OrgKpiCycleAnchorRepair` admin page if any drift exists.

### Step 5 — Tests, docs, policy.
- Vitest: `auto-rollover-kpis` builder test — source `Feb-Mar` + targetMonth `May` ⇒ output `Feb-Mar` (regression for this RCA).
- Vitest: same source + targetMonth `Jun` ⇒ `Feb-Mar`.
- `docs/adr/ADR-088.md` — "Cycle anchor preservation across monthly rollover".
- Update `mem/architecture/pms/multimonth-percolation` (§ anchor stickiness invariant).
- POLICY.md §54 amendment: *the per-KPI `frequency_cycle_start` is immutable across rollover; admin override is the only legal mutation path.*

### Step 6 — Roll-back plan.
- Step 1 / Step 2 are pure code/function replacements ⇒ revert by re-deploying prior versions.
- Step 3 migration is bounded to two row IDs; reversal SQL ships in the migration file as a comment.

---

## UI Changes

- `View KPI Details` panel for Prabhat's May 2026 row: badge changes from `Bi-Monthly: May-Jun` to `Bi-Monthly: Apr-May`.
- `View KPI Details` panel for Prabhat's June 2026 row: badge changes to `Bi-Monthly: Jun-Jul`. June row will no longer appear on the May Org KPI Data Entry page (terminal of `Jun-Jul` is Jul under standard mapping, or stays Jun under Feb-Mar offset — confirmed against `deriveCycleOptionFromCycleStart` so the label is consistent with ADR-087).
- New small "anchor drift detected" banner on the admin **Org KPI Cycle Anchor Repair** page, only when drift exists.

No other UI surface changes.

## Tests
- Vitest cases in Step 5.
- SQL test for `resolve_cycle_anchor` 3-arg variant.

## Documentation / Policy
- ADR-088 created.
- POLICY.md §54 amended.
- `mem/architecture/pms/multimonth-percolation` updated.

## Out of scope
- Backfilling other tuples beyond Prabhat's. A separate audit pass (using Step 4's detector) will be planned once the forward-fix is live and Step 4 has run for ≥1 cron cycle.
- Touching `materialize_kpis_for_org_kpi` (already preserves the template's anchor).
- Any change to scoring / percolation logic.
