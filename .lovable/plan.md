# Hide the amber "1 variant" badge

## What's happening

The badge is shown whenever a KPI row has **either** more than one definition variant **or** more than one weightage value:

```text
show badge  =  variant_count > 1   OR   weightage values > 1
badge text  =  "{variant_count} variant(s)"
```

Your three production KPIs each have exactly **one** definition but several weightage values (3 values, 4 values), so the row trips the second condition and then prints the first number — an amber warning that reads "1 variant". Nothing is wrong with those KPIs, and there is nothing to collapse.

The weightage spread is already reported honestly in its own column ("3 values", "4 values"), so the badge adds no information in this case.

## The change

- Show the badge **only when there is genuinely more than one definition variant** (2 or more). A single-variant KPI shows no badge, whatever its weightage spread.
- The badge keeps its current behaviour when it does appear: amber, click to expand the variant list, with "Make this one" next to it.
- The variant list stays reachable by expanding the row, so nothing is hidden away.
- Weightage spread keeps being surfaced by the Weightage column exactly as now — no change there.

## Technical notes

- `src/components/admin/bu-console/BuConsoleTree.tsx`: the badge's condition changes from `variantCount > 1 || weights.length > 1` to `variantCount > 1`. The `variantCount === 1` singular/plural branch in the label becomes dead and is removed.
- Row expansion (`expandable`) is computed separately and is not touched, so rows with weightage spread still expand.
- Regression test in the existing console layout/tree test file: a KPI with one variant and several weightage values renders no variant badge; a KPI with two variants still renders it.

## Risk

Presentation only — no data, query, or permission change. Worst case is that a user who relied on the amber badge to notice weightage spread now reads it from the Weightage column instead.
