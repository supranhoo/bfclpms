---
name: Safety Incident Advanced Filters
description: Multi-select arrays + date-range presets on /safety/incidents; server-side resolution via .in/.gte/.lte
type: feature
---

- Filter state on `SafetyIncidents.tsx` is array-based: `statuses[]`, `typeIds[]`, `severityIds[]`, `slaStatuses[]`, `buIds[]`. Single-value semantics are gone.
- Date presets resolve via `resolveDateRange()` in `src/lib/safetyDateRangePresets.ts` — Mon-week, ISO instants, applied to `created_at`. Reusable across Safety pages; do NOT inline calendar math elsewhere.
- Severity multi-select stays cascaded to the selected type only when exactly one type is picked; otherwise it lists all severities.
- Accident-style hydration triggers when ANY submitted type matches `/accident/i` (per-type id check).
- Excel export (`exportIncidentsToExcel`) accepts the same array-shaped filters — keep them in sync if you add new filter dimensions.
- ID-keyed multi-select: use `MultiSelectId` (`@/components/ui/multi-select-id`) when the WHERE clause is on id but the user sees a label. String enum filters keep using `MultiSelectFilter`.
- Applied filters are surfaced as removable chips via `SafetyActiveFilterChips`. Chips derive from the `applied` snapshot (NOT the live `draft`) so they reflect what data is actually filtered by; chip removal re-submits immediately via the page's `applyPatch()` helper. Type chip removal cascade-clears severities.