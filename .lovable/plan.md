

# Bold Section Markers in KPI Text (Description, Formula, Scoring Logic, Scoring)

## Feasibility: SAFE -- No adverse impact

### Impact Analysis

| Area | Impact | Reason |
|------|--------|--------|
| Dashboard Tables | Target change | Uses `normalizeKpiText` for display |
| Review Sheets/Panels | Target change | Uses `normalizeKpiText` for display |
| Mobile KPI Cards | Target change | Uses `normalizeKpiText` for display |
| PDF Exports | No impact | Uses raw strings with jsPDF, never calls `normalizeKpiText` |
| Excel Exports | No impact | Uses raw string fields |
| Reports (TNI, Query, Audit Trail) | No impact | Uses raw `kpi_name`/`kra_name` fields |
| Scoring Logic | No impact | Works with numeric fields only |
| Database | No impact | No data changes, display-only |

### What Changes

Section markers like `- Description:`, `- Formula:`, `- Scoring Logic:`, `- Scoring:` (and existing markers like Criteria, Measurement, Target, Notes) will render in **bold** wherever KPI text is displayed.

```text
Before:
- Description: Measures accuracy of documentation
- Formula: (1 - errors/total) * 100
- Scoring Logic: 5 for 100%, 4 for 98-99%

After:
**- Description:** Measures accuracy of documentation
**- Formula:** (1 - errors/total) * 100
**- Scoring Logic:** 5 for 100%, 4 for 98-99%
```

### Technical Approach

Since `normalizeKpiText` returns a plain string (used in 12+ files), we cannot inject HTML/JSX into it without breaking things. Instead:

1. **Add a new function** `renderKpiText()` in `src/lib/textFormatting.ts` that takes normalized text and returns an array of React nodes, with section markers wrapped in `<strong>` tags.

2. **Update `FormattedText` component** to use `renderKpiText()` instead of rendering plain text, so it automatically bolds section markers.

3. **Update all 10 inline call sites** (KpiDetailsTable, MobileKpiCard, MobileSelfReviewCard, ReviewDetailsCard, ReviewDetailsCardCompact, KpiLogicModal, KpiTrackerModal, KpiHeaderSection, OrgKpiOverview, OrgKpiDataEntry) to use the new rendering approach.

4. **Keep `normalizeKpiText` unchanged** -- it remains a pure string function for any non-visual use cases (tests, exports, etc.).

### Files to Modify

| File | Change |
|------|--------|
| `src/lib/textFormatting.ts` | Add `renderKpiTextWithBold()` function |
| `src/components/ui/FormattedText.tsx` | Use the new renderer |
| `src/components/review/KpiDetailsTable.tsx` | Replace `normalizeKpiText` calls with bold-aware rendering |
| `src/components/review/MobileKpiCard.tsx` | Same |
| `src/components/review/MobileSelfReviewCard.tsx` | Same |
| `src/components/review/ReviewDetailsCard.tsx` | Same |
| `src/components/review/ReviewDetailsCardCompact.tsx` | Same |
| `src/components/review/KpiHeaderSection.tsx` | Same |
| `src/components/dashboard/KpiLogicModal.tsx` | Same |
| `src/components/dashboard/KpiTrackerModal.tsx` | Same |
| `src/pages/admin/OrgKpiOverview.tsx` | Same |
| `src/pages/admin/OrgKpiDataEntry.tsx` | Same |
| `DOCUMENTATION.md` | Document the bold formatting behavior |

