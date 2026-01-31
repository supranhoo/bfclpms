
# Plan: Add Per-Level Approved Values to Daily Submission Summary

## Overview

Enhance the Daily Submission Summary table on the employee's "View Submission" page to display dynamic columns showing the achieved value approved at each review level (Manager, Auditor, Management, Admin) as applicable based on the KPI's current status.

---

## Current vs. New Table Structure

| Current Table Columns | New Table Columns (Dynamic) |
|----------------------|----------------------------|
| Date | Date |
| Achieved Value (Employee) | Achieved Value (Self) |
| Submitted At | Manager Approved (if applicable) |
| | Auditor Approved (if applicable) |
| | Management Approved (if applicable) |
| | Admin Override (if applicable) |
| | Submitted At |

---

## Technical Implementation

### Phase 1: Database Schema Update

Add new columns to `sub_period_submissions` table to track per-level approved values:

```sql
ALTER TABLE public.sub_period_submissions
  ADD COLUMN IF NOT EXISTS manager_achieved_value integer,
  ADD COLUMN IF NOT EXISTS auditor_achieved_value integer,
  ADD COLUMN IF NOT EXISTS management_achieved_value integer,
  ADD COLUMN IF NOT EXISTS admin_achieved_value integer;

-- Optional: Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_sub_period_manager_value 
  ON public.sub_period_submissions(kpi_id, manager_achieved_value) 
  WHERE manager_achieved_value IS NOT NULL;
```

### Phase 2: Update TypeScript Interface

Update `SubPeriodSubmission` interface in `useSubPeriodSubmissions.ts`:

```typescript
export interface SubPeriodSubmission {
  // ...existing fields...
  manager_achieved_value: number | null;
  auditor_achieved_value: number | null;
  management_achieved_value: number | null;
  admin_achieved_value: number | null;
}
```

### Phase 3: Update Override Hooks to Save Per-Level Values

Modify `useManagerSubPeriodOverride.ts` to save to `manager_achieved_value`:

```typescript
// When manager accepts (no override)
.update({
  manager_achieved_value: existing.achieved_value, // Copy employee value
  updated_at: new Date().toISOString(),
})

// When manager overrides
.update({
  manager_achieved_value: override.achieved_value, // Manager's new value
  update_reason: `Manager override: ${reason}`,
  updated_at: new Date().toISOString(),
})
```

Similarly update hooks for auditor, management, and admin overrides.

### Phase 4: Update DailySubmissionSummary Component

**New Props:**

```typescript
interface DailySubmissionSummaryProps {
  // ...existing props...
  kpiStatus?: string;           // Current KPI status to determine visible columns
  showReviewerColumns?: boolean; // Enable/disable reviewer columns
  reviewSubmission?: {          // Monthly review data for context
    manager_achieved_value: number | null;
    manager_remarks: string | null;
    auditor_achieved_value: number | null;
    auditor_remarks: string | null;
    management_achieved_value: number | null;
    management_remarks: string | null;
  } | null;
}
```

**Dynamic Column Logic:**

```typescript
// Determine which columns to show based on KPI status
const visibleColumns = useMemo(() => {
  const cols: Array<{ key: string; label: string; colorClass: string }> = [
    { key: 'achieved_value', label: 'Self', colorClass: '' },
  ];
  
  // Show Manager column if KPI has passed manager_check or later
  const passedManager = ['manager_check', 'audit', 'management_review', 'approved'].includes(kpiStatus || '');
  if (passedManager) {
    cols.push({ key: 'manager_achieved_value', label: 'Manager', colorClass: 'text-amber-600' });
  }
  
  // Show Auditor column if KPI has passed audit or later
  const passedAudit = ['audit', 'management_review', 'approved'].includes(kpiStatus || '');
  if (passedAudit) {
    cols.push({ key: 'auditor_achieved_value', label: 'Auditor', colorClass: 'text-purple-600' });
  }
  
  // Show Management column if KPI has passed management_review or approved
  const passedManagement = ['management_review', 'approved'].includes(kpiStatus || '');
  if (passedManagement) {
    cols.push({ key: 'management_achieved_value', label: 'Management', colorClass: 'text-emerald-600' });
  }
  
  return cols;
}, [kpiStatus]);
```

**Updated Table Rendering:**

```tsx
<TableRow>
  <TableHead className="w-[80px]">Date</TableHead>
  {visibleColumns.map(col => (
    <TableHead key={col.key} className={col.colorClass}>
      {col.label}
    </TableHead>
  ))}
  <TableHead className="text-right">Submitted At</TableHead>
</TableRow>

{sortedSubmissions.map((submission) => (
  <TableRow key={submission.id}>
    <TableCell className="font-medium">{formattedDate}</TableCell>
    {visibleColumns.map(col => {
      const value = submission[col.key as keyof SubPeriodSubmission] as number | null;
      const prevColKey = visibleColumns[visibleColumns.indexOf(col) - 1]?.key;
      const prevValue = prevColKey ? submission[prevColKey as keyof SubPeriodSubmission] as number | null : null;
      const isChanged = prevValue !== null && value !== null && prevValue !== value;
      
      return (
        <TableCell key={col.key}>
          <span className={cn(col.colorClass, isChanged && 'font-semibold')}>
            {formatAchievedValue(value)}
          </span>
          {isChanged && (
            <Badge variant="outline" className="ml-1 text-xs">Changed</Badge>
          )}
        </TableCell>
      );
    })}
    <TableCell className="text-right text-sm text-muted-foreground">
      {formattedTimestamp}
    </TableCell>
  </TableRow>
))}
```

