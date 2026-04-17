
## RCA: Over-aggressive N/A masking in vessel mode

### What's wrong (verified against current code)
The previous fix gated **all** PMS-related columns on a single program-level flag `result.diagnostics?.vessel_program_detected`. So once any program is detected as vessel-based, **every row** in the dialog shows `N/A` for PMS Score, Base %, DQ Reason, LTI, Pro-rata, Final % — regardless of whether that specific employee actually has KRAs/PMS data.

That's why:
- **Swaraj (100327)** — has KRAs, has a real `pms_score` → currently shows `N/A`. Wrong. Should show `4.74`.
- **Manabendra (100386)** — no KRAs, no `pms_score` → correctly shows `N/A`.
- **DQ Reason** — masked for everyone in vessel mode. Wrong. DQ is a per-row eligibility outcome and is meaningful regardless of program type.

The masking decision must be **per-row**, not per-program.

### Correct rule (per-row)
For each record `r` in the preview table:

| Column | Rule |
|---|---|
| **PMS Score** | If `r.pms_score != null` → show numeric. Else → `N/A` (muted). Never fall back to `production_value`. |
| **Base %** | If `r.pms_score != null` → show `r.base_incentive_percent`. Else → `N/A`. |
| **Final %** | Same as Base % (depends on a real PMS score existing). |
| **Pro-rata** | Show whenever `r.proration_factor` is meaningful (not just 1.0); else `—`. Independent of PMS. |
| **DQ Reason** | Always show `r.disqualification_reason` if present, else `—`. Never mask. DQ applies to vessel rows too (e.g., not eligible, no rate configured). |
| **LTI Penalty** | Show whenever `r.lti_penalty_percent` is set; else `—`. Independent of PMS. |
| **Amount** | Always show `r.incentive_amount`. |
| **Vessel badge** | Show next to employee name when the row's `production_value` came from vessel entries (i.e., program is vessel-based AND row has vessel data). Cosmetic only. |

The `vessel_program_detected` diagnostic is still useful for the **header tooltip** ("PMS Score may be N/A for vessel-based employees without KRAs") and the **Vessel badge**, but it must NOT gate cell rendering.

### Fix

**File: `src/components/incentive/IncentiveDryRunDialog.tsx`**

1. Remove the blanket `isVessel ? 'N/A' : ...` ternaries from PMS Score, Base %, DQ, LTI, Pro-rata, Final %.
2. Replace each with a per-row check:
   - PMS Score: `r.pms_score != null ? toNum(r.pms_score).toFixed(2) : <muted N/A>` (drop the `production_value` fallback entirely — that was the original bug source).
   - Base %, Final %: render numeric when `r.pms_score != null`, else `<muted N/A>`.
   - DQ Reason: `r.disqualification_reason || '—'` always.
   - LTI, Pro-rata: render their own values when present, else `—`.
3. Keep the **Vessel badge** but compute it per-row: show only when `isVesselProgram && (r.vessel_count > 0 || r.production_value > 0)`.
4. Keep the header info-tooltip on "PMS Score" — wording updated to: *"Employees without assigned KRAs will show N/A here."*

No backend / engine / schema changes.

### Regression guard
Update `src/components/incentive/__tests__/IncentiveDryRunDialog.test.tsx`:
- **Fixture A** (vessel program, no KRAs): `pms_score=null`, `production_value=4000`, `vessel_count=2` → PMS=N/A, Base=N/A, Final=N/A, DQ=`—`, Amount=`₹4,000`, Vessel badge present.
- **Fixture B** (vessel program, has KRAs): `pms_score=4.74`, `vessel_count=10` → PMS=`4.74`, Base=numeric, Final=numeric, Amount=numeric, Vessel badge present.
- **Fixture C** (vessel program, disqualified): `disqualification_reason="No vessel rate configured"`, `pms_score=null` → DQ shown verbatim (not masked), Amount=₹0.
- **Fixture D** (non-vessel program, normal employee): unchanged behavior.

### SSOT sync
- `DOCUMENTATION.md` Version History: *"Dry-run dialog masking moved from per-program to per-row. PMS columns now reflect each employee's actual KRA presence; DQ reasons always shown."*
- `POLICY.md` Incentive Display Rules: *"Per-row rule — Mask PMS-derived columns iff that employee's `pms_score IS NULL`. DQ reason, LTI, pro-rata, and amount are NEVER masked."*
- `mem://features/incentive/core-engine-specifications`: append the per-row display contract.

### Risk & Impact
| Area | Impact |
|---|---|
| Data | None. Display-only. |
| Workflow | None. Compute engine untouched. |
| UI/UX | Vessel rows with KRAs (Swaraj) regain their real PMS/Base/Final values. DQ reasons reappear universally. No layout change. |
| Regression | Very low. Each cell now reads its own field. Four Vitest fixtures lock the matrix. |
| Mitigation | Tests above + the header tooltip clarifies the per-row rule. |

### Files Touched
- `src/components/incentive/IncentiveDryRunDialog.tsx`
- `src/components/incentive/__tests__/IncentiveDryRunDialog.test.tsx` (extend)
- `DOCUMENTATION.md`, `POLICY.md`, `mem://features/incentive/core-engine-specifications`

### Out of Scope
- Engine changes (compute is correct).
- Removing the Vessel badge (it's useful per-row context).
- Renaming columns.
