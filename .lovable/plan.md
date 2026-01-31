

# Plan: PMS Frequency and Sub-Frequency Logic Implementation

## Status: ✅ COMPLETED

All phases have been implemented and integrated into the application.

## Executive Summary

This is a **major architectural change** that introduces a multi-level submission system for KPIs. Instead of a single monthly submission, KPIs now support:
- **Granular submissions** (daily, weekly) that aggregate into monthly scores
- **Multi-month cycles** (bi-monthly, quarterly, half-yearly, yearly) that propagate scores across locked periods

## Implementation Phases

### Phase 1: Database Schema ✅ COMPLETED
- Created `sub_period_submissions` table for granular Daily/Weekly data
- Created `frequency_config` table with seed data for all 7 frequency types
- Added columns to `kpis` table: `sub_frequency`, `frequency_cycle_start`, `is_frequency_locked`
- Created `aggregate_sub_period_scores` function for averaging daily/weekly inputs
- Created `get_cycle_months` and `is_month_locked_for_frequency` helper functions
- Created `sync_kpi_sub_frequency` trigger for automatic sub-frequency derivation

### Phase 2: Frequency Utilities ✅ COMPLETED
- Implemented `src/lib/frequencyUtils.ts` with all frequency calculation logic
- Implemented `src/hooks/useFrequencyConfig.ts` for fetching system configuration
- Implemented `src/hooks/useSubPeriodSubmissions.ts` for managing granular submissions
- Updated KPI interface with new frequency fields

### Phase 3: Daily/Weekly UI ✅ COMPLETED
- Built `SubPeriodSelector.tsx` component for date/week selection
- Built `DailySubmissionGrid.tsx` for visualizing daily entries
- Built `WeeklySubmissionTable.tsx` for managing weekly submissions
- Integrated into MyKpis.tsx review workflow

### Phase 4: Multi-Month Cycles ✅ COMPLETED
- Built `FrequencyLockedOverlay.tsx` for locked period UI
- Built `FrequencyLockBadge.tsx` for inline status display
- Implemented score propagation logic in database functions
- Added locked state handling in review pages

### Phase 5: Admin Configuration ✅ COMPLETED
- Updated `AdminKpiEditDialog.tsx` with all 7 frequency types
- Updated `TemplateFormDialog.tsx` with frequency selector
- Updated `AdminKpiCreateDialog.tsx` with frequency options
- Updated `import-kpis` edge function to handle `frequency_cycle_start` field
- Updated import validation for new frequency values

### Phase 6: Documentation ✅ COMPLETED
- Updated DOCUMENTATION.md v1.3.0 with comprehensive frequency logic section (4.13)
- Documented rolling windows for Daily KPIs
- Documented specific day-of-month windows for Weekly KPIs
- Documented score propagation for multi-month cycles

## Frequency Behavior Summary

| Frequency | Sub-Frequency | UI Behavior | Scoring |
|-----------|---------------|-------------|---------|
| Daily | Daily | Date dropdown (today + yesterday) | Average of all daily submissions |
| Weekly | Weekly | Week number dropdown (1-5), restricted by review windows | Average of weekly submissions |
| Monthly | Monthly | Standard flow (no change) | Direct entry |
| Bi-Monthly | Jan-Feb, etc. | Month 1 locked/blurred, Month 2 active | Score from Month 2 copies to Month 1 |
| Quarterly | Q1-Q4 | Months 1-2 locked, Month 3 active | Score from Month 3 copies to Months 1-2 |
| Half-Yearly | H1, H2 | Months 1-5 locked, Month 6 active | Score from Month 6 copies to Months 1-5 |
| Yearly | Various | Months 1-11 locked, Month 12 active | Score from Month 12 copies to Months 1-11 |

## Files Created

| File | Purpose |
|------|---------|
| `src/lib/frequencyUtils.ts` | Frequency calculation logic |
| `src/hooks/useSubPeriodSubmissions.ts` | Sub-period submission hooks |
| `src/hooks/useFrequencyConfig.ts` | Fetch frequency configuration |
| `src/components/review/SubPeriodSelector.tsx` | Sub-period dropdown component |
| `src/components/review/FrequencyLockedOverlay.tsx` | Locked state overlay |
| `src/components/review/DailySubmissionGrid.tsx` | Grid view for daily submissions |
| `src/components/review/WeeklySubmissionTable.tsx` | Table for weekly submissions |

## Files Modified

| File | Changes |
|------|---------|
| `src/pages/MyKpis.tsx` | Integrated sub-period selector, locked overlay, aggregation display |
| `src/components/admin/AdminKpiEditDialog.tsx` | Expanded to 7 frequency types with cycle selector |
| `src/components/admin/AdminKpiCreateDialog.tsx` | Added frequency options |
| `src/components/admin/TemplateFormDialog.tsx` | Added frequency selector |
| `src/hooks/useKpis.ts` | Added sub_frequency, frequency_cycle_start to KPI interface |
| `src/hooks/useOrgLevelKpis.ts` | Added frequency fields to interface |
| `src/lib/importValidation.ts` | Validate new frequency values |
| `supabase/functions/import-kpis/index.ts` | Handle frequency_cycle_start field |
| `DOCUMENTATION.md` | Comprehensive frequency logic documentation |

## Technical Considerations

1. **Backward Compatibility**: Existing "Monthly" KPIs continue to work unchanged
2. **Performance**: Sub-period queries use proper indexing via unique constraints
3. **Time Zones**: All date calculations use server time (UTC)
4. **Audit Trail**: All sub-period submissions are logged with submitted_by and submitted_at
5. **Auto-sync**: Database trigger automatically derives sub_frequency from frequency
