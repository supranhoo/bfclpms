

# Plan: PMS Frequency and Sub-Frequency Logic Implementation

## Executive Summary

This is a **major architectural change** that introduces a multi-level submission system for KPIs. Instead of a single monthly submission, KPIs will support granular submissions (daily, weekly) that aggregate into monthly scores, as well as multi-month cycles (bi-monthly, quarterly, half-yearly, yearly) that propagate scores across locked periods.

## Current State Analysis

| Component | Current Implementation |
|-----------|------------------------|
| **KPI Frequency Field** | Simple text field with 4 options: Monthly, Quarterly, Half-Yearly, Annually |
| **review_period** | Monthly granularity only (e.g., "January", "February") |
| **review_submissions** | One submission per KPI per month |
| **Sub-frequency** | Does not exist |

## Proposed Architecture

```text
┌───────────────────────────────────────────────────────────────────────┐
│                      FREQUENCY HIERARCHY                               │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Daily           Weekly          Monthly        Multi-Month Cycles     │
│  ├── Date 1      ├── Week 1      (base unit)    ├── Bi-Monthly         │
│  ├── Date 2      ├── Week 2                     ├── Quarterly          │
│  ├── ...         ├── Week 3                     ├── Half-Yearly        │
│  └── Date N      ├── Week 4                     └── Yearly             │
│                  └── Week 5                                            │
│                                                                        │
│       ▼              ▼                               ▼                 │
│  ┌─────────────────────────┐                ┌──────────────────────┐   │
│  │ Sub-Period Submissions  │                │  Score Propagation   │   │
│  │ (aggregates to monthly) │                │  (copies to locked   │   │
│  └─────────────────────────┘                │   months)            │   │
│                                             └──────────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘
```

## Database Changes

### 1. New Table: `sub_period_submissions`

Stores granular submissions for Daily and Weekly frequencies.

```sql
CREATE TABLE public.sub_period_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id UUID NOT NULL REFERENCES public.kpis(id) ON DELETE CASCADE,
  sub_period_type TEXT NOT NULL, -- 'daily' | 'weekly'
  sub_period_value TEXT NOT NULL, -- '2026-01-15' for daily, '1' for week number
  achieved_value NUMERIC,
  remarks TEXT,
  evidence_url TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  submitted_by UUID REFERENCES public.profiles(id),
  review_month TEXT NOT NULL, -- 'January'
  review_year INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(kpi_id, sub_period_type, sub_period_value, review_month, review_year)
);
```

### 2. Modify `kpis` Table

Add new columns for sub-frequency tracking.

```sql
ALTER TABLE public.kpis
  ADD COLUMN sub_frequency TEXT, -- System-derived based on frequency
  ADD COLUMN frequency_cycle_start TEXT, -- For yearly: 'Jan-Dec', 'Jul-Jun', 'Apr-Mar', or custom
  ADD COLUMN is_frequency_locked BOOLEAN DEFAULT false; -- Locked for multi-month cycles
```

### 3. New Table: `frequency_config`

Stores system configuration for frequency rules.

```sql
CREATE TABLE public.frequency_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  frequency TEXT NOT NULL UNIQUE,
  sub_frequency TEXT NOT NULL,
  review_window_rules JSONB, -- For weekly: defines allowed review dates
  locked_months JSONB, -- For multi-month: which months are locked
  active_month INTEGER, -- Which month of cycle allows review
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed data
INSERT INTO public.frequency_config (frequency, sub_frequency, review_window_rules, locked_months, active_month) VALUES
('Daily', 'Daily', '{"rolling_window": 1}', NULL, NULL),
('Weekly', 'Weekly', '{"week_1": [8,10], "week_2": [15,18], "week_3": [22,24], "week_4": [29,31], "week_5": [5,8]}', NULL, NULL),
('Monthly', 'Monthly', NULL, NULL, NULL),
('Bi-Monthly', 'Jan-Feb,Mar-Apr,May-Jun,Jul-Aug,Sep-Oct,Nov-Dec', NULL, '{"Jan-Feb": [1], "Mar-Apr": [3], "May-Jun": [5], "Jul-Aug": [7], "Sep-Oct": [9], "Nov-Dec": [11]}', 2),
('Quarterly', 'Jan-Mar,Apr-Jun,Jul-Sep,Oct-Dec', NULL, '{"Q1": [1,2], "Q2": [4,5], "Q3": [7,8], "Q4": [10,11]}', 3),
('Half-Yearly', 'Jan-Jun,Jul-Dec', NULL, '{"H1": [1,2,3,4,5], "H2": [7,8,9,10,11]}', 6),
('Yearly', 'Jan-Dec,Jul-Jun,Apr-Mar,Custom', NULL, '{"Jan-Dec": [1-11], "Jul-Jun": [7-5], "Apr-Mar": [4-2]}', 12);
```

### 4. Database Function: Score Aggregation

```sql
CREATE OR REPLACE FUNCTION aggregate_sub_period_scores(p_kpi_id UUID, p_month TEXT, p_year INTEGER)
RETURNS NUMERIC AS $$
DECLARE
  v_frequency TEXT;
  v_avg_score NUMERIC;
BEGIN
  SELECT frequency INTO v_frequency FROM kpis WHERE id = p_kpi_id;
  
  IF v_frequency = 'Daily' THEN
    SELECT AVG(achieved_value) INTO v_avg_score
    FROM sub_period_submissions
    WHERE kpi_id = p_kpi_id AND review_month = p_month AND review_year = p_year;
  ELSIF v_frequency = 'Weekly' THEN
    SELECT AVG(achieved_value) INTO v_avg_score
    FROM sub_period_submissions
    WHERE kpi_id = p_kpi_id AND review_month = p_month AND review_year = p_year;
  END IF;
  
  RETURN v_avg_score;
END;
$$ LANGUAGE plpgsql;
```

