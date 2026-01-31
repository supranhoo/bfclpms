

# Plan: Redesign KPI Review Pages with Integrated Daily Submission Summary

## Summary

Redesign the KPI Review interfaces across all user roles (Employee, Manager, Auditor, Management, Admin) to prominently display the Daily Submission Summary table without losing any existing functionality. The goal is to make captured daily values immediately visible within the review flow.

## Current Architecture Analysis

| Role | Review Page | Scorecard Component | Current Daily Summary Placement |
|------|-------------|---------------------|--------------------------------|
| Employee | `/my-kpis` (MyKpis.tsx) | Inline Sheet | Inside review sheet, right column |
| Manager | `/team-review` (TeamReview.tsx) | EmployeeScorecard.tsx | Inside review sheet (needs View button click) |
| Auditor | `/audit` (AuditPanel.tsx) | AuditScorecard.tsx | Inside review sheet (needs click) |
| Management | `/management-review` (ManagementReview.tsx) | ManagementScorecard.tsx | Inside review sheet (needs click) |
| Admin | `/admin/kpis` (AllKpis.tsx) | Expanded row | Not currently shown |

## Proposed Design: Inline Expandable Daily Summary

Instead of requiring users to open a sheet/modal to see daily submissions, we will:
1. Add an expandable row section directly in the KPI table for Daily KPIs
2. Keep the review sheet for detailed actions (scoring, remarks, approval)
3. Show a "Daily" badge indicator on Daily KPIs for immediate recognition
4. Allow inline expansion to view the Daily Submission Summary without opening a sheet

```text
KPI Table (Before Click)
+----------------------------------------------------------------+
| Category | KRA/KPI       | Target | Achieved | Score | Actions |
+----------------------------------------------------------------+
| Sales    | Daily Check-in|   30   |    25    |  4/5  | [Review]|
|          |               |        |          |       | [⌄ Daily]|
+----------------------------------------------------------------+

KPI Table (After Clicking "Daily" Badge)
+----------------------------------------------------------------+
| Category | KRA/KPI       | Target | Achieved | Score | Actions |
+----------------------------------------------------------------+
| Sales    | Daily Check-in|   30   |    25    |  4/5  | [Review]|
|          |               |        |          |       | [⌃ Daily]|
+----------------------------------------------------------------+
| ┌──────────────────────────────────────────────────────────┐  |
| │ Daily Submission Summary                                  │  |
| │ +------+ +------+ +------+ +------+                       │  |
| │ | 31   | |  25  | |  6   | |  2   |                       │  |
| │ | Days | | Done | | Miss | | "No" |                       │  |
| │ +------+ +------+ +------+ +------+                       │  |
| │                                                           │  |
| │ Date    | Achieved Value | Submitted At                   │  |
| │---------+----------------+--------------------------------│  |
| │ 30 Jan  | Yes ✓          | 30 Jan 2026, 09:15 AM          │  |
| │ 31 Jan  | No ✗           | 31 Jan 2026, 10:30 AM          │  |
| └──────────────────────────────────────────────────────────┘  |
+----------------------------------------------------------------+
```

## Technical Implementation

### Files to Modify

| File | Change | Purpose |
|------|--------|---------|
| `src/pages/MyKpis.tsx` | Add expandable row state & render inline summary | Employee view |
| `src/components/review/EmployeeScorecard.tsx` | Add expandable row in table for Daily KPIs | Manager/Admin view |
| `src/components/review/AuditScorecard.tsx` | Add expandable row in table for Daily KPIs | Auditor view |
| `src/components/review/ManagementScorecard.tsx` | Add expandable row in table for Daily KPIs | Management view |
| `src/pages/admin/AllKpis.tsx` | Integrate DailySubmissionSummary in expanded employee rows | Admin all KPIs view |
| `src/components/review/DailySubmissionSummary.tsx` | Add optional compact mode prop for inline display | Styling adaptation |
| `DOCUMENTATION.md` | Update documentation | Sync with changes |

