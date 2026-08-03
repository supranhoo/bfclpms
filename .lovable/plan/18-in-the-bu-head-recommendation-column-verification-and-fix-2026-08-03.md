# "18" in the BU Head Recommendation column — verification and fix

## Non-negotiable constraint (added on your instruction)

**Nothing is ever removed, blanked, cleaned or "sanitised" from recommendation text.**
If a reviewer genuinely typed `18`, or a recommendation of `18%` / `Rs 18` / "18 percent hike",
that value must survive untouched in the review form, the on-screen report, the Excel export and
the recommendations queue. This plan therefore contains:

- no `UPDATE` or `DELETE` against `annual_review_responses` or `annual_review_recommendations`;
- no filter, regex scrub, or numeric-value suppression anywhere in the export or report path;
- no rule such as "hide short/numeric recommendations".

The only permitted change is making sure each value lands under **its own** column header. A
correct `18` stays a visible `18`; a misplaced `18` moves back to the column it belongs to.

## What the data says (confirmed by direct queries)

No BU Head ever entered "18".

- BU Head recommendation text lives in `annual_review_responses.qualitative_responses -> '__overall_recommendation'`.
- Rows where that value is purely numeric, across all reviewer roles: **0**.
- Rows where it is short and contains "18": **0**.
- The only short BU Head values that exist are: blank, `ok`, `OK.`, `Exit`, `NA`.
- The most repeated BU Head entries are prose: "Please proceed as applicable." (200 rows), "Proceed as applicable." (86 rows).
- The reading function `get_annual_review_recommendations` returns its columns in the correct order
  (instance, dept head, BU head, management), and the export maps `BU Head Recommendation` from that field only.

So this is **not** reviewer-entered content and not a wrong value stored in the database. The
remaining candidate is presentation-side: a value from another column appearing under that header
in the downloaded workbook (18 is a plausible value for `Days Since Update`, `Slab %` or
`KRA Months Counted`), or the header being read against the wrong column in Excel.

The exact cause is **not yet confirmed**, so step 1 is verification, not a code change.

## Step 1 — Reproduce against the real workbook

- Use the exported `.xlsx` you downloaded (attach it), or regenerate the same export for the same
  cycle and filters.
- Read the Employees sheet programmatically and report, for the affected rows: the header row,
  the column letter sitting under `BU Head Recommendation`, the raw cell values, and the values of
  the neighbouring columns (`BU Head Comment`, `HR Score`, `Slab %`, `Days Since Update`).
- Compare each affected employee's cell against the database value for that review.

This gives a definitive answer: either the workbook cell genuinely holds 18 (export defect), or it
holds the correct text and the "18" seen belongs to a different column.

## Step 2 — Fix, only if the export is at fault

If the cell genuinely holds 18, the cause can only be header/value misalignment in the export
builder: dynamic eligibility-question headers are merged into the same row object as the fixed
columns, so a question whose header collides with a fixed column header can displace values.
The fix would then be:

- Namespace the dynamic eligibility headers so they can never collide with a fixed column header.
- Build the Employees sheet from an explicit, ordered header list instead of relying on key
  discovery from the row objects.
- Add a unit test asserting that a row carrying dynamic eligibility questions (including one whose
  text matches a fixed header) still writes every fixed column with its own value.

Explicitly **not** part of the fix: dropping numeric values, trimming short strings, or filtering
any recommendation content. The change is purely about header-to-value mapping.

If the workbook turns out to be correct, no code change is made and I report which column actually
holds the 18.

## Step 3 — Guardrail

Add a regression test asserting that `BU Head Recommendation` in the export always equals the BU
head recommendation field for a fixture row set, so future column drift fails the build.

Second test, covering your constraint directly: a fixture whose BU Head recommendation really is
`18` (and another that is `18% hike`) must export as `18` and `18% hike` — proving the fix cannot
swallow a legitimate value.

## Risk and impact

- **Data**: read-only investigation. No migration; no row is modified; no recommendation text is
  deleted or rewritten under any branch of this plan.
- **Workflow**: none.
- **UI/UX**: at most, export column headers are hardened; the on-screen report is unchanged.
- **Regression risk**: low, confined to the export builder and covered by the new test.
- **Scalability**: unchanged — no new queries in the export path.
- **Rollback**: single-file revert of the export builder.

## Documentation

If a code fix lands: an ADR entry plus a POLICY note that export sheets must be built from an
explicit header list, never from inferred object keys.