### 5. Database Function: Score Propagation

```sql
CREATE OR REPLACE FUNCTION propagate_multi_month_score()
RETURNS TRIGGER AS $$
DECLARE
  v_frequency TEXT;
  v_cycle_months TEXT[];
  v_month TEXT;
BEGIN
  SELECT frequency INTO v_frequency FROM kpis WHERE id = NEW.kpi_id;
  
  -- Get locked months for this frequency cycle
  -- Propagate final_score to review_submissions for locked months
  -- Implementation depends on specific cycle
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Frontend Changes

### 1. New Utility: `src/lib/frequencyUtils.ts`

Core logic for frequency calculations.

```typescript
export type FrequencyType = 'Daily' | 'Weekly' | 'Monthly' | 'Bi-Monthly' | 'Quarterly' | 'Half-Yearly' | 'Yearly';

export interface SubPeriodOption {
  value: string;
  label: string;
  isEnabled: boolean;
  reviewWindow?: { start: number; end: number };
}

export function getSubFrequency(frequency: FrequencyType): string { /* ... */ }

export function getAvailableSubPeriods(
  frequency: FrequencyType,
  currentDate: Date,
  reviewMonth: string,
  reviewYear: number
): SubPeriodOption[] { /* ... */ }

export function isKpiLocked(
  frequency: FrequencyType,
  reviewMonth: string,
  reviewYear: number,
  currentDate: Date
): boolean { /* ... */ }

export function getActiveMonthsForCycle(
  frequency: FrequencyType,
  reviewMonth: string,
  reviewYear: number
): string[] { /* ... */ }
```

### 2. New Component: `src/components/review/SubPeriodSelector.tsx`

Dropdown for selecting sub-period (date for daily, week for weekly).

```typescript
interface SubPeriodSelectorProps {
  frequency: FrequencyType;
  reviewMonth: string;
  reviewYear: number;
  selectedSubPeriod: string | null;
  onSubPeriodChange: (value: string) => void;
}
```

### 3. New Component: `src/components/review/FrequencyLockedOverlay.tsx`

Displays blur/lock overlay for KPIs in locked periods.

```typescript
interface FrequencyLockedOverlayProps {
  frequency: FrequencyType;
  activeMonth: string;
  reviewMonth: string;
}
```

### 4. Modify: `src/pages/MyKpis.tsx`

- Add sub-period selector in review sheet
- Show locked overlay for multi-month cycle KPIs
- Aggregate sub-period scores for display

### 5. Modify: `src/components/admin/AdminKpiEditDialog.tsx`

- Expand FREQUENCY_OPTIONS to include all 7 types
- Auto-populate sub_frequency based on selection
- For Yearly, show cycle selector (Jan-Dec, Jul-Jun, Apr-Mar, Custom)

### 6. New Hook: `src/hooks/useSubPeriodSubmissions.ts`

```typescript
export function useSubPeriodSubmissions(kpiId: string, month: string, year: number) { /* ... */ }
export function useSubmitSubPeriod() { /* ... */ }
export function useAggregatedScore(kpiId: string, month: string, year: number) { /* ... */ }
```

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

## Files to Create

| File | Purpose |
|------|---------|
| `src/lib/frequencyUtils.ts` | Frequency calculation logic |
| `src/hooks/useSubPeriodSubmissions.ts` | Sub-period submission hooks |
| `src/hooks/useFrequencyConfig.ts` | Fetch frequency configuration |
| `src/components/review/SubPeriodSelector.tsx` | Sub-period dropdown component |
| `src/components/review/FrequencyLockedOverlay.tsx` | Locked state overlay |
| `src/components/review/DailySubmissionGrid.tsx` | Grid view for daily submissions |
| `src/components/review/WeeklySubmissionTable.tsx` | Table for weekly submissions |

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/MyKpis.tsx` | Add sub-period selector, locked overlay, aggregation display |
| `src/components/admin/AdminKpiEditDialog.tsx` | Expand frequency options, add cycle selector |
| `src/components/admin/TemplateFormDialog.tsx` | Same frequency updates |
| `src/hooks/useKpis.ts` | Add sub_frequency to KPI interface |
| `src/lib/importValidation.ts` | Validate new frequency values |
| `supabase/functions/import-kpis/index.ts` | Handle new frequency fields |
| `DOCUMENTATION.md` | Document frequency logic |

## Implementation Phases

### Phase 1: Database Schema (Day 1)
- Create `sub_period_submissions` table
- Create `frequency_config` table
- Add columns to `kpis` table
- Create aggregation and propagation functions

### Phase 2: Frequency Utilities (Day 2)
- Implement `frequencyUtils.ts`
- Implement frequency configuration hook
- Update KPI interfaces

### Phase 3: Daily/Weekly UI (Day 3-4)
- Build SubPeriodSelector component
- Build DailySubmissionGrid
- Build WeeklySubmissionTable
- Integrate into MyKpis review sheet

### Phase 4: Multi-Month Cycles (Day 5-6)
- Build FrequencyLockedOverlay
- Implement score propagation logic
- Add locked state handling in review pages

### Phase 5: Admin Configuration (Day 7)
- Update AdminKpiEditDialog
- Update TemplateFormDialog
- Update import validation

### Phase 6: Testing and Documentation (Day 8)
- End-to-end testing
- Update DOCUMENTATION.md

## Technical Considerations

1. **Backward Compatibility**: Existing "Monthly" KPIs continue to work unchanged
2. **Performance**: Sub-period queries should use proper indexing
3. **Time Zones**: All date calculations should use server time (UTC)
4. **Audit Trail**: All sub-period submissions should be logged

