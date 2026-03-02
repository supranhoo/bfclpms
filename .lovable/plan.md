

# Add Missing Safety KPIs for 8 Employees (February 2026)

## Analysis Summary

After checking all 8 employees' February 2026 scorecards under "Ensure Zero Harm workplace", here is what's missing:

### KPI 1: Timely Closure of Safety Observations -- 1 employee missing

| # | Employee | Status |
|---|----------|--------|
| 1 | Badal Kumar Ravi | Already has it (3%) |
| 2 | Deepak Kumar | Already has it (3%) |
| 3 | Gaurav Tiwari | Already has it (2%) |
| 4 | Md Humayun | Already has it (3%) |
| 5 | Pradip Duary | Already has it (3%) |
| 6 | **Rama Prasad Yadav** | **MISSING -- will insert** |
| 7 | Ritesh Kumar Singh | Already has it (3%) |
| 8 | Shiv Prakash Rai | Already has it (3%) |

### KPI 2: Proactive Safety Reporting (UA, UC, and Near Miss) -- 6 employees missing

| # | Employee | Status |
|---|----------|--------|
| 1 | **Badal Kumar Ravi** | **MISSING -- will insert** |
| 2 | **Deepak Kumar** | **MISSING -- will insert** |
| 3 | Gaurav Tiwari | Already has it (3%) |
| 4 | Md Humayun | Already has it (3%) |
| 5 | **Pradip Duary** | **MISSING -- will insert** |
| 6 | **Rama Prasad Yadav** | **MISSING -- will insert** |
| 7 | **Ritesh Kumar Singh** | **MISSING -- will insert** |
| 8 | **Shiv Prakash Rai** | **MISSING -- will insert** |

## Action: Insert 7 new KPI records

### Record 1 -- Timely Closure (Rama Prasad Yadav)

- **KRA**: Ensure Zero Harm workplace
- **KPI Name**: (exact text matching existing records in DB)
- **Category**: Safety and Health (0b5bab71-35a9-4071-be58-a760b89bed86)
- **Weightage**: 3% (matching peers)
- **Target**: 0
- **UOM**: Number / binary
- **Criteria**: Lower is Better
- **Scoring**: R5=0, R0=any observations open > 15 days
- **Org-level**: Yes (employee scope)
- **Frequency**: Monthly
- **Status**: kra_set

### Records 2-7 -- Proactive Safety Reporting (6 employees)

- **KRA**: Ensure Zero Harm workplace
- **KPI Name**: (exact text with percentage-based scoring logic matching user's request)
- **Category**: Safety and Health (0b5bab71-35a9-4071-be58-a760b89bed86)
- **Weightage**: 2% (as specified by user)
- **Target**: 100
- **UOM**: Number / numeric
- **Criteria**: Higher is Better
- **Scoring**: R5=150%, R4=125%, R3=100%, R2=75%, R1=50%, R0=<50%
- **Org-level**: Yes (employee scope)
- **Frequency**: Monthly
- **Status**: kra_set

## Weightage Impact

| Employee | KPIs Added | Weightage Change |
|----------|-----------|-----------------|
| Rama Prasad Yadav | Both KPI 1 + KPI 2 | +5% (3% + 2%) |
| Badal Kumar Ravi | KPI 2 only | +2% |
| Deepak Kumar | KPI 2 only | +2% |
| Pradip Duary | KPI 2 only | +2% |
| Ritesh Kumar Singh | KPI 2 only | +2% |
| Shiv Prakash Rai | KPI 2 only | +2% |

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data Impact | None | New inserts only, no existing data modified |
| Unique Constraint | Safe | Different kpi_names, no conflict with idx_kpis_no_duplicates |
| Weightage | Expected correction | These KPIs were missing from their scorecards |

## Technical Steps

1. Insert 7 KPI records via data insert tool (1 Timely Closure + 6 Proactive Safety)
2. Verify all 8 employees now have both KPIs for February 2026

