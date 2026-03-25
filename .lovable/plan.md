

## Add PDF Download to Review Timeline

### Overview
Add a "Download PDF" button to the Review Journey card in `KpiJourneySection`. The PDF will include employee details (Name, Employee Code, Reporting Manager) plus the full KPI information and all review stage data (scores, ratings, remarks).

### Changes

**1. New export function in `src/lib/pdfExport.ts`**

Add `exportReviewTimelinePdf()` that generates a single-page (or multi-page) PDF containing:
- Header with company name and review period
- Employee profile box: Name, Employee Code, Reporting Manager Name
- KPI details: Category, KRA, KPI Name, Target, UOM, Criteria, Weightage, Frequency
- Review stages grid (matching the UI layout): each stage shows score, rating, achieved value, and remarks
- Uses existing drawing helpers (`drawProgressBar`, `getRatingColor`, `STAGE_COLORS`, etc.)

```typescript
export interface ReviewTimelinePdfData {
  employeeName: string;
  employeeCode: string;
  reportingManagerName: string;
  kpi: { kraName, kpiName, category, target, uom, criteria, weightage, frequency, status };
  stages: Array<{ title, score, rating, achievedValue, remarks, status: 'completed'|'current'|'pending' }>;
  period: string;
  year: string;
  companyName?: string;
  isNA?: boolean;
}
```

**2. Update `src/components/review/KpiJourneySection.tsx`**
- Add new props: `employeeName`, `employeeCode`, `reportingManagerName`
- Add a "Download PDF" button (using `Download` icon from lucide) in the CardHeader next to "Review Journey" title
- On click, call the new `exportReviewTimelinePdf()` with all the stage data already computed in the component

**3. Update `src/components/review/KpiReviewPanel.tsx`**
- Add and pass through `employeeName`, `employeeCode`, `reportingManagerName` props to `KpiJourneySection`

**4. Update all parent scorecard components that render `KpiReviewPanel`**
- `EmployeeScorecard.tsx`, `AuditScorecard.tsx`, `ManagementScorecard.tsx`, `UnifiedScorecard.tsx`, `SelfReviewSheet.tsx`, `MentionedKpiSheet.tsx`
- Pass employee name, code, and reporting manager name through `KpiReviewPanel`
- For reporting manager name: use the already-fetched profile data or fetch manager name from profiles if not already available

### Technical Details

- The PDF uses `jsPDF` (already a project dependency) with existing color constants and drawing helpers from `pdfExport.ts`
- Layout: Portrait A4, with a profile section at top, KPI details section, then a 2x3 or 3x2 grid of review stage panels matching `STAGE_COLORS`
- File name format: `Review_Timeline_{EmployeeName}_{KpiName}_{Period}_{Year}.pdf`
- The download button only appears when at least one stage has data (not all pending)

