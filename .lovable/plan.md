

## Fix: Apply N-1 Month Logic Only to Compliance KPI on Org KPI Page

### Scope Clarification
The N-1 submission date logic applies **only** to:
- The Org KPI Data Entry page (`OrgKpiEntryCard.tsx`)
- The compliance KPI ("Implementation of common...") specifically

The review journey (`useEmployeeSubmissionDate`) and all other KPIs remain unchanged.

### Change

| # | File | Change |
|---|------|--------|
| 1 | `src/components/admin/OrgKpiEntryCard.tsx` | Compute previous month/year and pass to `useBulkEmployeeSubmissionDates` only when `isCompliance` is true |
| 2 | `DOCUMENTATION.md` | Document N-1 scoping rule |
| 3 | `POLICY.md` | Version sync |

### Technical Detail

In `OrgKpiEntryCard.tsx` around line 139, add previous month calculation and use it conditionally:

```typescript
const MONTHS_LIST = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];

const prevMonthIdx = MONTHS_LIST.indexOf(reviewPeriod) - 1;
const complianceMonth = prevMonthIdx < 0 ? 'December' : MONTHS_LIST[prevMonthIdx];
const complianceYear = prevMonthIdx < 0 ? reviewYear - 1 : reviewYear;

const { data: submissionDates } = useBulkEmployeeSubmissionDates(
  employeeIdsForCompliance,
  isCompliance ? complianceMonth : reviewPeriod,   // N-1 for compliance only
  isCompliance ? complianceYear : reviewYear,       // N-1 for compliance only
  isCompliance && isEmployeeScope
);
```

### Risk Assessment
- **Data impact**: None — read-only query parameter change
- **Regression risk**: None — conditional logic only activates for compliance KPI
- **Scope**: Single file change + docs

