

## RCA: Firoz Ahmad's "27 Propagated" Instead of "33 Propagated" + Additional Bugs

### Bug 1 (Primary): String Key Mismatch Between Ownership and Values Tables

**Root Cause**: The system uses exact string matching on `category_id || kra_name || kpi_name` to join data between `org_kpi_data_owners` (ownership), the KPI template list, and `org_kpi_values` (entered data). Three of Firoz's Safety & Health KPIs have **slight text differences** between what's stored in the ownership/template table vs the values table:

| KPI | Ownership text | Values text |
|-----|---------------|-------------|
| PTW Compliance | `"0  - YES non-compliance)"` | `"0 -YES non-compliance)"` |
| Fatal Accidents | `"Rating 5: 0, Rating 0: Any Fatal"` | `"Rating 5: NO fatal, Rating 0: YES Fatal"` |
| Safety Observations | `"* 5: 0 observations..."` | `"* 5: NO observations..."` |

Because the strings don't match exactly, `getKpiStatus()` returns `'pending'` for these 3 KPIs (no matching key found in `existingValuesMap`), even though the data exists. Combined with 3 KPIs correctly filtered out by frequency, this explains the 27 propagated (31 Safety KPIs owned - 3 frequency-filtered - 3 string-mismatched + 2 that partially match = ~27).

**Fix**: This is primarily a **data integrity issue**. The immediate fix is a data repair migration to synchronize the `kpi_name` strings in `org_kpi_data_owners` with the actual `org_kpi_values` entries. The systemic fix is to normalize KPI name matching to use case-insensitive, whitespace-normalized comparison.

### Bug 2: Progress Bar and Status Tabs Not Scoped to Selected Data Owner

**Root Cause**: `progressData` (line 270) is computed from `frequencyFilteredKpis`, which is NOT filtered by `selectedOwnerId`. When the admin selects "Firoz Ahmad" tab, the KPI cards are correctly filtered, but the progress bar and status filter chip counts still show global numbers for all owners.

**Fix**: Change `progressData` to use a new `ownerScopedKpis` memo that applies the owner filter, or recompute it from `ownerFilteredKpis`.

### Corrective Actions

| File | Change |
|------|--------|
| `src/pages/admin/OrgKpiDataEntry.tsx` | **Bug 2**: Change `progressData` to compute from owner-filtered KPIs instead of `frequencyFilteredKpis` |
| `src/pages/admin/OrgKpiDataEntry.tsx` | **Bug 1 (systemic)**: Normalize string comparison in `getKpiStatus()` and `existingValuesMap` key construction — trim whitespace, collapse multiple spaces, case-insensitive matching |
| Database migration | **Bug 1 (data repair)**: Update the 3 mismatched `org_kpi_data_owners` entries to match their `org_kpi_values` counterparts |
| `DOCUMENTATION.md` | Log RCA v2.33.6 |
| `POLICY.md` | Sync version |

### Technical Detail — String Normalization

```typescript
// Utility function for consistent key generation
function normalizeKpiKey(categoryId: string, kraName: string, kpiName: string): string {
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  return `${categoryId}||${normalize(kraName)}||${normalize(kpiName)}`;
}
```

Applied in: `existingValuesMap` construction, `getKpiStatus()`, `buildCardData()`, `ownerTilesData`, and all key lookups.

### Risk Assessment
- **Data impact**: Migration updates 3 ownership records to match existing values — additive alignment only
- **Regression risk**: Low — normalization makes matching more lenient, not stricter
- **UX improvement**: Progress bar and badges will correctly reflect owner-scoped counts; all 33 of Firoz's entered KPIs will show as propagated

