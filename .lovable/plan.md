
## RCA + Fix: Vessel-based "Port Incentive" Computes ₹0 Despite Saved Vessel Data

### What screenshot 706 vs 707 actually shows
- **Image 707 (data entry):** Swaraj 2 vessels × ₹10,000 = ₹20,000; Manabendra 2 × ₹2,000 = ₹4,000. Saved correctly to `vessel_monthly_entries` (verified: 2 rows for Feb 2026, 4 vessels total).
- **Image 706 (compute preview):** Both employees marked Eligible, but Base 0%, Final 0%, Amount ₹0.

### Verified root cause
The compute engine's vessel logic is gated on the wrong field:

```ts
// Line 246 + 603 + 621 in supabase/functions/compute-monthly-incentives/index.ts
if (program.incentive_base === 'fixed') { /* fetch vessel rates + entries */ }
...
if (program.incentive_base === 'fixed' && vesselRate !== undefined) { /* compute vesselAmount */ }
```

But the live DB has **no program with `incentive_base = 'fixed'`**:

| program_type | incentive_base | count |
|---|---|---|
| production | basic_salary | 2 |
| material_yard_recovery_fines_incentive_ | basic_salary | 2 |
| **support** | **basic_salary** | **2** ← Port Incentive |

So for Port Incentive the engine:
1. Skips the `vesselRateMap`/`vesselEntryMap` fetch entirely (block at line 246 never enters).
2. Falls into the support-program branch (line 626) which computes incentive from `basic_salary × KRA-based slab%`. With no eligibility/salary data, output is ₹0.

The vessel entry path is **completely dead code** in the current data model. Every previous round of fixes missed this because the gating field name (`incentive_base = 'fixed'`) does not match the chosen program shape (`program_type = 'support'` + vessel rates table).

### Why the upstream UI is fine
- `VesselDataEntryGrid` correctly gates on the **presence of `incentive_vessel_rates` rows** for the selected program — not on `incentive_base`. So the entry screen shows employees and saves data correctly.
- The compute engine uses a *different, mismatched* signal. That's the asymmetry.

### Fix (single, targeted, idempotent)

**File: `supabase/functions/compute-monthly-incentives/index.ts`**

Replace the `incentive_base === 'fixed'` gate with a **data-driven** signal: *"this program is vessel-based iff it has any rows in `incentive_vessel_rates`."* This matches exactly what the data-entry UI already does and is robust to whatever `program_type` / `incentive_base` combination an admin chooses.

1. **Line 246**: change
   ```ts
   if (program.incentive_base === 'fixed') {
   ```
   to
   ```ts
   // Vessel-based detection: any program with vessel rates configured
   const { data: vRatesProbe, error: vRatesProbeErr } = await supabase
     .from('incentive_vessel_rates')
     .select('employee_id, rate_per_vessel')
     .eq('program_id', program_id);
   if (vRatesProbeErr) throw new Error(`Vessel rates fetch failed: ${vRatesProbeErr.message}`);
   const isVesselProgram = (vRatesProbe?.length ?? 0) > 0;
   if (isVesselProgram) {
   ```
   (Hoists the rate fetch and reuses its result inside the block; removes the second redundant query.)

2. **Lines 603 & 621**: replace both `program.incentive_base === 'fixed' && vesselRate !== undefined` with `isVesselProgram && vesselRate !== undefined`.

3. **Line 626 branch**: leave the support/KRA path untouched — it remains the correct fallback for non-vessel support programs.

4. **Mandatory error checks (per ADR-044 v3)** added on both vessel queries (rates + monthly entries) so any future schema mismatch surfaces as 500, not as silent ₹0.

### Diagnostics enhancement (low-risk)
Extend the existing diagnostics block (already shown in `IncentiveDryRunDialog`) to include:
- `vessel_program_detected: boolean`
- `employees_with_vessel_rate: number`
- `employees_with_vessel_entries: number`

This makes the next regression of this class instantly visible in the preview dialog instead of silently producing ₹0.

### Regression guard
Add a Deno test in `supabase/functions/compute-monthly-incentives/_test.ts`:
- Seeds a `support` / `basic_salary` program with 2 vessel rates and 2 monthly entries.
- Asserts the returned record's `incentive_amount` equals `vessels × rate` and `incentive_status = 'finalised'`.
- This locks the contract independently of the `incentive_base` field name.

### SSOT sync (per project rule #1)
- **DOCUMENTATION.md** — Version History entry: *"Vessel-based incentive detection switched from `incentive_base='fixed'` to data-driven (presence of `incentive_vessel_rates` rows). Aligns compute engine with data-entry UI."*
- **POLICY.md** — under Incentive Engine Governance: *"A program is vessel-based iff it has rows in `incentive_vessel_rates`. Compute engine MUST NOT rely on `incentive_base` value strings to detect vessel mode."*
- **docs/adr/ADR-044.md** — append v4 note: *"Detection-by-data pattern preferred over enum-string gating to prevent UI/engine drift."*
- **mem://features/incentive/core-engine-specifications** — add the data-driven vessel detection rule.

### Risk & Impact
| Area | Impact |
|---|---|
| Data | None. No schema change. Existing computed records can be re-run; vessel programs will now produce non-zero amounts. |
| Workflow | Port Incentive Feb 2026 will compute ₹24,000 total (₹20,000 + ₹4,000) on next "Compute Now" — matching screenshot 707. January 2026 (20 vessels) will also recompute correctly when re-run. |
| UI/UX | Dry-run preview will now show real Base %, Amount, and `finalised` status for vessel programs. Diagnostics gain 3 new fields. |
| Regression | Very low. The change is a strictly more inclusive detection (data presence) than the prior string match (which matched zero programs in production). Non-vessel programs are unaffected because they have zero `incentive_vessel_rates` rows. |
| Mitigation | New Deno test locks the contract; ADR-044 v4 documents the principle. |

### Files Touched
- `supabase/functions/compute-monthly-incentives/index.ts` (3 small edits + error checks + 3 diagnostic fields)
- `supabase/functions/compute-monthly-incentives/_test.ts` (new vessel-program test)
- `DOCUMENTATION.md`, `POLICY.md`, `docs/adr/ADR-044.md` (sync)
- `mem://features/incentive/core-engine-specifications` (sync)

### Out of Scope
- Reworking the `incentive_base` enum or `program_type` taxonomy (no business need; data-driven detection makes them irrelevant for vessel mode).
- UI changes to `VesselDataEntryGrid` (already correct).
- Touching the production / support / material-yard branches (all unrelated to this defect).
