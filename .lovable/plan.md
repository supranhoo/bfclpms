

## Plan — Fix "Adherence to Monthly Budget" (Maintenance Cost Control) Auto-Scoring 0

### Root Cause (Two Bugs, One Symptom)

I queried the KPI definitions and live submissions. The KPI is **"Maintenance Cost Control (Spares & Consumables)"** — UOM `%`, criteria **Lower is Better**, `threshold_mode='absolute'`, with thresholds:

| R5 | R4 | R3 | R2 | R1 | R0 |
|----|----|----|----|----|----|
| 99% | 99.5% | 100% | **1%** ⚠️ | 101% | >101% |

**Bug #1 — Bad master-data (R2 = "1%")**  
Across **every copy** of this KPI in the `kpis` table, R2 is stored as `1%` instead of `100.5%`. This is a typo from the KRA Library / template. Because `calculatePercentageRating` (Lower is Better) walks R5 → R1 and returns the first threshold satisfied by `achieved <= threshold`, any value above 100% (e.g. 101.2%, 105%) skips R5/R4/R3, then hits the broken `R2 = 1` test — `achieved <= 1` is false — falls through to R1 = 101 (only catches values ≤ 101%), and anything strictly above 101% becomes **rating 0**. So most "over-budget" cases score 0 even when they should be R1 (101%) or legitimately 0.

**Bug #2 — Two scorers ignore R0**  
`calculatePercentageRating` (lines 433-488) and `calculateAbsoluteRating` (lines 310-356) parse R5–R1 only. R0 (`>101%`) is defined in the DB but never consulted. The "Lower is Better" branch defaults `rating = 0` whenever none of R5–R1 match, so functionally R0 works today *only by accident*. The moment an admin sets R1 to a permissive value, the implicit fallback becomes wrong. R0 should be a first-class threshold like the others.

**Why every employee shows 0 right now**  
Most current submissions for this KPI have `achieved_value > 100` (e.g. 481.40 in Department X — clearly an entry-unit mismatch, but the system still must score it as R0). With R2 corrupted to `1`, the cascade has no valid step between R3 (100) and R1 (101), and anything > 101 falls to 0. Net effect: anyone over budget = score 0, including borderline cases that should be R2.

### Fix — Three-Part Repair

**Part A — Repair master-data (R2 typo)**  
Run a one-shot data-fix migration (insert/update tool) to set `r2 = '100.5%'` on every `kpis` row where `kpi_name LIKE 'Maintenance Cost Control%'` AND `r2 IN ('1%', '1', '1.0', '1.00')`. This is reversible, audit-logged, and scoped tightly enough that it cannot touch unrelated KPIs.

Also patch the **KRA Library master template** for the same KPI so future rollover/clone operations don't re-inject the bug.

**Part B — Make R0 a first-class threshold in the scorer**  
Update `src/lib/ratingCalculation.ts`:

- `calculatePercentageRating` and `calculateAbsoluteRating`: parse `thresholds.r0` and add an explicit branch:
  - **Lower is Better**: if R0 is set and `achieved > r0_value` (or matches the `>101%` style operator) → rating 0 explicitly.
  - **Higher is Better**: if R0 is set and `achieved < r0_value` → rating 0 explicitly.
- `parseThreshold` already strips `>`/`<` operators, so `>101%` correctly parses to `101`. We just need to wire R0 through.
- Defensive guard: when thresholds are non-monotonic (e.g. R2 < R3 in a Lower-is-Better cascade) log a console warning in dev so admins catch typos early.

**Part C — Re-score affected submissions (auto-recalc)**  
After A+B, **non-frozen** submissions for this KPI need their auto-calculated score refreshed. Per `mem://architecture/pms/universal-scoring-logic` and Submission Snapshot Immutability §88, **approved/finalized submissions stay frozen** — we only touch:
- submissions where `final_score IS NULL` AND no terminal stage has signed off,
- and only the role-tier scores that were originally auto-calculated from `achieved_value`.

This is a one-time re-score script (insert-tool migration) producing a printable count of rows touched. Frozen historical scores are explicitly excluded — re-propagation must remain an explicit, audited action, not a silent overwrite.

### Files Changed

| File | Change |
|---|---|
| `src/lib/ratingCalculation.ts` | Wire R0 into `calculatePercentageRating` + `calculateAbsoluteRating`; add dev warning for non-monotonic thresholds |
| `src/lib/__tests__/ratingCalculation.test.ts` | New cases: Lower-is-Better with R0=`>101%` and achieved 101.5 → 0; corrupted R2 detected; correct R2=100.5 → R2 path |
| `supabase` data-fix migration | UPDATE `kpis` set `r2='100.5%'` where typo present; UPDATE `kra_library` master template same fix |
| `supabase` rescore migration | Recompute `self_score`/`manager_score` etc. for non-frozen submissions of this KPI; skip `final_score IS NOT NULL` |
| `DOCUMENTATION.md` | v2.66.7.14 entry — R0 threshold honored; Maintenance Cost Control master fix |
| `POLICY.md` | §scoring engine: R0 is an explicit threshold; non-monotonic thresholds flagged but not auto-corrected |
| `mem://architecture/pms/universal-scoring-logic` | Append: R0 is first-class in `calculatePercentageRating`/`calculateAbsoluteRating`; rescore touches only non-frozen scores |

### Risk & Impact Report

- **Data Impact**: Master-data UPDATE scoped by exact name + exact bad value (`r2 IN ('1%','1','1.0','1.00')`). Approved/finalized scores **untouched** (snapshot immutability). Only in-flight submissions get rescored.
- **Workflow Impact**: Affected employees' draft/manager-stage scores will jump from 0 → correct rating. This is the desired outcome (the user reported the bug).
- **UI/UX**: None — same components, correct numbers.
- **Regression Risk**: Low. R0 wiring is additive (only fires when R0 is non-null). All other KPIs that left R0 null behave identically. Test suite covers both paths.
- **Mitigation**: Tests pinned to this exact scenario; non-monotonic dev-warning prevents future master-data typos slipping through unnoticed; rescore script is idempotent and prints a dry-run count before committing.

### Out of Scope

- Building an admin UI to repair other KPI threshold typos (future improvement — could be a "Threshold Sanity Check" tool in System Settings).
- Touching `final_score` on already-approved submissions — explicitly forbidden by §88.
- Refactoring the legacy ratio-mode code paths.

