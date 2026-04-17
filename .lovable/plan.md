
## RCA: Why "PMS Score 4000" shows for an employee without KRAs

### What the screenshot actually shows
- Manabendra Jana (100386): "PMS Score" column = **4000**
- Swaraj Mukhopadhyay (100327): "PMS Score" column = **4.74**
- Both are vessel-based records under "Port Incentive".

### Root cause (verified against the dialog code)
Looking at `src/components/incentive/IncentiveDryRunDialog.tsx` line ~158:

```ts
const pmsScore = r.pms_score != null ? toNum(r.pms_score).toFixed(2) : (r.production_value ?? '—');
```

The "PMS Score" cell is **overloaded**: when `pms_score` is null it falls back to `production_value`. For vessel-based programs the engine writes the **vessel amount** (or a vessel-derived value like `vessels × rate = 2 × 2000 = 4000`) into `production_value`, so the cell prints `4000` and looks like a PMS score.

That's why:
- Swaraj (has a real PMS score) shows `4.74` — actual KRA-derived score.
- Manabendra (no KRAs) shows `4000` — that's actually the vessel amount being mis-displayed under a PMS Score header.

This is a **display bug, not a compute bug**. The compute engine is correct (Amount = ₹4,000 matches `2 vessels × ₹2,000`). The dialog column simply mislabels vessel-mode records.

### Secondary issue
For vessel-based programs the columns "PMS Score", "DQ Reason", "LTI Penalty", "Pro-rata", "Final %" are all **non-applicable** by design (vessel mode = `vessels × rate`, no PMS/slab/proration). They currently render as `0%` / `—` which is misleading.

### Fix

**File: `src/components/incentive/IncentiveDryRunDialog.tsx`**

1. **Detect vessel-mode rows.** Use `result.diagnostics?.vessel_program_detected` (already exposed by the engine in the previous fix) as the single source of truth.
2. **Vessel-mode row rendering**:
   - PMS Score column → `N/A` (muted) instead of falling back to `production_value`.
   - Base %, DQ Reason, LTI Penalty, Pro-rata, Final % → all show `N/A` (muted).
   - Amount column → unchanged (still shows the real vessel amount).
   - Add a small "Vessel" badge next to the employee name for clarity.
3. **Non-vessel rows**: keep current behavior unchanged.
4. **Header tooltip**: add a subtle tooltip on "PMS Score" header noting that vessel-mode records are scored on `vessels × rate` and PMS metrics don't apply.

No backend changes. No schema changes. No compute changes.

### Regression guard
Add a Vitest snapshot to `src/components/incentive/__tests__/IncentiveDryRunDialog.test.tsx`:
- Fixture A: vessel-program record with `production_value=4000`, no `pms_score` → asserts row renders `N/A` in PMS / Base / Final, and `₹4,000` in Amount.
- Fixture B: support-program record with `pms_score=4.74` → asserts row renders `4.74` and the existing percentage columns.

### SSOT sync
- `DOCUMENTATION.md` Version History: *"Dry-run dialog now suppresses PMS/slab columns for vessel-based program records (display only — no compute change)."*
- `POLICY.md` Incentive Engine Display Rules: *"Vessel-based incentive records MUST display N/A for PMS Score, Base %, DQ, LTI, Pro-rata and Final %. Only Amount is meaningful."*
- `mem://features/incentive/core-engine-specifications`: append the vessel-mode display contract.

### Risk & Impact
| Area | Impact |
|---|---|
| Data | None. Zero schema/compute changes. |
| Workflow | None. Compute output unchanged; only the preview cell rendering changes. |
| UI/UX | Vessel rows now read clearly: "Vessel · 2 × ₹2,000 = ₹4,000" instead of fake "PMS Score 4000". |
| Regression | Very low. Branch is gated on `vessel_program_detected` (false for all non-vessel programs). |
| Mitigation | Two new Vitest fixtures lock both branches. |

### Files Touched
- `src/components/incentive/IncentiveDryRunDialog.tsx`
- `src/components/incentive/__tests__/IncentiveDryRunDialog.test.tsx` (new)
- `DOCUMENTATION.md`, `POLICY.md`, `mem://features/incentive/core-engine-specifications`

### Out of Scope
- Renaming the column header (kept as "PMS Score" to avoid breaking non-vessel users' muscle memory; tooltip clarifies vessel semantics).
- Hiding columns entirely for vessel programs (would jitter the table when mixed-mode programs are added later).
- Any change to the compute engine — already correct.
