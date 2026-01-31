

# Plan: Daily KPI Submission Summary Table (Multi-Role Visibility)

## Summary

This plan adds a read-only summary table that displays all submitted daily entries for a KPI. The table shows real-time data as soon as entries are submitted and will be visible to:

1. **Employee** - On their "My KPIs" self-review page
2. **Reporting Manager** - On the Team Review scorecard (EmployeeScorecard)
3. **Auditor** - On the Audit Panel scorecard (AuditScorecard)
4. **Admin** - On the Team Review scorecard (uses same EmployeeScorecard)
5. **Management** - On the Management Review scorecard (ManagementScorecard)

The table displays submission statistics and a detailed view of all daily entries.

## Feature Requirements

| Requirement | Description |
|-------------|-------------|
| Summary Table | Show all submitted daily entries with Date, Achieved Value, Submission Timestamp columns |
| Missing Count | Display count of days where no submission was made |
| "No" Count | For binary KPIs, display count of days where "No" was the achieved value |
| Multi-Role Visibility | Visible to Employee, Reporting Manager, Auditor, Admin, and Management |
| Real-Time Updates | Data appears immediately after daily submission |
| Read-Only | The table is for viewing purposes only (editing happens in the existing submission grid) |

## New Component

### `DailySubmissionSummary.tsx`

A new read-only component that displays:
- A table with columns: Date, Achieved Value, Submission Timestamp
- Summary stats cards showing:
  - Total days in month
  - Days submitted
  - Days not submitted (missing)
  - Count of "No" values (for binary KPIs only)

## Files to Create/Modify

| File | Change Type | Purpose |
|------|-------------|---------|
| `src/components/review/DailySubmissionSummary.tsx` | Create | New read-only summary table component |
| `src/pages/MyKpis.tsx` | Modify | Add summary table for employee's self-view |
| `src/components/review/EmployeeScorecard.tsx` | Modify | Add summary for Reporting Manager + Admin view |
| `src/components/review/AuditScorecard.tsx` | Modify | Add summary for Auditor view |
| `src/components/review/ManagementScorecard.tsx` | Modify | Add summary for Management view |
| `DOCUMENTATION.md` | Modify | Document new component |

## Technical Details

### New Component: DailySubmissionSummary.tsx

```typescript
interface DailySubmissionSummaryProps {
  kpiId: string;
  reviewMonth: string;
  reviewYear: number;
  submissions: SubPeriodSubmission[];
  uom?: string | null;
  uomType?: string | null;
  qualitativeOptions?: QualitativeOption[] | null;
}
```

**Component Features:**

1. **Summary Stats Row** (4 cards):
   - Total Days: Number of days in the month
   - Submitted: Count of days with submissions
   - Not Submitted: Count of days without submissions
   - "No" Count: (Only for binary KPIs) Count of entries where achieved value = "No" / rating = 0

2. **Summary Table** with columns:
   - Date (formatted as "01 Jan", "02 Jan", etc.)
   - Achieved Value (formatted appropriately for numeric/binary/tiered)
   - Submission Timestamp (formatted as "dd MMM yyyy, hh:mm a")

3. **Visual indicators**:
   - Rows with "No" value highlighted in light red
   - Final/resubmitted entries show lock icon

### Role-Based Integration

| Role | Page/Component | Location in UI |
|------|----------------|----------------|
| Employee | MyKpis.tsx | Inside the review sheet when viewing a daily KPI |
| Reporting Manager | EmployeeScorecard.tsx | Inside the review sheet for daily KPIs |
| Admin | EmployeeScorecard.tsx (via TeamReview) | Same as Reporting Manager |
| Auditor | AuditScorecard.tsx | Inside the review sheet for daily KPIs |
| Management | ManagementScorecard.tsx | Inside the review sheet for daily KPIs |

### Visual Design

#### Summary Stats Cards

```text
+------------------------------------------------------------------+
|  [Calendar] 31      [Check] 15        [X] 16         [Ban] 3     |
|  Total Days         Submitted         Not Submitted   "No" Count |
+------------------------------------------------------------------+
```

#### Summary Table Layout

```text
+------------------------------------------------------------------+
|  Daily Submission Summary                                         |
+------------------------------------------------------------------+
| Date          | Achieved Value     | Submitted At                 |
|---------------|--------------------|-----------------------------|
| 01 Jan        | Yes                | 01 Jan 2026, 10:30 AM       |
| 02 Jan        | No       [!]       | 02 Jan 2026, 09:15 AM       |
| 03 Jan        | Yes      [Lock]    | 03 Jan 2026, 11:45 AM       |
| ...           | ...                | ...                         |
+------------------------------------------------------------------+
```

- Rows with "No" value have light red/pink background
- Lock icon shown for final (resubmitted) entries
- Scrollable if many entries

### Statistics Calculation Logic

```typescript
// Calculate summary stats
const daysInMonth = getDaysInMonth(new Date(reviewYear, getMonthNumber(reviewMonth) - 1));
const submittedCount = submissions.filter(s => s.achieved_value !== null).length;
const missingCount = daysInMonth - submittedCount;

// For binary KPIs, count "No" values (rating = 0)
const noCount = submissions.filter(s => s.achieved_value === 0).length;
```

### Display Value Formatting

For qualitative (binary/tiered) KPIs:
- Look up the label from options based on the stored rating value
- For binary: 0 = "No", 5 = "Yes"
- For tiered: Match rating to the corresponding option label

For numeric KPIs:
- Display the value with the UOM suffix

### Data Flow

1. All scorecards already use `useSubPeriodSubmissions` hook or can be extended to fetch this data
2. The summary component receives submissions as a prop
3. Data updates in real-time via React Query's cache invalidation
4. When employee submits daily data, all role views immediately reflect the update

### Conditions for Display

The summary table will only be shown when:
1. The KPI has frequency = "Daily"
2. At least one submission exists for the month
3. User has appropriate role access to view the employee's data

## Testing Checklist

After implementation:
- Employee: Open a Daily KPI in self-review - verify summary table appears
- Reporting Manager: Open team member's daily KPI - verify summary visible
- Admin: Open any employee's daily KPI via Team Review - verify summary visible
- Auditor: Open employee KPI in Audit Panel - verify summary visible
- Management: Open employee KPI in Management Review - verify summary visible
- Verify correct count of submitted/missing days across all views
- For binary KPIs, verify "No" count is calculated correctly
- Verify submission timestamps are formatted correctly
- Verify achieved values display correctly for numeric, binary, and tiered KPIs
- Test real-time: Submit daily data as employee, immediately check manager/auditor view
- Test with a daily KPI that has no submissions - verify table doesn't appear

