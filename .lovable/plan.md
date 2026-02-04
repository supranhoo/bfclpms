
# Plan: Enhanced Working Days, N/A Workflow, and Timeline Visibility

## Overview

This plan addresses three interconnected feature enhancements:

1. **Dynamic Working Days Configuration** - Connecting working days per month to calendar months and employee-specific settings, with KPI-level day type selection
2. **N/A KPI Workflow Flow-Through** - Ensuring N/A-marked KPIs flow through all workflow levels for confirmation
3. **Universal Timeline Access** - Adding Review Timeline button to View KPI Details page for all levels

---

## Feature 1: Dynamic Working Days Configuration

### Current State
- `working_days_per_month` is a single global setting (currently 26 days)
- Used in `dailyAggregation.ts` via `getExpectedDaysInMonth()` which returns calendar days
- All Daily KPIs use the same day count regardless of employee or KPI type

### Problem
- Different months have different calendar days (28-31)
- Different employees may have different working schedules
- Some KPIs require all days (e.g., safety checks), others only working days (e.g., production reports)

### Solution

#### 1.1 Database Changes

**New Table: `employee_working_days`**
```sql
CREATE TABLE employee_working_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month VARCHAR(20) NOT NULL,  -- e.g., "January", "February"
  year INTEGER NOT NULL,
  working_days INTEGER NOT NULL CHECK (working_days BETWEEN 1 AND 31),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, month, year)
);
```

**KPI Table Enhancement**
Add column to `kpis` table:
```sql
ALTER TABLE kpis ADD COLUMN day_count_type VARCHAR(20) DEFAULT 'working_days' 
  CHECK (day_count_type IN ('working_days', 'all_days'));
```

- `working_days` - Uses employee's configured working days for the month
- `all_days` - Uses calendar days (current behavior)

#### 1.2 Admin UI Changes

**File: `src/pages/admin/UserManagement.tsx`**
- Add "Working Days" column/action button
- Opens dialog to set monthly working days per employee
- Default to global setting if not configured

**New Component: `src/components/admin/EmployeeWorkingDaysDialog.tsx`**
- Table showing 12 months for selected year
- Input fields for each month's working days
- Bulk set option (apply same value to all months)
- Copy from previous year option

**File: `src/components/admin/WorkflowSettingsTab.tsx`**
- Keep `working_days_per_month` as default fallback
- Add tooltip: "Default used when employee-specific not set"

#### 1.3 KPI Configuration Changes

**Files to modify:**
- `src/components/admin/AdminKpiCreateDialog.tsx`
- `src/components/admin/AdminKpiEditDialog.tsx`
- `src/components/admin/TemplateFormDialog.tsx`

Add toggle for Daily frequency KPIs:
```typescript
{frequency === 'Daily' && (
  <div className="space-y-2">
    <Label>Day Count Type</Label>
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
        ? 'Uses employee-specific working days (e.g., 22 days/month)'
        : 'Uses all calendar days (e.g., 31 days in January)'}
    </p>
  </div>
)}
```

#### 1.4 Aggregation Logic Updates

**File: `src/lib/dailyAggregation.ts`**

Update `getExpectedDaysInMonth` to accept additional parameters:
```typescript
export async function getExpectedDaysInMonth(
  month: string, 
  year: number,
  dayCountType: 'working_days' | 'all_days' = 'working_days',
  employeeId?: string
): Promise<number> {
  if (dayCountType === 'all_days') {
    // Calendar days (existing behavior)
    const monthNum = getMonthNumber(month);
    return getDaysInMonth(new Date(year, monthNum - 1));
  }
  
  // Try to get employee-specific working days
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
  
  // Fallback to global setting
  return globalWorkingDaysPerMonth; // from workflow_settings
}
```

**New Hook: `src/hooks/useEmployeeWorkingDays.ts`**
```typescript
export function useEmployeeWorkingDays(employeeId: string, year: number) {
  return useQuery({
    queryKey: ['employee-working-days', employeeId, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_working_days')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('year', year);
      
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId,
  });
}
```

---

## Feature 2: N/A KPI Workflow Flow-Through

### Current State
- When employee marks KPI as N/A, it sets `is_na = true` on `review_submissions`
- N/A KPIs are skipped in score calculations (correct)
- N/A KPIs appear in tables but are effectively "bypassed" in workflow

### Problem
- Other workflow levels (Manager, Auditor, Management) need to confirm/acknowledge the N/A status
- Currently no explicit confirmation step exists

### Solution

#### 2.1 Workflow Changes

N/A KPIs will follow the same status progression as regular KPIs:
`kra_set` → `self_review` → `manager_check` → `audit` → `management_review` → `approved`

