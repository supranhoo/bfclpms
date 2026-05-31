## RCA

DB confirms the saved draft for Ramendra's "Accuracy of Dispatch Documentation" KPI (Apr 2026):

```
auditor_score = 0      auditor_rating = red ("R0"/"Yes")     auditor_remarks = "Test"
auditor_achieved_value = NULL          ← should be 0 ("Yes")
achieved_value = 5  (employee's "No")
```

Two co-operating bugs in `src/components/review/AuditScorecard.tsx`:

**Bug 1 — Save path corrupts qualitative value (line 603-605)**
```ts
auditor_achieved_value: typeof auditorAchievedValue === 'number'
  ? auditorAchievedValue
  : auditorAchievedValue ? parseFloat(auditorAchievedValue) : null,
```
For binary/tiered KPIs `auditorAchievedValue` is a label string (`"Yes"` / `"No"`). `parseFloat("Yes")` → `NaN`, which Postgres stores as NULL. So the auditor's selection is lost the moment the draft is saved.

**Bug 2 — Reopen falls back to employee value (line 403)**
```ts
const auditorAchieved = (existing as any)?.auditor_achieved_value ?? existing?.achieved_value ?? null;
```
When `auditor_achieved_value` is NULL but a draft does exist (`auditor_score` / `auditor_rating` populated), this silently inherits the **employee's** achieved value (`"No"`), so the binary tile renders "No" highlighted and the bottom "Selected" panel echoes "No / Score 5 – Outstanding" — even though `auditorScore` state is 0.

Net effect matches the screenshot: Review Journey tile (which reads `auditor_score`/`auditor_rating` directly) correctly shows Rating 0 + "Test"; the editor tile (which reads `auditorAchievedValue`) shows the wrong Yes/No selection.

## Risk & Impact

- **Data**: No schema change. One-time backfill is OPTIONAL — existing rows with `auditor_score IS NOT NULL AND auditor_achieved_value IS NULL` can be repaired by deriving from `auditor_rating` + KPI's `qualitative_options`. Recommend additive backfill migration scoped to qualitative KPIs only (`uom_type IN ('binary','tiered')`).
- **Workflow**: None — drafts already in `audit` status remain editable; the fix only changes what gets stored / re-hydrated.
- **UI**: Only the Audit Review sheet binary/tiered tile + "Selected:" summary. No layout change. Numeric KPIs unaffected.
- **Regression**: Same shape exists in `ManagerScorecard` and `ManagementScorecard` save+reopen paths — flagged but **out of scope** for this fix unless you confirm. We will only touch Auditor here.
- **Mitigation**: Add unit tests for both the save-time mapper and the reopen hydrator.

## Plan

1. **Extract a small helper** `src/lib/qualitativeUom.ts` (already houses `BINARY_OPTIONS`):
   - `labelToRating(label, qualitativeOptions, uomType): number | null`
   - `ratingToLabel(rating, qualitativeOptions, uomType): string | null`

2. **`src/components/review/AuditScorecard.tsx`**

   a. **Save path** (lines 596-607 in `executeAuditSubmit`): replace the `parseFloat` line. For qualitative KPIs convert label → rating via `labelToRating`; for numeric keep the existing number/parseFloat behavior; never write `NaN`.

   ```ts
   const isQualitative = ['binary','tiered'].includes((selectedKpi as any).uom_type);
   const auditorAchievedToSave = isQualitative
     ? labelToRating(auditorAchievedValue, selectedKpi.qualitative_options, selectedKpi.uom_type)
     : (typeof auditorAchievedValue === 'number'
         ? auditorAchievedValue
         : auditorAchievedValue ? (Number.isFinite(parseFloat(auditorAchievedValue)) ? parseFloat(auditorAchievedValue) : null) : null);
   ```

   b. **Reopen path** (`openReviewSheet`, ~line 400-435):
      - A draft is considered to exist when `existing.auditor_score != null` OR `existing.auditor_rating != null` OR `existing.auditor_remarks` is non-empty.
      - When a draft exists: prefer `existing.auditor_achieved_value`; if that's NULL on a qualitative KPI, derive the label/rating from `existing.auditor_rating` via the KPI's `qualitative_options` (or `BINARY_OPTIONS`). Do NOT fall back to the employee's `achieved_value`.
      - When no draft exists: keep the current fallback to the employee value (preserves the "fresh review pre-filled with employee data" UX).
      - Also pass the resolved value through to `setAuditorAchievedValue` as the right shape (string label for qualitative, number for numeric) so `AchievedValueScoreInput` highlights the correct tile.

3. **DOCUMENTATION.md** — add entry under "Version History" + "Audit Review Editor" describing draft hydration contract and the qualitative label↔rating mapping.

4. **POLICY.md** — clarify in the Auditor section: "Auditor draft persistence: `auditor_achieved_value` is the canonical numeric rating; the UI label is derived. Re-opening a draft never inherits the employee's value when an auditor draft exists."

5. **Tests**
   - `src/lib/qualitativeUom.test.ts` — round-trip `labelToRating` / `ratingToLabel` for binary (Yes↔0, No↔5) and a sample tiered scale.
   - `src/components/review/__tests__/AuditScorecard.draftHydration.test.ts` — given `auditor_score=0, auditor_rating='red', auditor_achieved_value=null, achieved_value=5` on a binary KPI, `openReviewSheet` produces `auditorAchievedValue="Yes"`, `auditorScore=0`, `auditorRemarks="Test"`. Second test: numeric KPI fallback to employee value still works when no draft exists.
   - `AuditScorecard.draftSave.test.ts` — saving with `auditorAchievedValue="Yes"` on a binary KPI calls the mutation with `auditor_achieved_value: 0` (not NaN, not null).

6. **One-time backfill migration (additive, scoped)**
   ```sql
   -- Repair drafts where qualitative auditor value was lost
   UPDATE review_submissions rs
   SET auditor_achieved_value = CASE rs.auditor_rating
       WHEN 'red'        THEN 0
       WHEN 'orange'     THEN 1
       WHEN 'pale-amber' THEN 2
       WHEN 'amber'      THEN 3
       WHEN 'yellow'     THEN 4
       WHEN 'green'      THEN 5
   END
   FROM kpis k
   WHERE rs.kpi_id = k.id
     AND k.uom_type IN ('binary','tiered')
     AND rs.auditor_achieved_value IS NULL
     AND rs.auditor_rating IS NOT NULL;
   ```
   (Exact rating-string mapping confirmed against `scoreToRating` before running.) Reversible: no destructive change to other columns.

## Out of scope (flagged)

- Identical save/reopen pattern in `ManagerScorecard.tsx` and `ManagementScorecard.tsx` — same fix should be applied there. Confirm if you want it in this change or as a follow-up.
- No change to Review Journey tile, mutation status transitions, or governance/lock behavior.
