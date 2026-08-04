# Incentive discrepancy — Saibal Kunar / Metal Sizing / June 1-10

## What the data shows (verified, not assumed)

| Fact | Verified value |
|---|---|
| Current June 1-10 total | 194.0 tons x Rs.503.39 = **Rs.97,657.66** (matches the Rs.97,658 on screen) |
| Claimed earlier total | Rs.183,485.66 = exactly **364.5 tons** |
| Gap | **170.5 tons** of day 1-10 production, i.e. Rs.85,827.66 |
| Rate | Rs.503.39/ton was correct for June (next revision effective 01-Jul-2026) — rate is **not** the cause |
| Roster | 69 employees mapped for June; only **17** have any day 1-10 value; 34 have day 11-20; 28 have day 21-31 |
| Day 1-10 keys | For the other 52 employees the day 1-10 keys are **absent entirely** from `daily_values`, not zero |
| Write history | All 69 June rows were written by **one single save at 17-Jun-2026 10:02 UTC** and never edited again |

So the money is not lost in the calculation — the underlying day 1-10 production data itself is missing for 52 employees, and it disappeared at that single 17-Jun save.

## Root cause (5 Why)

1. Why is the June 1-10 payout Rs.97,658 instead of Rs.183,485.66? Only 194 of 364.5 tons exist in the day 1-10 data.
2. Why is the production missing? 52 of the 69 mapped employees have no day 1-10 keys at all.
3. Why are the keys gone? The whole June row for every employee was rewritten in one grid save on 17-Jun; that save writes the **entire** `daily_values` object per employee, replacing whatever was in the database (`handleSave` in the Production Daily Grid sends `daily_values: localData[emp.id] || {}`).
4. Why did the grid hold no day 1-10 values for those 52 employees? The grid seeded itself from a read of `production_daily_entries` that was **not paginated at that date** — Metal Sizing June is ~2,412 rows, so PostgREST capped it at 1,000 and the remaining employees seeded as empty. (The same unpaginated-read defect was found and fixed for the compute function on 25-Jun as ADR-094; the grid read was on the same unfixed path on 17-Jun.)
5. Why did nothing stop it? The save is a blind whole-object replace: no merge, no "this save removes previously stored days" guard, and no history table for daily entries — so a destructive overwrite is silent and unrecoverable.

Recovery note: the oldest retained backup is **05-Jul-2026**, after the 17-Jun overwrite, so the lost tonnage cannot be restored from backup. Your downloaded Excel and the raised invoice are the only surviving record of the correct day 1-10 figures.

## Corrective actions

### 1. Restore the correct June 1-10 data (needs the Excel)
Import the day 1-10 tonnage from the Excel downloaded at invoice time via an admin, audited backfill: write only days 1-10 for the affected employees, leave days 11-31 untouched, then recompute June 1-10 for Saibal Kunar and confirm the total lands on Rs.183,485.66 against the invoice. Every restored cell is logged with source file name, reason and admin.

### 2. Stop the overwrite from ever happening again (preventive)
- **Non-destructive save**: the grid save becomes a per-day merge — a day key is written only if the operator actually has that day loaded/edited. Days outside the loaded window can no longer be erased by omission.
- **Shrink guard**: before saving, if a row would lose previously stored days or drop total tonnage, the save is blocked and the operator sees exactly which employees/days would be lost, with an explicit confirm required.
- **Paginated seed, verified**: the grid's entry read is asserted paginated (same contract as ADR-094) and the save button stays disabled until the full snapshot has loaded, so a partial load can never become a full write.
- **History**: add a `production_daily_entries_history` audit trail (before/after `daily_values`, who, when) so any future loss is provable and reversible without depending on backups.
- **Regression tests**: merge-not-replace, shrink-guard blocking, save-disabled-while-loading, paginated seed.

### 3. Detection
An "Incentive data integrity" check that flags any program/month where a period's employee coverage drops sharply versus adjacent periods or the prior month (June 1-10: 17 employees vs 34 for 11-20 — this case would have been flagged the same day).

## Governance
- New **ADR-245 — Production daily entry non-destructive writes**, and **POLICY §INC-DAILY-ENTRY-NO-SILENT-LOSS** (whole-object replacement of production data is prohibited; saves must merge, guard against shrink, and be audited).
- DOCUMENTATION.md version history updated.

## Technical summary
- `src/components/incentive/ProductionDailyGrid.tsx` — merge-based `handleSave`, shrink-guard dialog, save disabled until snapshot loaded.
- `src/hooks/useProductionDailyEntries.ts` — merge-aware mutation calling a new SECURITY DEFINER RPC `upsert_production_daily_values(p_rows, p_days)` that merges the given day keys into existing JSONB instead of replacing it.
- New migration: history table + trigger, RLS (admin/service_role only), GRANTs, plus `admin_restore_production_daily_values(p_rows, p_reason)` for the June repair.
- New coverage-drop diagnostic in the incentive admin area.
- Tests under `src/test/incentive/`.

## What is needed from you
The Excel downloaded at invoice time (Saibal Kunar / Metal Sizing / June 1-10) so the restore uses your figures rather than any reconstruction.