

## Fix Variance Calculation Direction

### Change
Currently variance = `auditorScore - managementScore`. User wants it reversed: **variance = managementScore - auditorScore**. Green when positive (management > auditor), red when negative (management < auditor).

### Implementation — `src/pages/reports/VarianceReport.tsx`

1. **Line 96**: Change `variance: auditorScore - managementScore` → `variance: managementScore - auditorScore`
2. **Badge colors** already use `r.variance > 0` for green and `< 0` for red — no change needed there since the sign flip handles it automatically

### Risk Assessment
- **Data/Workflow/Regression**: Zero — display-only sign flip

### Files Changed
1. `src/pages/reports/VarianceReport.tsx` — one-line change

