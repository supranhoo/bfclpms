
# Fix: Remaining Weightage Fluctuations in March 2026 — COMPLETED

## Results

| Metric | Before | After |
|--------|--------|-------|
| Employees at 100% | 77 | **86** |
| Over 100% | 7 | 4 (pre-existing source data) |
| Under 100% | 10 | 4 (pre-existing source data) |

## Actions Taken

1. **Deleted 17 duplicate March KPIs** — KPIs from Jan org-replication that didn't exist in Feb (Dummy 12, Amit 1, Biswajit 1, Vivek 3)
2. **Deleted 1 exact duplicate** — Jitendra Bharti had identical KPI inserted twice
3. **Fixed 1 weightage mismatch** — Dileshwar Mahto "Timely Grievance Resolution" 10%→7% to match Feb
4. **Inserted 2 missing KPIs for Dummy** — Feb KPIs not in March
5. **Inserted missing KPIs for 7 under-100% employees** — Feb KPIs copied to March
6. **Improved rollover dedup logic** — Now checks `kra_name`-level existence in addition to exact `kra_name+kpi_name`, preventing cross-source duplicates

## Remaining (Admin Review Required)

| Employee | March Total | Cause |
|----------|-------------|-------|
| Parshu Ram Shukla | 101.5% | 4 legitimate KPIs under "Ensure Zero Harm workplace" |
| V.A.V.S.S. Ganapathi Varma | 101.5% | Same pattern |
| Anant Shankar Shet | 101.5% | Extra org KPI from Jan not in Feb (+1.5%) |
| Anil Kumar Pathak | 101.5% | Same pattern |
| Prakash Chandra Goswami | 98% | Also 98% in Feb — source data issue |
| Sourav Chowdhury | 93% | No Feb data |
| Rupesh Kumar Sharma | 90% | 65% in Feb — source data issue |
| Dummy | 90% | Different KPI sets in Jan vs Feb (test user) |
