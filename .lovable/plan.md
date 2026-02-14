

# RCA and CAPA: Incorrect Ratings in Admin Data Entry

## Root Cause Analysis (RCA)

### What happened
The screenshot shows KPI "RM Quality" (Incoming Quality of RM) for December 2025 with incorrect ratings:
- **Self**: Achieved Value = 0, Rating shown = 1.5 (should be **5**)
- **Auditor**: Achieved Value = 1, Rating shown = 0 (correct -- 1 exceeds R5=0 threshold, no other thresholds defined)
- **Management**: Achieved Value = 0, Rating shown = 1.5 (should be **5**)

### KPI Configuration
- Target: 0, UOM: Number, Criteria: Lower is Better
- Threshold Mode: Absolute
- R5 = 0 (only threshold defined; R4-R1 are null)
- Weightage: 1.5%

### Why ratings are wrong

**Primary Root Cause**: The Admin Data Entry Dialog (`AdminDataEntryDialog.tsx`) does **NOT** auto-calculate rating or score when an achieved value is entered. Despite the field being labeled "Score (Auto-calculated)", it is a plain manual text input with no calculation logic.

The flow is:
1. Admin enters an "Achieved Value" (e.g., 0)
2. Admin must then **manually** select a Rating (blue/green/yellow/red) and **manually** type a Score number
3. Without understanding the KPI's threshold logic, the admin entered incorrect values

**Evidence from database audit logs**: The `kpi_audit_logs` table shows the admin stored `self_score: 1.50` (which equals the KPI's weightage, not the correct rating of 5) and `management_score` was set to 10 (also incorrect).

**Contributing Factor**: The normal self-review flow in `SelfReviewSheet.tsx` correctly uses `calculateRating()` to auto-compute scores (line 185-190). However, the Admin Data Entry Dialog bypasses this calculation entirely, relying on error-prone manual input.

---

## Corrective and Preventive Action (CAPA)

### Fix: Auto-calculate Rating and Score in Admin Data Entry Dialog

When the admin enters an achieved value, the dialog should automatically:
1. Run `calculateRating()` using the KPI's thresholds, criteria, UOM, and threshold mode
2. Pre-fill the Rating dropdown and Score field with the correct calculated values
3. Still allow manual override if the admin needs to set a different value
4. Show a visual indicator distinguishing auto-calculated vs manually overridden scores

### Files to Modify

| File | Change |
|---|---|
| `src/components/admin/AdminDataEntryDialog.tsx` | Import `calculateRating` and `RatingThresholds` from `ratingCalculation.ts`. Add a `useEffect` or `useCallback` that triggers when the achieved value changes, calling `calculateRating()` with the KPI's properties. Auto-populate the rating and score fields with the result. Update the "Score" label to clarify it is auto-calculated but overridable. |
| `DOCUMENTATION.md` | Document the auto-calculation behavior in the Admin Data Entry section |

### Technical Detail

The auto-calculation will use the same function as the employee self-review:

```text
calculateRating(
  achievedValue,      // from admin input
  kpi.target_value,   // from KPI record
  { r5, r4, r3, r2, r1, r0 },  // from KPI thresholds
  kpi.criteria,       // "Higher is Better" or "Lower is Better"
  kpi.weightage,      // KPI weightage
  kpi.uom_type,       // numeric, binary, tiered
  kpi.qualitative_options,
  kpi.uom,            // Number, %, Date, etc.
  kpi.threshold_mode  // absolute or ratio
)
```

The returned `result.rating` (0-5) will populate the Score field, and `ratingToLevel(result.rating)` will set the Rating dropdown.

### Risk

Low -- uses the same calculation engine already proven in the self-review flow. Manual override remains available for edge cases.

