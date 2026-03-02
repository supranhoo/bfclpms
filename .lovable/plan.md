

# Add STI KPI for 8 Employees (January and February 2026)

## Context

LTI (Lost Time Injury) and STI (Short Time Injury) are **separate KPIs** under "Ensure Zero Harm workplace". Most employees already have both. However, 8 employees currently only have LTI and are missing STI for January and February 2026.

## Affected Employees (Missing STI)

| # | Employee | Jan LTI Status | Feb LTI Status |
|---|----------|---------------|----------------|
| 1 | Badal Kumar Ravi | approved | self_review |
| 2 | Deepak Kumar | hr_pms_review | self_review |
| 3 | Gaurav Tiwari | hr_pms_review | manager_check |
| 4 | Md Humayun | self_review | self_review |
| 5 | Pradip Duary | hr_pms_review | self_review |
| 6 | Rama Prasad Yadav | self_review | self_review |
| 7 | Ritesh Kumar Singh | hr_pms_review | self_review |
| 8 | Shiv Prakash Rai | approved | self_review |

## Action: Insert 16 new STI KPI records

For each of the 8 employees, insert one STI KPI for January and one for February 2026 with the following properties (matching the existing STI KPIs other employees already have):

- **KRA**: Ensure Zero Harm workplace
- **KPI Name**: Total Recordable Injury( STI): - Description: Measures workplace safety incidents (STI) - Formula: (Number of STI) - Scoring Logic: (Scoring: 5 for 0 STI, 2 for 1 STI, 0 for >=1 STI)
- **Category**: Safety and Health (0b5bab71-35a9-4071-be58-a760b89bed86)
- **Weightage**: 2%
- **Target**: 0
- **UOM**: Number (numeric)
- **Criteria**: Lower is Better
- **Scoring**: R5=0, R2=1, R0=>1
- **Org-level**: Yes (employee scope)
- **Frequency**: Monthly
- **Status**: kra_set (new KPI, not yet reviewed)

## Weightage Impact

Each employee will gain +2% from the new STI KPI. This is expected since STI was missing from their scorecards.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data Impact | None | Adding new records only, no existing data modified |
| Unique Constraint | Safe | Different kpi_name (STI vs LTI), no conflict |
| Weightage | +2% per employee | Expected correction |

## Technical Steps

1. Insert 16 STI KPI records using the data insert tool (8 employees x 2 months)
2. Verify all 8 employees now have both LTI and STI for Jan and Feb 2026