Each level must explicitly acknowledge/confirm the N/A status.

#### 2.2 UI Changes for N/A Confirmation

**Files to modify:**
- `src/components/review/EmployeeScorecard.tsx` (Manager)
- `src/components/review/AuditScorecard.tsx` (Auditor)
- `src/components/review/ManagementScorecard.tsx` (Management)

When reviewing an N/A KPI, show confirmation UI:

```typescript
{selectedSubmission?.is_na && (
  <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
    <CardContent className="p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium text-amber-800 dark:text-amber-200">
            This KPI was marked as Not Applicable
          </p>
          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
            Employee Reason: {selectedSubmission.self_remarks || 'No reason provided'}
          </p>
          
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox 
                id="confirm-na" 
                checked={confirmNa} 
                onCheckedChange={setConfirmNa} 
              />
              <Label htmlFor="confirm-na" className="text-sm">
                I confirm this KPI is correctly marked as N/A
              </Label>
            </div>
            
            <div className="space-y-2">
              <Label>Reviewer Remarks (Optional)</Label>
              <Textarea
                value={naRemarks}
                onChange={(e) => setNaRemarks(e.target.value)}
                placeholder="Add any notes about this N/A classification..."
                rows={2}
              />
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
)}
```

#### 2.3 Database Tracking

Add audit log entries for N/A confirmations:
```typescript
// In useApproveKpi hook - add handling for N/A KPIs
if (submission.is_na) {
  await supabase.from('kpi_audit_logs').insert({
    kpi_id,
    action: `${LEVEL}_NA_CONFIRMED`,  // e.g., MANAGER_NA_CONFIRMED
    performed_by: user.id,
    new_value: { na_remarks: naRemarks },
    metadata: { confirmed_at: new Date().toISOString() },
  });
}
```

#### 2.4 KpiTimeline Updates

**File: `src/components/dashboard/KpiTimeline.tsx`**

Add N/A confirmation actions to `actionConfig`:
```typescript
const actionConfig = {
  // ... existing actions
  'MANAGER_NA_CONFIRMED': { icon: CheckCircle, color: 'bg-amber-500', label: 'Manager Confirmed N/A' },
  'AUDITOR_NA_CONFIRMED': { icon: CheckCircle, color: 'bg-amber-500', label: 'Auditor Confirmed N/A' },
  'MANAGEMENT_NA_CONFIRMED': { icon: CheckCircle, color: 'bg-amber-500', label: 'Management Confirmed N/A' },
};
```

---

## Feature 3: Universal Timeline Access

### Current State
- `KpiTimeline` component exists and works well
- Only accessible from specific places (Dashboard, SelfReview)
- Not integrated into the KpiReviewPanel used across all views

### Solution

#### 3.1 Add Timeline Button to KpiHeaderSection

**File: `src/components/review/KpiHeaderSection.tsx`**

Add a Timeline button that triggers the callback:

```typescript
interface KpiHeaderSectionProps {
  kpi: KPI;
  selectedPeriod: string;
  selectedYear: number;
  onOpenTimeline?: () => void;  // New prop
}

export function KpiHeaderSection({ kpi, selectedPeriod, selectedYear, onOpenTimeline }: KpiHeaderSectionProps) {
  // ... existing code
  
  return (
    <div className="p-4 bg-muted/30 rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        {/* Left: Category */}
        <Badge style={{ backgroundColor: categoryColor }} className="text-white">
          {categoryName}
        </Badge>

        {/* Right: Status + Period + Weightage + Timeline Button */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={statusColors[status] || statusColors.kra_set}>
            {statusLabels[status] || 'KRA Set'}
          </Badge>
          <Badge variant="outline">
            {selectedPeriod} {selectedYear}
          </Badge>
          <Badge variant="secondary">
            {weightage}% Weight
          </Badge>
          
          {/* Timeline Button - NEW */}
          {onOpenTimeline && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onOpenTimeline}
              className="gap-1.5"
            >
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Timeline</span>
            </Button>
          )}
        </div>
      </div>
      
      {/* ... rest of component */}
    </div>
  );
}
```

#### 3.2 Update KpiReviewPanel

**File: `src/components/review/KpiReviewPanel.tsx`**

Add timeline prop and pass it through:

```typescript
interface KpiReviewPanelProps {
  // ... existing props
  onOpenTimeline?: () => void;  // New prop
}

export function KpiReviewPanel({
  // ... existing props
  onOpenTimeline,
}: KpiReviewPanelProps) {
  return (
    <div className="space-y-4">
      <KpiHeaderSection
        kpi={kpi}
        selectedPeriod={selectedPeriod}
        selectedYear={selectedYear}
        onOpenTimeline={onOpenTimeline}  // Pass through
      />
      {/* ... rest of component */}
    </div>
  );
}
```

