# Plan — Re-anchor Bi-Monthly KPIs for CPP / DRI

## What you asked for
1. **June 2026** — every "June-July" Bi-Monthly KPI becomes **Monthly / June only**.
2. **July 2026 onward** — every "June-July" Bi-Monthly KPI is re-anchored to **"Jul-Aug"**.
3. Applies to **CPP + DRI employees only**, and only to the *June 2026 row* / *anchor field* — existing submissions are preserved.

## Reality check from the database
The DB does **not** currently contain the shape you described. Findings from `kpis` today:

| Period | Anchor `frequency_cycle_start` | KPIs | Employees |
|---|---|---|---|
| **June 2026** | `NULL` | 35 | 14 |
| **June 2026** | `Feb-Mar` | 44 | 19 |
| **July 2026** | `Jul-Aug` | 34 | 14 |
| **July 2026** | `Feb-Mar` | 44 | 19 |
| **July 2026** | `May-Jun` | 1 | 1 |
| **July 2026** | `NULL` | 1 | 1 |

- There is **no** row anywhere with `frequency_cycle_start = 'Jun-Jul'`.
- The 14 employees with NULL-anchor June rows are all **45 MW** (power plant), not CPP/DRI.
- The `departments` table *has* rows named "CPP" and "DRI" but **0 profiles are linked to them**, and `kpis.business_unit_id` / `kpis.division_id` are always NULL — so there's no reliable programmatic way to auto-scope to "CPP + DRI" employees.

Because of this, running a blanket UPDATE would either hit the wrong people or hit nobody. The safe path is a **preview → confirm → apply** flow.

## Proposed approach — reversible, two-step admin utility

### Step A — Preview report (read-only)
Build a lightweight admin screen (or a downloadable CSV) that lists **every Bi-Monthly KPI for June 2026 and July 2026**, showing:

- Employee code, name, department
- KPI name, KRA, weightage
- Current `frequency`, `frequency_cycle_start`
- Whether a submission already exists (self / manager / final) — for information only, no blocking
- A tickbox column per employee

You review the list, tick the CPP + DRI employees, and confirm the selection. This produces an explicit `employee_id[]` — no guesswork.

### Step B — Apply changes (single admin action)
For the confirmed employee set, run two scoped UPDATEs inside one transaction with a full audit row per KPI written to `kpi_audit_logs`:

1. **June 2026 rows** (`review_period='June' AND review_year=2026 AND frequency='Bi-Monthly'`)
   → `frequency='Monthly'`, `frequency_cycle_start=NULL`, `sub_frequency=NULL`
2. **July 2026 rows** (`review_period='July' AND review_year=2026 AND frequency='Bi-Monthly'`)
   → `frequency_cycle_start='Jul-Aug'` (frequency unchanged)

Submissions in `review_submissions` are **not touched** (per your answer). Auto-rollover (ADR-088) will then carry the Jul-Aug anchor forward into future months automatically because it preserves the source anchor.

### Step C — Rollback
The audit rows written in Step B record the previous `frequency` and `frequency_cycle_start` per KPI, so a single "Revert last re-anchor batch" action can undo everything if needed.

## Risk & Impact
- **Data**: Only two columns on `public.kpis` change; every change is audited. No schema change, no submission deletion, no cascade.
- **Workflow**: June KPIs become month-locked (users can now score/submit in June without the Bi-Monthly cycle lock — POLICY §128). July KPIs stop being "locked in July" because Jul-Aug means July is the active month, matching the intent.
- **UI/UX**: One new admin screen (Admin → Data Repair → "Re-anchor Bi-Monthly KPIs"). No existing screens change.
- **Regression**: Low — `isKpiLockedForPeriod` already honors per-KPI `frequency_cycle_start` (see `reportFrequencyCycleOverride.test.ts`). Reports, journeys, and rollover already read the anchor from the KPI row.
- **Scalability**: Bounded (≤ ~80 KPIs across ~35 employees per the query above); single transaction is fine.
- **Backup**: `kpis` and `kpi_audit_logs` are in the automatic backup set — nothing to add.

## Tests
- Unit test: applying the utility to a fixture with a mix of Bi-Monthly/Monthly and different anchors updates only the intended rows and leaves submissions untouched.
- Unit test: rollback restores prior `frequency` + `frequency_cycle_start`.
- Regression: existing `reportFrequencyCycleOverride.test.ts` continues to pass — June KPIs post-change render un-locked in June, July KPIs render active in July.

## Question before I build
The plan above assumes you want a reusable **admin utility with preview + audit + rollback** rather than a one-shot SQL migration. If you'd rather I just prepare a one-off migration against an employee list you paste, say so and I'll swap Step A/B for a single reviewed SQL migration.
