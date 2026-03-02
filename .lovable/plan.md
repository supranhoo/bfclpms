

# Fix January Weightage for Amit Kumar Shaw (101804)

## Issue
The KPI "On-Time Submission of Accurate MIS Reports" has **3% weightage in January** but **5% in February**, causing the January total to be only **98%** instead of 100%.

## Action
Update the weightage from **3% to 5%** for the following record:

- **KPI ID**: `a239a397-5d56-4c9f-a0cf-6ac486e43664`
- **Employee**: Amit Kumar Shaw (101804)
- **Period**: January 2026
- **Change**: weightage 3 --> 5

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data Impact | Minimal -- single field update | Only affects one KPI record |
| Weightage | Corrective | Brings January total from 98% to 100% |
| Scoring | No impact | KPI is in `kra_set` or early review status |

## Technical Step
1. Execute UPDATE on the `kpis` table setting `weightage = 5` where `id = 'a239a397-5d56-4c9f-a0cf-6ac486e43664'`
2. Verify January total weightage is now 100%

