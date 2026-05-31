## RCA — Why A and B disagree

Confirmed against DB for Ramendra Lal Roy → Apr 2026 → "Accuracy of Dispatch Documentation":

```
uom_type             = binary
qualitative_options  = [{label:"Yes", rating:0}, {label:"No", rating:5}]   ← INVERTED (safety KPI)
auditor_score        = 0.00       auditor_rating = red       auditor_remarks = "Test03"
auditor_achieved_value = NULL     achieved_value (employee) = 5.00 ("No")
```

What the two regions render:

- **A (Review Journey tile)** is driven directly by `review_submissions.auditor_score` → shows **Rating 0 + "Test03"**. Correct, matches the saved draft.
- **B (Auditor Score picker + "Selected" card)** is driven by the React state `auditorAchievedValue`. On reopen this state was being populated from `auditor_achieved_value`. Because that column is `NULL` (legacy NaN bug from the `parseFloat("Yes")` save path), the previous logic resolved it through the picker's `qualitative_options`, but the resolution path is fragile — when any of the two fall back to default `BINARY_OPTIONS` instead of the KPI's inverted options, the label is mapped against the wrong table and "Yes/0" becomes "No/5" (or vice versa).

There are now **two independent sources of truth for the same selection** (`auditor_score` and `auditor_achieved_value`) and the screen renders them in two different widgets. Whenever they diverge — legacy NULL, mid-save error, future schema drift — A and B disagree.

Same shape exists in `ManagerScorecard.tsx` and `ManagementScorecard.tsx`.

## Risk & Impact

- **Data**: No destructive change. One additive backfill: for qualitative KPIs where `auditor_achieved_value IS NULL AND auditor_score IS NOT NULL`, set `auditor_achieved_value = auditor_score`. Same backfill repeated for `manager_*` and `management_*` columns. Reversible.
- **Workflow**: None. Drafts in `audit`, `manager_check`, `management_check` remain editable; only what is hydrated into the picker changes.
- **UI**: Audit / Manager / Management Assessment cards only. Numeric KPIs untouched (the change is gated on `uom_type IN ('binary','tiered')`).
- **Regression risk**: Low — fix narrows behaviour (single source of truth), it does not add new branches. Covered by unit + integration tests.
- **Scalability**: O(1) per KPI render; no extra queries.
- **Rollback**: Pure code revert + the backfill is idempotent and reversible (`UPDATE … SET auditor_achieved_value = NULL WHERE …` if ever needed).

## Plan

### 1. Single source of truth on reopen — `score` wins for qualitative KPIs

`src/components/review/AuditScorecard.tsx` → `openReviewSheet` (~lines 401-475)

For qualitative KPIs (`uom_type in {binary, tiered}`), when an auditor draft exists:

```ts
const isQualitative = uomType === 'binary' || uomType === 'tiered';
const hasAuditorDraft =
  existing?.auditor_score != null ||
  existing?.auditor_rating != null ||
  (typeof existing?.auditor_remarks === 'string' && existing.auditor_remarks.trim() !== '') ||
  existing?.auditor_achieved_value != null;

let auditorAchieved: number | string | null = null;
if (hasAuditorDraft) {
  if (isQualitative) {
    // Canonical = auditor_score, resolved against THIS kpi's qualitative_options.
    // Ignore auditor_achieved_value entirely (legacy NaN / NULL drift).
    const numeric = existing?.auditor_score != null
      ? Number(existing.auditor_score)
      : (existing?.auditor_achieved_value != null ? Number(existing.auditor_achieved_value) : null);
    auditorAchieved = getQualitativeAchievedLabel(numeric, uomType, qualOpts) ?? null;
  } else {
    auditorAchieved = existing?.auditor_achieved_value ?? existing?.auditor_score ?? null;
  }
} else if (isQualitative) {
  auditorAchieved = getQualitativeAchievedLabel(existing?.achieved_value ?? null, uomType, qualOpts) ?? null;
} else {
  auditorAchieved = existing?.achieved_value ?? null;
}
```

Effect: for the screenshot row, `numeric = 0`, `qualOpts = [{Yes,0},{No,5}]` → label `"Yes"`. Tile and Selected panel both show **Yes / R0 / Test03** — identical to A.

### 2. Save path — keep score + achieved value perfectly in sync

`src/components/review/AuditScorecard.tsx` → `executeAuditSubmit` (~lines 620-660)