### Step 1: Update DailySubmissionSummary Component

Add a `compact` prop for inline table display:

```typescript
interface DailySubmissionSummaryProps {
  // ... existing props
  compact?: boolean; // New prop for inline display mode
}
```

When `compact={true}`:
- Remove the Card wrapper
- Reduce padding and margins
- Use smaller stat cards
- Limit table height to 150px instead of 200px

### Step 2: Create Reusable InlineKpiRow Component

Create a new component to handle expandable row logic:

```typescript
// src/components/review/InlineKpiRow.tsx
interface InlineKpiRowProps {
  kpi: KPI;
  submission: ReviewSubmission | undefined;
  isExpanded: boolean;
  onToggleExpand: () => void;
  selectedPeriod: string;
  selectedYear: number;
  children: React.ReactNode; // The actual row content
}
```

This handles:
- Expansion toggle state
- Lazy loading of sub-period submissions only when expanded
- Consistent animation/transition

### Step 3: Modify KPI Tables in All Scorecards

For each scorecard (Employee, Audit, Management):

1. Add state to track expanded rows:
```typescript
const [expandedDailyKpis, setExpandedDailyKpis] = useState<Set<string>>(new Set());
```

2. Add toggle function:
```typescript
const toggleDailyExpand = (kpiId: string) => {
  setExpandedDailyKpis(prev => {
    const newSet = new Set(prev);
    if (newSet.has(kpiId)) newSet.delete(kpiId);
    else newSet.add(kpiId);
    return newSet;
  });
};
```

3. Modify table row to include expand/collapse button for Daily KPIs:
```tsx
<TableRow key={kpi.id}>
  {/* ... existing cells ... */}
  <TableCell>
    <div className="flex items-center gap-1">
      {canReview && <Button onClick={() => openReviewSheet(kpi)}>Review</Button>}
      {kpi.frequency === 'Daily' && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toggleDailyExpand(kpi.id)}
          className="text-xs gap-1"
        >
          <Calendar className="h-3 w-3" />
          {expandedDailyKpis.has(kpi.id) ? <ChevronUp /> : <ChevronDown />}
        </Button>
      )}
    </div>
  </TableCell>
</TableRow>

{/* Expandable Daily Summary Row */}
{kpi.frequency === 'Daily' && expandedDailyKpis.has(kpi.id) && (
  <TableRow>
    <TableCell colSpan={8} className="p-0">
      <DailySubmissionSummaryWrapper 
        kpi={kpi} 
        selectedPeriod={selectedPeriod} 
        selectedYear={selectedYear}
        compact
      />
    </TableCell>
  </TableRow>
)}
```

### Step 4: Add Daily Badge Indicator

Add a visual indicator on Daily KPIs in all tables:

```tsx
<TableCell>
  <div className="flex items-center gap-2">
    <p className="font-medium">{kpi.kra_name}</p>
    {kpi.frequency === 'Daily' && (
      <Badge variant="outline" className="text-xs h-5 px-1.5 bg-blue-50 border-blue-200 text-blue-700">
        <Calendar className="h-3 w-3 mr-0.5" />
        Daily
      </Badge>
    )}
  </div>
</TableCell>
```

### Step 5: Update MyKpis.tsx for Employee View

Similar changes but adapted for the employee's own KPI table:

