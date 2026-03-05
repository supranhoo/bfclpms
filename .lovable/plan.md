

# Reuse KpiReviewPanel in MentionedKpiSheet

## Approach
Instead of building custom cards, replace the entire body of `MentionedKpiSheet` with the existing `KpiReviewPanel` component. This gives mentioned users the exact same rich view that reviewers see: header with status, metrics, review journey stages, history, and observations -- all for free.

## Data Requirements
`KpiReviewPanel` needs: `KPI` (full shape with `kra_categories`), `ReviewSubmission`, `allKpis` (for history), `allSubmissions`, and optional `queries`. The current `MentionedKpiSheet` only fetches a partial KPI record and no submission data. We need to:

1. **Expand the KPI query** to fetch all fields (including `kra_categories`) matching the `KPI` type
2. **Add a submission query** to fetch the `review_submissions` row for this KPI
3. **Pass them into `KpiReviewPanel`** with `viewLevel="employee"` and `isReadOnly` semantics

## File Changes

### `src/components/review/MentionedKpiSheet.tsx`

1. **Replace `useKpiDetails`** -- fetch full KPI record with `kra_categories` join (matching the shape from `useKpis`)
2. **Add `useSubmissionForKpi`** -- new local query fetching `review_submissions` for this `kpi_id`
3. **Remove custom `ObservationItem` component** -- no longer needed since `KpiObservationsSection` inside `KpiReviewPanel` handles it
4. **Replace the sheet body** with:
   - Employee info card (keep as-is -- the profile header with avatar)
   - `KpiReviewPanel` with `viewLevel="employee"`, `isReadOnly` implied, passing the fetched KPI + submission
   - The observations section inside `KpiReviewPanel` will handle public observations with reply capability
5. **Update badge** from "Read-Only via @Mention" to "Via @Mention" since replies will be enabled through the observations section
6. **Sheet width** -- widen to `sm:max-w-2xl` to accommodate the two-column layout of `KpiReviewPanel`

### `src/components/review/KpiObservationsSection.tsx`

No changes needed -- the `viewLevel="employee"` + `isOwnKpi=false` combination already restricts write access appropriately. Mentioned users can view observations but the add/edit/delete controls are gated by role checks within the component.

## What the mentioned user will now see
- Full KPI header with status badge, category, weightage, period
- Metrics section (target, UOM, criteria, rating thresholds)
- Complete Review Journey with scores at each completed stage (Self, Manager, etc.)
- Historical trend card
- Observations section with reply threads

## Risk Assessment
- **Data access**: KPI data is accessible via `kpi_mention_access` RLS policy already in place
- **No write risk**: `KpiReviewPanel` is purely a display component; all write operations are in separate input components not rendered here
- **UI fit**: The panel's responsive grid (collapses to single column) works well inside a sheet

**1 file changed, ~40 lines net (removal of custom components offsets additions).**

