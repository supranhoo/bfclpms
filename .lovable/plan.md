## Goal

Switch Prorated increment method from `DOJ` to `GDOJ` (`profiles.group_doj`) across logic, UI, run details and Excel export. Rename "Prorated by Date of Joining" → "Prorated by GDOJ" and update all helper/trace strings. No changes to Full, Custom Slabs, slab %, PMS scoring, ineligibility, confirmation adjuster or salary logic.

## Risk & Impact

- **Data**: Reuses existing `profiles.group_doj` column (already in schema). No migration. The DB enum value stays `prorated_doj` (display-only rename).
- **Workflow**: Engine reads `p.group_doj` instead of `p.doj` for the AY-bounded month counter. Employees missing `group_doj` get a clear ineligibility reason instead of silent DOJ fallback.
- **UI/UX**: Label changes only (no layout shift). Cutoff card stays where it is.
- **Regression Risk**: Confirmation-adjuster input (`naiveEligibleMonths`) changes per-employee if `group_doj ≠ doj`. Other paths (general eligibility min-service-months, custom slab) keep using `doj` as before — only the prorated cutoff path moves to GDOJ, matching the user's "do not change Custom Slabs / ineligibility" constraint.
- **Scalability**: Pure in-memory math; one extra column in the `profiles` select. No new query.
- **Rollback**: Revert the edge function + UI files; no schema change.

## UI Changes

Location: **System Settings → Increment → Increment Method** (`IncrementMethodSection.tsx`).

```text
Before:  ○ Prorated by Date of Joining
         "Eligible % = (Configured Increment % ÷ 12) × Months Served in the assessment year."

After:   ○ Prorated by GDOJ
         "Eligible % = (Configured Slab Increment % ÷ 12) × Months Served in the AY,
          counted from GDOJ (or AY start if GDOJ is before it)."
```

Cutoff card helper text rewritten to:
> "If GDOJ falls before this day, the GDOJ month is counted. If GDOJ falls on or after this day, the GDOJ month is excluded. Applies to Prorated by GDOJ."

Location: **Calculate Increment % → Run Details** (`IncrementInputs.tsx`) and Excel export.
- `METHOD` column: `Prorated by GDOJ · X/12 · (GDOJ month included|excluded|GDOJ before AY|GDOJ after AY)`.
- New ineligibility reason when `group_doj` is null: `"GDOJ missing for prorated increment calculation"`.

## Implementation

### 1. `supabase/functions/compute-increment/index.ts`
- Add `group_doj` to both `profiles` select lists (lines ~450–451).
- Rename helper `monthsServedInAY` JSDoc to reference GDOJ; signature unchanged.
- Replace `p.doj` with `p.group_doj` **only** in the prorated AY-month block:
  - `const gdoj = p.group_doj ? new Date(p.group_doj) : null;`
  - `ayMonths = gdoj ? monthsServedInAY(gdoj, cutoffDayGlobal, ayStartGlobal, ayEndGlobal, validationDate) : null;`
- Leave `monthsServed` (continuous), min-service-months gate, and custom-slab matching on existing `p.doj` (per user constraint to not change ineligibility / custom slabs).
- For `method === 'prorated_doj'`:
  - If `!gdoj` → push ineligibility reason `"GDOJ missing for prorated increment calculation"` and skip prorated math.
  - Else compute `monthsForMethod = ayMonths.months`, `eligible% = (slab% / 12) × monthsForMethod`.
  - Build `proratedNote`:
    - `included` → `GDOJ month included`
    - `excluded` → `GDOJ month excluded (cutoff ${cutoffDayGlobal})`
    - `pre_ay`   → `GDOJ before AY — counted from AY start`
    - `after_ay` → `GDOJ after AY — 0 months`
  - Method column string: `Prorated by GDOJ · ${m}/12 · ${proratedNote}`.
- `inputs_snapshot` gains `group_doj` and `cutoff_decision` (rename existing `cutoff_decision` value unchanged).
- Excel export uses the same `method` string already — no separate change needed.

### 2. `src/components/admin/scoring/IncrementMethodSection.tsx`
- `METHOD_OPTIONS` label: `Prorated by GDOJ`; description updated per spec.
- Cutoff card helper text: replace DOJ wording with GDOJ wording above.
- Remove the second DOJ reference in the long descriptive paragraph (lines 187–190).

### 3. `src/hooks/useIncrementMethod.ts`
- No schema change. Update JSDoc comment on `joining_month_cutoff_day` to say "GDOJ" instead of "DOJ". Enum value `prorated_doj` retained for backward compatibility (display-only rename).

### 4. `src/lib/incrementMethodApplier.ts`
- Update JSDoc + `notes` string: `Prorated by GDOJ: ${basePercent}% × ${months}/12`. No behavioural change.

### 5. Tests
- Extend `supabase/functions/compute-increment/joining_month_cutoff_test.ts`: rename test descriptions to GDOJ wording (no logic change to the pure helper — it already takes a generic `doj: Date`).
- Add new `src/test/incrementProratedGdoj.test.ts`:
  - Employee with `group_doj = 2025-01-10` and AY 2025–26 → months = 12 (pre-AY).
  - `group_doj = 2025-07-14`, cutoff 15 → 9 months, note "GDOJ month included".
  - `group_doj = 2025-07-15`, cutoff 15 → 8 months, note "GDOJ month excluded".
  - `group_doj = 2026-07-01` → 0 months, "GDOJ after AY".
  - `group_doj = null`, method = prorated → ineligible with reason `"GDOJ missing for prorated increment calculation"`.
- Existing Full / Custom slab tests stay green (untouched code paths).

### 6. Docs (SSOT)
- `DOCUMENTATION.md`: rename section "Prorated by DOJ" → "Prorated by GDOJ"; update formula and cutoff explanation; add "Field used: `profiles.group_doj`".
- `POLICY.md`: replace DOJ wording in the prorated policy bullet with GDOJ; add bullet "GDOJ missing ⇒ prorated calculation skipped with explicit reason".
- Version History entry: "Prorated method now uses GDOJ (`group_doj`) instead of DOJ; cutoff logic unchanged."

## Acceptance

- UI shows "Prorated by GDOJ" everywhere; cutoff helper references GDOJ only.
- Engine reads `profiles.group_doj` for prorated AY-month math; missing GDOJ surfaces explicit reason.
- `Months Served` is whole-number, AY-bounded, cutoff-aware.
- `GDOJ < AY start` → counted from AY start.
- `GDOJ day ≥ cutoff` → GDOJ month excluded.
- `GDOJ > AY end` → 0 months.
- Method column + Excel export both read `Prorated by GDOJ · X/12 · <decision>`.
- Full Increment, Custom Slabs, ineligibility, confirmation adjuster, salary logic untouched.
- All new + existing tests pass.
