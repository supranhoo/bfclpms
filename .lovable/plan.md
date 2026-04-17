

Let me explore the current Production Rates implementation to understand scope.
<lov-tool-use id="toolu_vrtx_01PGS6HgigVA8wG8UKGKQ16b" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/incentive/ProductionRatesTab.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01WPnLvbF3m1vqUzkwydBE3P" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/incentive/ProductionRatesTab.tsx\"}">
</lov-tool-use>
Now I have enough context. Let me check the schema and compute engine briefly to confirm the effective_from logic.
<lov-tool-use id="toolu_vrtx_013H9HMfPrvwnwWXaFf2qdki" name="code--exec" integration-id="code" data="{\"command\": \"psql -c \\\"\\\\d incentive_production_rates\\\" 2>&1 | head -40\", \"user_facing_description\": \"Checking production rates table schema\"}">
</lov-tool-use>
<lov-plan>

## Plan: Add "With Effect From" + Confirm Company Scope Across All Programs

### Current State
- Production Rates tab already supports **Company** scope (added previously) — works for **all programs** that use the Production Rates tab.
- Missing: an **effective-from date** per rate row. Today rates are "current only" — changing a rate silently overwrites history.

### What changes

**1. Database** (`incentive_production_rates`)
- Add column `effective_from DATE NOT NULL DEFAULT CURRENT_DATE`.
- Drop old unique constraint `(program_id, rate_type, employee_id, entity_id)` and replace with `(program_id, rate_type, employee_id, entity_id, effective_from)` so the same scope can have multiple dated entries (rate history).
- Backfill existing rows with `effective_from = created_at::date`.

**2. UI — `ProductionRatesTab.tsx`**
- Add **"With Effect From"** date picker (shadcn Calendar in Popover) in the Add form, defaulting to 1st of current month.
- New column **"Effective From"** in the table (formatted `dd MMM yyyy`).
- Sort rows by `(rate_type, entity, effective_from DESC)` so latest rate per scope sits on top, older history below greyed out.
- Edit row also exposes the date.
- Remove the "available entity" filter so the same employee/dept/BU/company can have multiple dated entries — instead, prevent only **exact-date duplicates** for the same scope.

**3. Hook — `useProductionDailyEntries.ts`**
- Extend `useUpsertProductionRate` payload type with `effective_from?: string`.
- Pass through to insert/update.

**4. Compute Engine — `compute-monthly-incentives/index.ts`**
- For each employee, given the computation `month/year`, build a target date = last day of that month.
- For each tier (employee → dept → BU → company → common), pick the rate row with the **greatest `effective_from <= target date`** instead of just `find()`.
- This makes rate changes historically accurate: April compute uses April-effective rate; May compute uses May-effective rate even after recompute.

**5. Applies to all programs (existing + new)**
- Schema change is table-level → applies to every program automatically.
- UI tab is shared by all program types that have a Production Rate (per-ton) configuration.
- Existing rows get `effective_from = created_at` so all historical compute keeps working unchanged.

### UI Mock

```text
┌─ Production Rates (Per Ton) ────────────────── [+ Add Rate] ─┐
│  ○ Employee  ○ Department  ○ BU  ● Company  ○ Common         │
│                                                              │
│  [Select company ▾] [Rate/Ton] [📅 With Effect From: 01 Apr 2026] [Remarks] [Add] [X]
│                                                              │
│  Type    │ Applies To       │ Rate/Ton │ Effective From │ Remarks │ ⚙
│  Company │ BFCL             │ ₹500.00  │ 01 May 2026   │ revised │ ✏ 🗑
│  Company │ BFCL             │ ₹478.35  │ 01 Apr 2026   │ initial │ ✏ 🗑  (greyed — superseded)
│  Company │ Saibal Kunar     │ ₹500.00  │ 01 Apr 2026   │ —       │ ✏ 🗑
│  Common  │ All Employees    │ ₹450.00  │ 01 Apr 2026   │ —       │ ✏ 🗑
└──────────────────────────────────────────────────────────────┘
```

### Files Touched

| File | Change |
|---|---|
| `supabase/migrations/...` (new) | Add `effective_from` col + backfill + new unique index |
| `src/components/incentive/ProductionRatesTab.tsx` | Date picker, new column, supersede-aware listing, drop strict availability filter |
| `src/hooks/useProductionDailyEntries.ts` | Extend upsert/insert payload with `effective_from` |
| `supabase/functions/compute-monthly-incentives/index.ts` | Date-aware rate selection per tier |
| `DOCUMENTATION.md` / `POLICY.md` | v2.66.x — Effective-dated production rates, cascade priority unchanged but now date-filtered |

### Risk & Impact

| Area | Impact |
|---|---|
| Data | Additive column with safe backfill (`created_at::date`); existing compute results unchanged |
| Workflow | None — defaults preserve current behaviour |
| Compute | Now selects most-recent-effective rate ≤ period end — matches accounting expectations |
| Regression | Low — old single-row-per-scope rows still resolve correctly under new logic |
| Mitigation | Migration backfills before swapping the unique constraint; recompute any open month after rollout |

### Out of Scope
- "Effective to" / explicit end-date (handled implicitly by the next dated row)
- Bulk import of rates with effective dates