For qualitative KPIs, derive `auditor_achieved_value` from the label using the **KPI's own** `qualitative_options` (not default `BINARY_OPTIONS`), and only persist when both numbers agree with the in-state `auditorScore` (defensive — prevents NaN ever being written again):

```ts
let auditorAchievedToSave: number | null;
let auditorScoreToSave: number | null = auditorScore;
if (isQualitative) {
  const r = labelToRating(auditorAchievedValue, uomType, qualOpts);
  auditorAchievedToSave = r;
  if (r !== null) auditorScoreToSave = r; // canonicalise — picker label wins
}
// numeric branches unchanged
```

This guarantees `auditor_score === auditor_achieved_value` after every save for qualitative KPIs. A and B can no longer drift even if either column is read by an older client.

### 3. Defensive render-time fallback

`src/components/review/AchievedValueScoreInput.tsx` (lines 177-186)

When `achievedValue` is a numeric-looking **string** (`"0"`, `"5.00"`), also resolve via `o.rating === parseFloat(value)` before giving up. Keeps the picker correct even if a stale write produced `"0.00"`.

### 4. Replicate fix in Manager and Management scorecards

Apply the same two changes (reopen + save) to:
- `src/components/review/ManagerScorecard.tsx`
- `src/components/review/ManagementScorecard.tsx`

Bug exists identically there; user just hasn't hit it yet.

### 5. One-time backfill migration (additive, reversible)

```sql
-- Repair qualitative drafts where the achieved value was lost (NaN bug)
UPDATE review_submissions rs
SET auditor_achieved_value = rs.auditor_score
FROM kpis k
WHERE rs.kpi_id = k.id
  AND k.uom_type IN ('binary','tiered')
  AND rs.auditor_achieved_value IS NULL
  AND rs.auditor_score IS NOT NULL;

UPDATE review_submissions rs
SET manager_achieved_value = rs.manager_score
FROM kpis k
WHERE rs.kpi_id = k.id
  AND k.uom_type IN ('binary','tiered')
  AND rs.manager_achieved_value IS NULL
  AND rs.manager_score IS NOT NULL;

UPDATE review_submissions rs
SET management_achieved_value = rs.management_score
FROM kpis k
WHERE rs.kpi_id = k.id
  AND k.uom_type IN ('binary','tiered')
  AND rs.management_achieved_value IS NULL
  AND rs.management_score IS NOT NULL;
```

(Skipped or no-op on any column the schema doesn't have — verified `manager_achieved_value` / `management_achieved_value` exist before running.)

### 6. Tests

- `src/test/auditorDraftHydration.test.ts` — extend with the **inverted-binary scenario** the user hit: `auditor_score=0`, `auditor_achieved_value=NULL`, `qualitative_options=[{Yes,0},{No,5}]` ⇒ hydrated label === `"Yes"`, picker selection === `"Yes"`, "Selected" card shows `Score: 0`.
- New `src/test/auditorDraftHydration.test.ts` cases for:
  - Tiered KPI with custom ratings (e.g. Partial=3).
  - Save path: `auditorAchievedValue="No"` on inverted binary writes `auditor_score=5` AND `auditor_achieved_value=5`.
  - Render-time numeric-string fallback in `AchievedValueScoreInput`.
- Mirror tests for `ManagerScorecard` / `ManagementScorecard`.

### 7. Docs & policy

- `DOCUMENTATION.md` → Version History entry: "Auditor / Manager / Management draft reopen now derives qualitative picker selection from `*_score` (canonical) via the KPI's own `qualitative_options`. Save path canonicalises both columns to the same number."
- `POLICY.md` → Reviewer draft persistence rule: "For binary/tiered KPIs the picker label is derived from `*_score`. `*_achieved_value` is always written equal to `*_score` on save. Re-opening a draft never inherits the employee's value when a reviewer draft exists."
- `mem/features/review/auditor-draft-qualitative-hydration` → update to reflect "score is canonical, achieved_value mirrors score".

## Out of scope

- Numeric KPI editing — unchanged.
- N/A flow — unchanged.
- Review Journey tile (A) — already correct, no change.

## Verification steps after build

1. Reopen Ramendra → Apr 2026 → "Accuracy of Dispatch Documentation". Tile shows **Yes / R0** highlighted, Selected card shows **Yes / Score: 0 — Not Achieved**, remarks `"Test03"`. Identical to A.
2. Change selection to "No", Save Draft, reopen → tile shows **No / R5**, A also shows Rating 5.
3. Same flow on a standard (non-inverted) binary KPI and on a tiered 3-tier KPI.
4. Manager and Management drafts on a binary KPI behave identically.
