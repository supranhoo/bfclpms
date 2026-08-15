# Fix the duplicate "Power generation from 45 MWh/AFBC" rows

## What I found (verified against the live data)

Both console rows come from KPI texts that are *almost* the same, but not byte-identical. For August 2026:

| Row in your screenshot | Employees | Stored title | Formula | Scoring logic |
|---|---|---|---|---|
| 02 "Power generation from 45 MWh/AFBC" | 12 | clean title | `(incentive %)` | `=>20% incentive = 5, 15% = 4, 10% = 3, 95% target achieved = 2, 90% = 1, <90% = 0` |
| 03 "Power generation from 45 MWh/AFBC (incentive %)(Aug-Sep,...)" | 8 | whole raw text kept as the title | none | `20% incentive = 5, 15% = 4, 10% = 3, 5% = 2, 0% = 1,` |

So there are two separate causes stacked on top of each other:

1. **A bad split, not a typo in the name.** Row 03's raw text was never split into a clean title — the entire string (including the month brackets) was stored as the title. The BU Console groups by title, so it cannot see row 03 as the same KPI as row 02.
2. **A genuine content difference.** The two raw texts also carry *different scoring ladders* (`=>20%...` with target-achievement bands vs `20%...` with 5%/0% bands). That is a real definition difference, not cosmetic — so after grouping they should still be visible as two variants until someone decides which ladder is correct.

Also worth knowing: 66 rows of this KPI (Jan-Jun 2026 periods) are still unsplit. Those are pre-July-2026 and are intentionally left alone by the forward-only rule.

## The fix (no code change needed for step 1)

**Step 1 - correct the split (Admin -> KPI Standardization -> Text Split tab).**
Find the grouped row whose text starts "Power generation from 45 MWh/AFBC (incentive %)(Aug-Sep,...". Set:
- Title: `Power generation from 45 MWh/AFBC`
- Description: `(incentive %)(Aug-Sep,Oct-Nov,Dec-Jan,Feb-Mar,Apr-May)`
- Formula: `(incentive %)`
- Scoring logic: the `20% incentive = 5, ...` ladder as-is

Saving applies to every duplicate of that exact text in one go (all 8 August rows plus the July rows), writes an audit run, and is rollback-able. It only touches fiscal-2026-onward rows, so history is untouched.

After this, the console shows **one** row "Power generation from 45 MWh/AFBC" with 20 employees and a **"2 variants"** chip - the two scoring ladders stay distinguishable.

**Step 2 - decide the scoring ladder.** If the two ladders are supposed to be the same, pick the correct one and apply it to the other variant from the same Text Split screen (or from Admin KPI Editor for the affected employees). If they are genuinely different incentive schemes, leave them as two variants - that is the correct representation.

## What I would change in the product so this stops recurring

1. **Surface the fix from where you saw the problem.** Add a "Fix text split" action on a BU Console KPI row (admins only) that deep-links to the Text Split tab pre-filtered to that exact KPI text, instead of making you hunt for it.
2. **Flag look-alike titles in the console.** When two title nodes under the same KRA normalise to the same leading text (case, spacing, punctuation and trailing bracketed month lists ignored), show an amber "Possible duplicate" chip on both rows with the reason, so a bad split is visible at a glance rather than looking like two real KPIs.
3. **Make "no title detected" impossible to leave behind.** Rows where the split produced a title longer than ~120 chars, or a title that still contains the scoring/month text, get counted as "Needs review" in the Text Split summary so they are worked off deliberately rather than silently shipping as separate console rows.

## Technical notes

- Backend already supports this: `kpi_split_set_parts_by_name(p_kpi_name, p_title, p_description, p_formula, p_scoring_logic)` is admin-only, audited into `kpi_text_split_audit`, and guarded to fiscal start year >= 2026. No migration needed for the data fix.
- Console grouping (`bu_console_tree`, ADR-270) keys on `kpi_title` with variants derived from description/formula/scoring/target, so correcting the title is sufficient to merge the rows.
- The look-alike detection would be a read-only addition to the tree RPC's output (a normalised-title match count), plus a chip in `BuConsoleTree.tsx` - no writes, no scoring impact.
- Docs: ADR-273 plus a POLICY note that a mis-split title must never be presented as a distinct KPI in the console.

## Question before building

Step 1 fixes today's rows immediately. Do you want me to also build items 1-3 (the deep-link action, the duplicate flag, and the stricter "needs review" rule), or only the data correction for now?