#### 3.3 Integrate in All Scorecards

**Files to modify:**
- `src/pages/MyKpis.tsx`
- `src/components/review/EmployeeScorecard.tsx`
- `src/components/review/AuditScorecard.tsx`
- `src/components/review/ManagementScorecard.tsx`

Add state and pass callback:

```typescript
// State
const [timelineKpi, setTimelineKpi] = useState<KPI | null>(null);
const [timelineOpen, setTimelineOpen] = useState(false);

// In Sheet content
<KpiReviewPanel
  kpi={selectedKpi}
  // ... other props
  onOpenTimeline={() => {
    setTimelineKpi(selectedKpi);
    setTimelineOpen(true);
  }}
/>

// Add Timeline modal at end of component
<KpiTimeline
  isOpen={timelineOpen}
  onClose={() => setTimelineOpen(false)}
  kpi={timelineKpi}
/>
```

#### 3.4 Enhanced Timeline Display

**File: `src/components/dashboard/KpiTimeline.tsx`**

Enhance the details section to show more comprehensive information:

```typescript
const formatDetails = (log: AuditLog) => {
  const details: string[] = [];
  
  if (log.new_value) {
    // Existing score/rating details
    if (log.new_value.self_score) details.push(`Self Score: ${log.new_value.self_score}`);
    // ... other existing fields
    
    // NEW: Add N/A confirmation details
    if (log.new_value.na_remarks) details.push(`N/A Remarks: ${log.new_value.na_remarks}`);
    
    // NEW: Add day-count related info
    if (log.new_value.working_days) details.push(`Working Days: ${log.new_value.working_days}`);
    
    // Show full remarks if present
    if (log.new_value.self_remarks) details.push(`Self Remarks: ${log.new_value.self_remarks}`);
    if (log.new_value.manager_remarks) details.push(`Manager Remarks: ${log.new_value.manager_remarks}`);
    if (log.new_value.auditor_remarks) details.push(`Auditor Remarks: ${log.new_value.auditor_remarks}`);
    if (log.new_value.management_remarks) details.push(`Management Remarks: ${log.new_value.management_remarks}`);
  }
  
  return details;
};
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/admin/EmployeeWorkingDaysDialog.tsx` | Dialog for managing employee monthly working days |
| `src/hooks/useEmployeeWorkingDays.ts` | Hook for fetching/updating employee working days |
| `src/components/review/NaConfirmationCard.tsx` | Reusable N/A confirmation UI for reviewers |

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/dailyAggregation.ts` | Update `getExpectedDaysInMonth` for dynamic days |
| `src/hooks/useWorkflowSettings.ts` | Keep global default setting |
| `src/components/admin/WorkflowSettingsTab.tsx` | Add tooltip for default usage |
| `src/pages/admin/UserManagement.tsx` | Add working days management |
| `src/components/admin/AdminKpiCreateDialog.tsx` | Add day count type selector |
| `src/components/admin/AdminKpiEditDialog.tsx` | Add day count type selector |
| `src/components/admin/TemplateFormDialog.tsx` | Add day count type selector |
| `src/components/review/KpiHeaderSection.tsx` | Add Timeline button |
| `src/components/review/KpiReviewPanel.tsx` | Add timeline prop |
| `src/pages/MyKpis.tsx` | Integrate timeline in review sheet |
| `src/components/review/EmployeeScorecard.tsx` | Add N/A confirmation + timeline |
| `src/components/review/AuditScorecard.tsx` | Add N/A confirmation + timeline |
| `src/components/review/ManagementScorecard.tsx` | Add N/A confirmation + timeline |
| `src/components/dashboard/KpiTimeline.tsx` | Add N/A action configs, enhanced details |
| `DOCUMENTATION.md` | Document all new features |

## Database Migrations Required

1. Create `employee_working_days` table
2. Add `day_count_type` column to `kpis` table
3. Add RLS policies for new table

---

## Implementation Order

1. **Database migrations** - Create new table and column
2. **Working Days feature** - Admin UI + hook + aggregation logic
3. **N/A workflow** - Confirmation UI + audit logging
4. **Timeline integration** - Button + props + modal integration
5. **Documentation update**

---

## Benefits

| Feature | Benefit |
|---------|---------|
| Dynamic Working Days | Accurate missed days penalty calculation per employee |
| KPI Day Type | Flexibility for different KPI requirements |
| N/A Flow-Through | Audit trail and multi-level confirmation |
| Universal Timeline | Full visibility into KPI history at every level |