```tsx
{/* In the KPI table */}
{sortedKpis.map(kpi => (
  <React.Fragment key={kpi.id}>
    <TableRow>
      {/* ... existing cells ... */}
      <TableCell>
        <div className="flex items-center gap-1">
          {kpi.status === 'kra_set' && (
            <Button size="sm" onClick={() => openReviewDialog(kpi)}>
              Review
            </Button>
          )}
          {kpi.frequency === 'Daily' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleDailyExpand(kpi.id)}
            >
              <Calendar className="h-3.5 w-3.5" />
              {expandedDailyKpis.has(kpi.id) ? 
                <ChevronUp className="h-3 w-3" /> : 
                <ChevronDown className="h-3 w-3" />
              }
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
    
    {/* Expandable row for Daily KPIs */}
    {kpi.frequency === 'Daily' && expandedDailyKpis.has(kpi.id) && (
      <TableRow className="bg-muted/30">
        <TableCell colSpan={8} className="py-2 px-4">
          <DailySubmissionSummary
            kpiId={kpi.id}
            reviewMonth={selectedPeriod}
            reviewYear={selectedYear}
            submissions={getKpiSubPeriodSubmissions(kpi.id)}
            uom={kpi.uom}
            uomType={kpi.uom_type}
            qualitativeOptions={kpi.qualitative_options}
            compact
          />
        </TableCell>
      </TableRow>
    )}
  </React.Fragment>
))}
```

### Step 6: Update Admin All KPIs Page

Modify `AllKpis.tsx` to show daily submissions in expanded employee KPI cards:

```tsx
{employeeKpis.map(kpi => (
  <div key={kpi.id} className="p-3 bg-background rounded-lg border">
    {/* Existing KPI info */}
    <div className="flex items-center justify-between">
      {/* ... */}
    </div>
    
    {/* Daily Submission Summary for Daily KPIs */}
    {kpi.frequency === 'Daily' && (
      <DailyKpiSubmissionWrapper kpi={kpi} compact />
    )}
  </div>
))}
```

## Data Flow

```text
User Action                    Component                         Data Fetch
-----------                    ---------                         ----------
Click expand on Daily KPI  ->  Scorecard/MyKpis Component  ->   useSubPeriodSubmissions hook
                                      |                                    |
                                      v                                    v
                           Toggle expandedDailyKpis state        Fetch from sub_period_submissions
                                      |                                    |
                                      v                                    v
                           Render DailySubmissionSummary  <----- Display submissions data
                           (compact mode in table row)
```

## Preserved Existing Functionality

| Feature | Status | Notes |
|---------|--------|-------|
| Review button for managers | Preserved | Opens detailed review sheet |
| Score input in review sheet | Preserved | Sheet still accessible for all actions |
| Send Back / Query actions | Preserved | Accessible from review sheet |
| View button for non-reviewable KPIs | Preserved | Opens sheet in view-only mode |
| Daily submission in review sheet | Preserved | Still shows in sheet for context |
| Sorting and filtering | Preserved | Works with expandable rows |
| KPI Logic modal | Preserved | Click KRA/KPI name to open |

## UI/UX Benefits

1. **Immediate Visibility**: Daily submissions visible without opening a modal/sheet
2. **Progressive Disclosure**: Expand only the KPIs you want to inspect
3. **Consistent Experience**: Same pattern across all user roles
4. **Non-Intrusive**: Collapsed by default, doesn't clutter the table
5. **Quick Access**: One click to see daily data vs two clicks before

## Implementation Order

1. Update `DailySubmissionSummary.tsx` with compact mode
2. Update `MyKpis.tsx` (employee view)
3. Update `EmployeeScorecard.tsx` (manager view)
4. Update `AuditScorecard.tsx` (auditor view)
5. Update `ManagementScorecard.tsx` (management view)
6. Update `AllKpis.tsx` (admin view)
7. Update `DOCUMENTATION.md`

## Testing Checklist

- Login as Employee: Verify daily badge and expandable row in My KPIs
- Login as Manager: Verify in Team Review scorecard
- Login as Auditor: Verify in Audit Panel scorecard
- Login as Management: Verify in Management Review scorecard
- Login as Admin: Verify in All KPIs expanded employee rows
- Verify existing Review/Approve/Send Back flows still work
- Verify data displays correctly when expanded
- Verify expansion persists during scroll
- Test with KPIs that have null achieved_value

