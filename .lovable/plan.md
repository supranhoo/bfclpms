
## Goal

Make the **"Prorated by Date of Joining"** increment method honor a configurable **Joining Month Cutoff Day** (per Assessment Year + Company scope), and count months served strictly **within the assessment year** — including or excluding the joining month based on the cutoff. Surface the decision in run details and Excel export.

No change to Full Increment, Custom Slabs, PMS scoring, ineligibility, slab matching, or confirmation adjustment.

---

## Risk & Impact Report

- **Data**: Adds one nullable column `joining_month_cutoff_day SMALLINT` to `increment_method_configs`. Existing rows = NULL → engine defaults to 15. Additive, reversible.
- **Workflow**: Only the `prorated_doj` branch of `applyMethod` changes. Other methods untouched.
- **UI**: One numeric field appears under the Prorated by DOJ radio card only when selected.
- **Regression**: Today `monthsServed` is computed continuously from DOJ to validationDate (not AY-bounded). New behavior is **opt-in** for `prorated_doj` only and replaces the months value passed to the method engine for that branch only. `service_months` audit column keeps the existing continuous figure for compatibility.
- **Historical runs**: Not recomputed.
- **Scalability**: Pure in-memory per-employee arithmetic; no extra queries.
- **Rollback**: Drop column + revert files.

---

## Plan

### 1. Migration — `increment_method_configs`
- `ALTER TABLE public.increment_method_configs ADD COLUMN joining_month_cutoff_day SMALLINT;`
- `CHECK (joining_month_cutoff_day IS NULL OR (joining_month_cutoff_day BETWEEN 1 AND 31))`.
- Comment: "Day-of-month cutoff for counting the DOJ month under prorated_doj. NULL = system default (15)."

### 2. Hook — `src/hooks/useIncrementMethod.ts`
- Add `joining_month_cutoff_day: number | null` to `IncrementMethodConfigRow`.
- `useSaveIncrementMethod` accepts `joiningMonthCutoffDay: number | null` and inserts it; only persists a value when `method === 'prorated_doj'` (else NULL).
- `useCopyIncrementMethodFromYear` carries the source row's cutoff value.

### 3. UI — `src/components/admin/scoring/IncrementMethodSection.tsx`
- New local state `cutoffDay` (default 15) hydrated from config.
- Render a numeric `Input` (min=1, max=31) labelled **"Joining Month Cutoff Day"** with helper text:
  > "If employee joins before this day, joining month is counted. If employee joins on or after this day, joining month is excluded."
- Visible only inside the Prorated by DOJ card and only when `method === 'prorated_doj'`.
- Validation: integer 1–31; block save with inline error otherwise.
- Pass to `save.mutate`.

### 4. Edge function — `supabase/functions/compute-increment/index.ts`
- Add helper `monthsServedInAY(doj, cutoffDay, ayStartDate, ayEndDate, validationDate)`:
  1. If `doj > ayEndDate` → return `{ months: 0, joiningMonthDecision: 'after_ay' }`.
  2. Compute `effectiveStart`:
     - If `doj < ayStartDate` → `effectiveStart = ayStartDate` (cutoff irrelevant; `joiningMonthDecision = 'pre_ay'`).
     - Else: `joiningDay = doj.getDate()`; if `joiningDay < cutoffDay` → include join month (`effectiveStart = first day of doj's month`, `decision = 'included'`); else exclude (`effectiveStart = first day of next month`, `decision = 'excluded'`).
  3. `effectiveEnd = min(validationDate, ayEndDate)`.
  4. Return whole-month count between `effectiveStart` and `effectiveEnd` (`(endY-startY)*12 + (endM-startM) + 1` clamped ≥0 and ≤12). Safe when cutoff > month length because we only compare day numbers.
- Resolve `cutoffDay = resolvedCfg.joining_month_cutoff_day ?? 15`.
- Only when `effectiveMethod === 'prorated_doj'`, replace `monthsForMethod` with the AY-bounded value; keep `service_months` (continuous) untouched.
- Extend `applyMethod` notes for `prorated_doj` to:
  - `"Prorated by DOJ · M/12 · Joining month included due to cutoff day N"` or
  - `"Prorated by DOJ · M/12 · Joining month excluded due to cutoff day N"` or
  - `"Prorated by DOJ · M/12 · DOJ pre-AY"` / `"DOJ after AY"`.
- Persist as `method_used` (existing column), which already flows to UI and Excel.

### 5. UI display & Excel — `src/pages/incentive/IncrementInputs.tsx`
- No structural change; the new richer string flows through the existing **Method** column and the existing Excel `method` field. Verify column width is comfortable; widen header label tooltip if needed.

### 6. Tests
- **`src/lib/incrementMethodApplier.test.ts`** unchanged (pure applier still receives months number).
- **New** `supabase/functions/compute-increment/joining_month_cutoff_test.ts` — pure unit tests for `monthsServedInAY` covering:
  - DOJ 14 Apr (cutoff 15) AY 2025-26 → joining month counted.
  - DOJ 15 Apr → excluded.
  - DOJ 16 Apr → excluded.
  - DOJ 10 Jul 2025 → counted (9 months when validationDate = 31 Mar 2026 capped at 12).
  - DOJ before AY start (1 Jan 2025, AY 2025-26) → full 12.
  - DOJ after AY end (1 Jul 2026, AY 2025-26) → 0.
  - Cutoff day 31 with DOJ in 30-day month → behaves safely (day < 31 ⇒ included).
  - NULL config cutoff → defaults to 15.

### 7. Docs
- `DOCUMENTATION.md`: add the cutoff field to the Increment Method section and describe AY-bounded month counting.
- `POLICY.md`: add policy note "Prorated by DOJ — Joining Month Cutoff (default 15)".
- Memory: add `mem://features/admin/increment-prorated-doj-cutoff`.

---

## UI changes (exact)

**Location**: System Settings → Increment → Increment Method tab → inside the "Prorated by Date of Joining" radio card.

When `prorated_doj` is selected, a new sub-block appears beneath the description:

```text
┌─ Prorated by Date of Joining ────────────────────────────┐
│ Eligible % = (Configured Increment % ÷ 12) × Months …    │
│                                                          │
│   Joining Month Cutoff Day                               │
│   [  15 ]   (1–31)                                       │
│   If employee joins before this day, joining month is    │
│   counted. If employee joins on or after this day,       │
│   joining month is excluded.                             │
└──────────────────────────────────────────────────────────┘
```

**Interaction**: changing the radio away from Prorated by DOJ hides the field; the value is only persisted when the saved method is `prorated_doj`. Responsive: field is a single-column input on mobile, ~140px on desktop.

**Run details** (Increment Inputs → Calculate Increment %): the existing **Method** column now shows e.g. `Prorated by DOJ · 9/12 · Joining month excluded due to cutoff day 15`. Excel export inherits this string from the same field.

---

## Acceptance check

- Admin sees and edits cutoff under Prorated by DOJ only.
- Cutoff persists per AY + Company scope alongside the method version row.
- DOJ-day < cutoff → joining month counted; ≥ cutoff → excluded.
- DOJ before AY → full 12 (subject to validationDate cap); DOJ after AY → 0.
- Default cutoff 15 applies when column is NULL.
- Run details + Excel show method, months, and cutoff decision.
- Full Increment and Custom Slabs paths untouched.

