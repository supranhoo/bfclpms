
# Implementation Plan - COMPLETED

## Overview

All three major features have been fully implemented:

---

## Feature 1: Dynamic Working Days Configuration ✅ COMPLETE

### Implementation Summary
| Component | Status |
|-----------|--------|
| `employee_working_days` database table | ✅ Created |
| `day_count_type` column on `kpis` table | ✅ Created |
| `useEmployeeWorkingDays` hook | ✅ Created |
| `EmployeeWorkingDaysDialog` component | ✅ Created |
| User Management integration | ✅ Created |
| KPI Create/Edit Dialog - `day_count_type` selector | ✅ Implemented |
| Template Form Dialog - `day_count_type` selector | ✅ Implemented |
| `dailyAggregation.ts` - Dynamic day calculation | ✅ Implemented |
| `useDailyAggregation.ts` hook | ✅ Created |
| `useWorkingDaysPerMonth` hook | ✅ Created |
| KPI interface - `day_count_type` field | ✅ Added |
| Documentation updated | ✅ Done |

### Key Changes Made:
1. Added `day_count_type` selector to AdminKpiCreateDialog, AdminKpiEditDialog, and TemplateFormDialog
2. Updated `dailyAggregation.ts` with new functions:
   - `getExpectedDaysWithConfig()` - Returns expected days based on config
   - `calculateDailyAggregatedScoreWithExpectedDays()` - Aggregation with explicit days parameter
   - `calculateBinaryDailyScoreWithExpectedDays()` - Binary KPI scoring with explicit days
3. Created `useDailyAggregation.ts` hook with:
   - `useEmployeeWorkingDaysForMonth()` - Fetches employee-specific working days
   - `useExpectedDays()` - Determines expected days based on day_count_type
   - `useDailyAggregatedScore()` - Full aggregation with dynamic working days
4. Added `useWorkingDaysPerMonth()` to useSystemSettings.ts
5. Added `day_count_type` to KPI interface in useKpis.ts

```
┌─────────────────────────────────────────────────────┐
│ Day Count Type (for Daily KPIs)                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [▼] Working Days Only                           │ │
│ └─────────────────────────────────────────────────┘ │
│ Uses employee-specific working days (e.g., 22/month)│
└─────────────────────────────────────────────────────┘
```

#### Task 1.2: Update Daily Aggregation Logic

**File to modify:** `src/lib/dailyAggregation.ts`

**Current implementation:**
```typescript
export function getExpectedDaysInMonth(month: string, year: number): number {
  const monthNum = getMonthNumber(month);
  return getDaysInMonth(new Date(year, monthNum - 1));
}
```

**Required changes:**
- Update signature to accept `dayCountType` and `employeeId` parameters
- Fetch employee-specific working days when `dayCountType === 'working_days'`
- Fallback to global `working_days_per_month` setting if no employee config
- Return calendar days when `dayCountType === 'all_days'`

**New signature:**
```typescript
export async function getExpectedDaysInMonth(
  month: string, 
  year: number,
  dayCountType: 'working_days' | 'all_days' = 'working_days',
  employeeId?: string,
  globalDefault?: number
): Promise<number>
```

#### Task 1.3: Update All Aggregation Callers

**Files to modify:**
- `src/pages/MyKpis.tsx`
- `src/components/review/DailySubmissionSummary.tsx`
- Any other component using `calculateDailyAggregatedScore`

**Changes:**
- Pass `day_count_type` and `employee_id` to aggregation functions
- Handle async nature of the updated function

---

## Feature 2: N/A KPI Workflow Flow-Through

### Current State (Fully Implemented ✅)
| Component | Status |
|-----------|--------|
| `KpiDetailsTable.tsx` - View button for N/A | ✅ Implemented |
| `MobileKpiCard.tsx` - View button for N/A | ✅ Implemented |
| `NaConfirmationCard.tsx` component | ✅ Created |
| `EmployeeScorecard.tsx` - N/A confirmation | ✅ Implemented |
| `AuditScorecard.tsx` - N/A confirmation | ✅ Implemented |
| `ManagementScorecard.tsx` - N/A confirmation | ✅ Implemented |
| `KpiTimeline.tsx` - N/A action configs | ✅ Implemented |

**Status: COMPLETE** - No pending tasks for this feature.

---

## Feature 3: Universal Timeline Access

### Current State (Fully Implemented ✅)
| Component | Status |
|-----------|--------|
| `KpiHeaderSection.tsx` - Timeline button | ✅ Implemented |
| `KpiReviewPanel.tsx` - Timeline prop | ✅ Implemented |
| `EmployeeScorecard.tsx` - Timeline integration | ✅ Implemented |
| `AuditScorecard.tsx` - Timeline integration | ✅ Implemented |
| `ManagementScorecard.tsx` - Timeline integration | ✅ Implemented |
| `KpiTimeline.tsx` - Enhanced details | ✅ Implemented |

**Status: COMPLETE** - No pending tasks for this feature.

---

## Summary of Pending Work

| Priority | Task | Effort |
|----------|------|--------|
| High | Add `day_count_type` selector to `AdminKpiCreateDialog.tsx` | Small |
| High | Add `day_count_type` selector to `AdminKpiEditDialog.tsx` | Small |
| Medium | Add `day_count_type` selector to `TemplateFormDialog.tsx` | Small |
| High | Update `dailyAggregation.ts` for dynamic working days | Medium |
| Medium | Update aggregation callers to pass new parameters | Medium |
| Low | Update `DOCUMENTATION.md` with day_count_type info | Small |

---

