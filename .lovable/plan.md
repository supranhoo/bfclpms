# Show Full KPI Text in Scan Results — Build Registry

## Problem

In the **KPI Standardization → Build Registry** tab, fuzzy-match scan results truncate KPI text in three places, so admins can't read the full KPI before deciding how to bucket variants:

1. **Group header title** — hard-cut at 100 characters with `...` appended (e.g. *"completion of mandated average training hours - description: fosters skill development and a learn..."*).
2. **Variant rows** — KPI name is sliced to 150 chars and additionally clipped with `line-clamp-2`, hiding mid-sentence content.
3. **Canonical preview pill** — KPI preview under each bucket draft is also `line-clamp-2`.

The user wants to see the complete KPI text on demand.

## Solution

Add lightweight per-row **"Show more / Show less"** toggles. Default view stays compact (so the list of groups remains scannable), but a single click on any truncated text expands that row to show the full KPI name in-place. No modal, no extra navigation — just inline expansion.

### Behaviour

- **Group header title** — render full `normalized_kpi` with `line-clamp-2` by default, plus a small `Show more` link beside the title (only when the text actually overflows). Clicking expands to full text; `Show less` collapses it.
- **Variant KPI body** — remove the hard `slice(0, 150)`. Default to `line-clamp-2`. Add a small `Show more` link at the end of the line when the variant's KPI name is long enough to be clipped. Toggle expands that single variant row only.
- **Canonical preview pill** — same `line-clamp-2` + `Show more` toggle.
- Expanded state lives in local component state, keyed by `groupKey` + variant index (and a separate key for the group title). State resets when the scan is re-run.
- The expand link uses an existing `Button variant="link"` with `ChevronDown` / `ChevronUp` icons (lucide-react, already imported elsewhere) so no new dependency is added.
- Keep the "View KPIs" drill-down button untouched — it serves a different purpose (showing employees/rows behind the variant).

### Files touched

- `src/components/admin/kpi-standardization/BuildRegistryTab.tsx` — only file changed.
  - Add `expandedTitles: Record<string, boolean>` and `expandedVariants: Record<string, Record<number, boolean>>` state.
  - Replace `{group.normalized_kpi.slice(0, 100)}...` with full text + conditional `line-clamp-2` + toggle.
  - Replace `{variant.kpi_name.slice(0, 150)}` with full `variant.kpi_name` + conditional `line-clamp-2` + toggle.
  - Apply the same toggle pattern to the canonical preview at line 437.

### Risk & Impact

- **Data**: none — purely a presentational change.
- **Workflow**: none — bucketing, suggest split, and approval logic are untouched.
- **UI/UX**: default density is preserved (still `line-clamp-2`); expansion is opt-in per row, so long groups won't visually explode unless the admin asks.
- **Regression**: very low. Only the three render sites above change. Existing buckets / shared bucket pills / "Suggest split" remain identical.
- **Mitigation**: keep state local to the component; no changes to props, hooks, or data shape.

### Out of scope

- No DB / RLS / policy changes.
- No new tests required (cosmetic toggle); existing `scanGroupsDedup` and `scanGroupBuckets` tests cover the underlying logic.
- POLICY.md and memory files remain unchanged — this is a UI affordance, not a policy shift.