### Phase 5: Visual Enhancements

**Column Color Coding:**

| Level | Header Color | Badge Color |
|-------|-------------|-------------|
| Self (Employee) | Default | Default |
| Manager | Amber/Orange | `bg-amber-100` |
| Auditor | Purple | `bg-purple-100` |
| Management | Emerald/Green | `bg-emerald-100` |
| Admin | Red | `bg-red-100` |

**Changed Value Indicator:**

When a value differs from the previous level, show:
- Strikethrough on previous value
- Arrow indicator
- "Changed" badge with appropriate color

```text
| Date   | Self | Manager      | Auditor       |
|--------|------|--------------|---------------|
| 01 Jan | Yes  | Yes          | Yes           |
| 02 Jan | Yes  | ~~Yes~~ → No | No            |
| 03 Jan | No   | No           | ~~No~~ → Yes  |
```

### Phase 6: Update All Usage Points

Files to update to pass new props:

| File | Changes |
|------|---------|
| `src/pages/MyKpis.tsx` | Pass `kpiStatus` and `showReviewerColumns={true}` |
| `src/components/review/EmployeeScorecard.tsx` | Pass `kpiStatus` and `reviewSubmission` |
| `src/components/review/AuditScorecard.tsx` | Pass `kpiStatus` and `reviewSubmission` |
| `src/components/review/ManagementScorecard.tsx` | Pass `kpiStatus` and `reviewSubmission` |
| `src/components/review/InlineDailySubmissionRow.tsx` | Pass `kpiStatus` |

---

## Data Flow Summary

```text
1. Employee submits daily entry
   → sub_period_submissions.achieved_value = value

2. Manager approves (agrees)
   → sub_period_submissions.manager_achieved_value = achieved_value

3. Manager overrides
   → sub_period_submissions.manager_achieved_value = override_value
   → kpi_audit_logs records diff

4. Auditor approves/overrides
   → sub_period_submissions.auditor_achieved_value = value

5. Management approves/overrides
   → sub_period_submissions.management_achieved_value = value

6. View Submission page shows all applicable columns dynamically
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| **Database Migration** | Create | Add new columns to `sub_period_submissions` |
| `src/hooks/useSubPeriodSubmissions.ts` | Modify | Update TypeScript interface |
| `src/hooks/useManagerSubPeriodOverride.ts` | Modify | Save to `manager_achieved_value` column |
| `src/components/review/DailySubmissionSummary.tsx` | Modify | Add dynamic reviewer columns |
| `src/components/review/EmployeeScorecard.tsx` | Modify | Pass kpiStatus and reviewSubmission props |
| `src/components/review/AuditScorecard.tsx` | Modify | Save auditor value to column |
| `src/components/review/ManagementScorecard.tsx` | Modify | Save management value to column |
| `src/pages/MyKpis.tsx` | Modify | Pass kpiStatus prop |
| `DOCUMENTATION.md` | Modify | Document new columns and UI behavior |

---

## Expected Visual Result

For a KPI at "Management Review" stage:

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│ 📅 Daily Submission Summary                                                    │
├────────────────────────────────────────────────────────────────────────────────┤
│ Date   │ Self (Employee) │ Manager Approved │ Auditor Approved │ Submitted At │
│────────│─────────────────│──────────────────│──────────────────│──────────────│
│ 01 Jan │ Yes             │ Yes              │ Yes              │ 31 Jan, 8:42 │
│ 02 Jan │ Yes             │ No [Changed]     │ No               │ 31 Jan, 8:42 │
│ 03 Jan │ No              │ No               │ Yes [Changed]    │ 31 Jan, 8:42 │
│ ...    │ ...             │ ...              │ ...              │ ...          │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## Testing Checklist

1. **Database Migration**
   - [ ] New columns added successfully
   - [ ] Existing data remains intact
   - [ ] Null values handled correctly

2. **Manager Override Flow**
   - [ ] Manager agreement saves to `manager_achieved_value`
   - [ ] Manager override saves override value to `manager_achieved_value`
   - [ ] Column appears after manager review complete

3. **Auditor/Management Flows**
   - [ ] Each level saves to appropriate column
   - [ ] Columns appear progressively based on KPI status

4. **View Submission Page**
   - [ ] Correct columns shown based on KPI status
   - [ ] Changed values highlighted
   - [ ] Table is scrollable for many columns

5. **Edge Cases**
   - [ ] KPI at `kra_set` shows only Self column
   - [ ] KPI at `approved` shows all applicable columns
   - [ ] Null values displayed as "—"