## Detailed Implementation Plan

### Phase 1: UI Selectors (Day Count Type)

#### 1.1 AdminKpiCreateDialog.tsx

**Location:** After the Frequency selector (around line 303-315)

**Add:**
```typescript
// State
const [dayCountType, setDayCountType] = useState<'working_days' | 'all_days'>('working_days');

// UI - Show only when frequency is Daily
{frequency === 'Daily' && (
  <div className="space-y-2">
    <Label className="text-sm font-medium">Day Count Type</Label>
    <Select value={dayCountType} onValueChange={setDayCountType}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="working_days">Working Days Only</SelectItem>
        <SelectItem value="all_days">All Calendar Days</SelectItem>
      </SelectContent>
    </Select>
    <p className="text-xs text-muted-foreground">
      {dayCountType === 'working_days' 
        ? 'Uses employee-specific working days for missed days calculation'
        : 'Uses all calendar days (e.g., 31 days in January)'}
    </p>
  </div>
)}

// Include in mutation payload
day_count_type: frequency === 'Daily' ? dayCountType : null,
```

#### 1.2 AdminKpiEditDialog.tsx

**Add to formData state:**
```typescript
day_count_type: 'working_days' as 'working_days' | 'all_days',
```

**Add to useEffect initialization:**
```typescript
day_count_type: (kpi.day_count_type as 'working_days' | 'all_days') || 'working_days',
```

**Add UI after frequency selector (similar to above)**

**Include in mutation payload:**
```typescript
day_count_type: formData.frequency === 'Daily' ? formData.day_count_type : null,
```

#### 1.3 TemplateFormDialog.tsx

**Same pattern as above for templates**

---

### Phase 2: Update Aggregation Logic

#### 2.1 dailyAggregation.ts

**Current function:**
```typescript
export function getExpectedDaysInMonth(month: string, year: number): number {
  const monthNum = getMonthNumber(month);
  return getDaysInMonth(new Date(year, monthNum - 1));
}
```

**Updated function:**
```typescript
import { supabase } from '@/integrations/supabase/client';

export async function getExpectedDaysInMonthAsync(
  month: string, 
  year: number,
  dayCountType: 'working_days' | 'all_days' = 'working_days',
  employeeId?: string,
  globalDefaultDays: number = 22
): Promise<number> {
  // All calendar days - use date-fns
  if (dayCountType === 'all_days') {
    const monthNum = getMonthNumber(month);
    return getDaysInMonth(new Date(year, monthNum - 1));
  }
  
  // Working days mode - try employee-specific first
  if (employeeId) {
    const { data } = await supabase
      .from('employee_working_days')
      .select('working_days')
      .eq('employee_id', employeeId)
      .eq('month', month)
      .eq('year', year)
      .maybeSingle();
    
    if (data?.working_days) return data.working_days;
  }
  
  // Fallback to global default
  return globalDefaultDays;
}

// Keep synchronous version for backwards compatibility
export function getExpectedDaysInMonth(month: string, year: number): number {
  const monthNum = getMonthNumber(month);
  return getDaysInMonth(new Date(year, monthNum - 1));
}
```

**Update aggregation functions to use async version when employee context is available**

#### 2.2 Create a React Hook for Aggregation

**New file:** `src/hooks/useDailyAggregation.ts`

```typescript
export function useDailyAggregatedScore(
  kpi: KPI,
  submissions: SubPeriodSubmission[],
  month: string,
  year: number
) {
  const globalDefault = useWorkingDaysPerMonth();
  const { data: employeeWorkingDays } = useEmployeeWorkingDaysForMonth(
    kpi.employee_id,
    month,
    year
  );

  return useMemo(() => {
    const dayCountType = kpi.day_count_type || 'working_days';
    const expectedDays = dayCountType === 'all_days'
      ? getDaysInMonth(new Date(year, getMonthNumber(month) - 1))
      : (employeeWorkingDays ?? globalDefault);

    const values = submissions
      .filter(s => s.achieved_value !== null)
      .map(s => s.achieved_value as number);

    return calculateDailyAggregatedScoreWithExpectedDays(
      values,
      method,
      expectedDays,
      kpi.uom_type === 'binary'
    );
  }, [kpi, submissions, employeeWorkingDays, globalDefault]);
}
```

---

### Phase 3: Update Callers

Update all components that call `calculateDailyAggregatedScore` to use the new hook or pass the correct parameters:

1. `MyKpis.tsx` - Line 212-214
2. `DailySubmissionSummary.tsx`
3. `InlineDailySubmissionRow.tsx`

---

### Phase 4: Documentation

Update `DOCUMENTATION.md` to include:
- New `day_count_type` column description
- Working days configuration workflow
- Employee-level vs global defaults

---

## Implementation Order

1. **Phase 1** - Add UI selectors to dialogs (1-2 hours)
2. **Phase 2** - Update aggregation logic (2-3 hours)
3. **Phase 3** - Update callers (1-2 hours)
4. **Phase 4** - Documentation (30 minutes)

**Total Estimated Effort:** 5-8 hours

---

## Technical Considerations

1. **Async vs Sync:** The aggregation logic may need to become async to fetch employee working days. This affects component rendering.

2. **Caching:** Use React Query caching to avoid repeated database calls for the same employee/month/year.

3. **Fallback Chain:** 
   - Employee-specific working days → Global default → Calendar days

4. **Migration:** Existing KPIs without `day_count_type` should default to `'working_days'` behavior.

5. **Template Sync:** When creating KPIs from templates, the `day_count_type` should be copied from the template if set.
