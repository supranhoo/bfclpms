## Plan — Fix Misleading "N/A" in Self Column for Org KPIs

### What the user is seeing

On Subhransu Sekhar Nayak's scorecard (Feb 2026), the KPI **"Proactive Safety Reporting (UA, UC, & Near Miss)"** — an **Org KPI — Employee** scoped, Data-Owner-fed — shows:
- Achieved: **157** (correct, sourced from `org_kpi_values`)
- Self column: **N/A** ← perceived as a bug
- Manager: 5, Final/Status visible

### Root Cause (Confirmed)

DB state for this row (`kpi_id 74069bc0-…`):
- `is_org_level = true`
- `review_submissions.self_score = NULL`
- `review_submissions.achieved_value = NULL` (UI value 157 comes from `org_kpi_values` via `getOrgKpiValue` — by design per the Submission Snapshot Immutability policy + Org KPI propagation)
- `manager_score = 5`, status `approved`

In `src/components/review/KpiDetailsTable.tsx` (lines 606–607), the rendering rule is:
```ts
const showNA = score === null && (stageCompleted || (submission?.is_na && stageReached));
```

For Org KPIs, the **`self_review` stage is bypassed** — the employee never enters a self-score; the achieved value comes from the Data Owner via `org_kpi_values`. So `self_score` is **legitimately NULL**, not "missing". But the table treats `self_review` as a normal completed stage with a missing score → renders the amber **N/A** badge.

This is consistent with the existing memory rule for Org KPI propagation (Data Owner → `org_kpi_values` → fallback for Achieved column) and with POLICY §88 (submission snapshots are frozen). The N/A pill is purely a UI mis-classification, not a data bug.

(Note: the screenshot status badge "Manager Check" vs DB `approved` is a separate stale-cache effect already addressable via the v2.66.7.23 Refresh button — out of scope here.)

### The Fix

In `src/components/review/KpiDetailsTable.tsx`, inside the score-column render branch:

1. **Detect the bypass case** for the Self column on an Org KPI:
   ```ts
   const isOrgKpiSelfBypass =
     col.key === 'self_score' &&
     kpi.is_org_level === true &&
     score === null &&
     !submission?.is_na;        // genuine N/A still wins
   ```
2. **Render an em-dash with a tooltip** instead of the amber N/A badge:
   - Visual: `—` in muted color (matches the existing `renderScoreCell(null)` styling).
   - Tooltip: *"Self-review is not collected for Org KPIs. The achieved value is provided by the Data Owner."*
3. Keep all other branches untouched — genuine N/A (`is_na=true`), Re-review (downstream score evidence), and stage-completed-with-missing-self-score for non-Org KPIs all behave as before.
4. Same treatment will naturally apply to other `review_period`s where the Org KPI was approved without a self entry — no period-specific logic needed.

### Files to Change
| File | Change |
|---|---|
| `src/components/review/KpiDetailsTable.tsx` | Add Org-KPI Self-bypass branch in the score-column renderer; wrap the muted dash in a `Tooltip` with the explanatory text |
| `src/test/bugBountyFixes.test.ts` | Add **BUG-023** asserting: (a) Org KPI + null self_score does not produce the amber N/A badge; (b) non-Org KPI behaviour is unchanged; (c) `is_na=true` still wins |
| `DOCUMENTATION.md` | v2.66.7.25 changelog entry — Self column for Org KPIs renders a tooltipped em-dash instead of N/A |
| `POLICY.md` | §96 — Org KPIs do not collect self-reviews; UI surfaces this as an em-dash with explanatory tooltip, never as "N/A" |

### Risk & Impact Report
- **Data impact:** None — UI-only change. No schema, RLS, or score data touched.
- **Workflow impact:** None — does not alter who reviews or scores anything.
- **UI/UX:** Org KPI rows lose the misleading amber "N/A" pill in the Self column (and gain a tooltip). All non-Org KPI rendering is byte-identical.
- **Regression risk:** Low. Branch is gated on `kpi.is_org_level === true && col.key === 'self_score' && !submission?.is_na`, so it cannot affect other KPIs, other columns, or genuine N/A rows.
- **Mitigation:** New BUG-023 test + the existing manual Refresh button (v2.66.7.23) lets users re-validate after the fix ships.

### Out of Scope
- The stale "Manager Check" status badge in the screenshot vs DB `approved` — this is a cache freshness issue solvable with the existing Refresh button; no logic change needed.
- Any change to Org KPI propagation, `org_kpi_values`, or the Self-review submission engine.
- The Self column behaviour for non-Org KPIs (genuine missing self-scores still surface as N/A — that is correct).
