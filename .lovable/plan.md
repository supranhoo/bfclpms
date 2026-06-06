
## RCA — Why "Saving…" takes forever (updated)

Observed on a 95-employee card:
- Typing in **one row** and clicking the **row-level Save** ⇒ spinner runs for tens of seconds.
- The card-footer "Saving…" pill stays lit just as long.
- User's intuition is correct: **a per-row Save is persisting every row on the card**, not just the row that was edited.

Three compounding root causes — confirmed in code:

### Cause 1 (PRIMARY) — Row Save flushes the entire card payload
`OrgKpiEntryCard.tsx` L578–600:
```text
performSave(scopeId?) {
  ...
  await onSave(getValues());   // <-- getValues() returns ALL 95 scopedValues
}
```
`getValues()` returns the full form state. `handleSaveRow(scopeId)` only updates the **UI spinner** for that row — it does not narrow the payload. So a row-level Save sends the whole card to the server, exactly what you suspected.

The `_touched: true/false` flag is already attached per row at L550, but it is **never read** by the caller — see Cause 2.

### Cause 2 — `_touched` filter computed but ignored in `handleCardSave`
`src/pages/admin/OrgKpiDataEntry.tsx` L772–813 iterates `values.scopedValues` and pushes **every** row into `toSave`, regardless of `_touched`. Combined with Cause 1, one keystroke → 95 rows pushed downstream.

### Cause 3 — `useBulkUpsertOrgKpiValues` is serial N+1
`src/hooks/useOrgKpiValues.ts` L207–347 is "bulk" in name only:
```text
for (const value of values) {
  await select.maybeSingle();           // round-trip 1
  if (existing) await update.single();  // round-trip 2
  else          await insert.maybeSingle();
}
```
95 rows × 2 sequential round-trips × ~80–200 ms ≈ **15–60 s**, matching the "saving forever" UX.

### Cause 4 (minor) — Broad cache invalidation on success
`onSuccess` invalidates the entire `org-kpi-values` key, refetching the whole period and re-rendering 95 rows immediately after save — keeps the screen busy and re-fires the spinner if the user is already typing in the next row.

## Net effect
- 1 keystroke + 1 row Save click  ⇒  full-card payload (95 rows)  ⇒  190 sequential DB round-trips  ⇒  multi-second spinner.
- Card-footer Save behaves identically (same `performSave` path), which is why both spinners appear "stuck for all rows".

## Risk & Impact

- **Data:** no loss; upsert semantics unchanged. Fix is additive (new RPC) + payload narrowing.
- **Workflow:** identical save guarantees (composite-key upsert).
- **UI:** "Saving…" pill clears in <1 s for a 1-row edit and in <2 s for 95-row bulk paste.
- **Regression:** medium — shared path with Save & Propagate, Compliance sub-factor save, FK/RLS skip toasts. Mitigation: preserve existing skip/FK toasts; preserve 23505 unique-violation retry; covered by new unit tests.
- **Scalability:** O(N) round-trips → O(1) per Save click. Critical for 1,000-row Compliance KPI cards too.
- **Rollback:** revert 3 files; the new RPC stays harmless if unused.

## Plan

### Step 1 — Row Save sends only the touched row (PRIMARY FIX)
File: `src/components/admin/OrgKpiEntryCard.tsx`
- `performSave(scopeId?)` builds a **filtered** payload: when `scopeId` is passed, include only that row's scopedValue; when no scopeId (card Save), include only rows where `_touched === true`.
- Card-level `getValues()` keeps returning the full state for compatibility with `Save & Propagate` (which must consider every row).

Verification: vitest — `performSave('abc-123')` produces a 1-row payload; `performSave()` after editing 3 rows produces a 3-row payload; Save & Propagate still produces all 95.

### Step 2 — `handleCardSave` honors `_touched` defensively
File: `src/pages/admin/OrgKpiDataEntry.tsx` L772
- Filter `values.scopedValues.filter(sv => sv._touched ?? true)` before building `toSave` (the `?? true` keeps Save & Propagate working when the field is absent).
- Compliance sub-factor branch keeps its existing override (sub_factors present ⇒ always persist).

Verification: vitest — typing in 1 row produces `toSave.length === 1`; 10-row paste produces 10; Save & Propagate still passes full set.

### Step 3 — Single round-trip bulk upsert RPC
Migration: `public.bulk_upsert_org_kpi_values(p_rows jsonb)` SECURITY INVOKER, returns `(id uuid, was_insert boolean)`. Uses `INSERT … ON CONFLICT ON CONSTRAINT idx_org_kpi_values_unique_scope DO UPDATE`. GRANT EXECUTE to `authenticated`, `service_role`.

Rewrite `useBulkUpsertOrgKpiValues` to call the RPC once (chunked at 500 defensively); keep the existing per-row loop only as fallback when the RPC is unavailable (resilience during rollout). Pipe result through `assertRowsTouched` (ADR-079) so any RLS-silently-dropped row surfaces a destructive toast instead of fake "Saved".

Verification: vitest mocks `supabase.rpc` — 1 RPC call for any payload up to 500; correct chunking at 501+. SQL test confirms 95 rows persist in one statement and RLS still rejects out-of-scope rows.

### Step 4 — Narrow cache invalidation
In `onSuccess`, invalidate only the active card's key (`['org-kpi-values', period, year, category_id, kra_name, kpi_name]`) plus the existing evidence keys. Other cards stay warm.

Verification: React Query devtools — only the active card refetches after save.

### Step 5 — Tests + docs (per project SSOT rule)
- `src/test/orgKpiEntryCardRowSave.test.ts` — row Save payload size.
- `src/test/orgKpiHandleCardSave.test.ts` — `_touched` filter.
- `src/test/orgKpiBulkUpsert.test.ts` — RPC happy path, chunking, partial RLS reject, 23505 fallback.
- ADR-080 documenting the fix.
- DOCUMENTATION.md + POLICY.md changelog entries.
- Update `mem://features/admin/org-kpi-data-entry-manual-save` with the new save contract (row Save = touched row only; card Save = touched rows only; Save & Propagate = all rows).

## UI Changes

- No visual redesign.
- Row Save spinner clears in <1 s for a single-row edit.
- Card-footer "Saving…" pill (L1275) clears in <2 s for a typical 95-row bulk paste, vs 15–60 s today.
- "Unsaved — wait for autosave, then Propagate" hint (L708) unchanged — the wait window just becomes much shorter.

## Files touched

- src/components/admin/OrgKpiEntryCard.tsx  (row Save payload narrowing)
- src/pages/admin/OrgKpiDataEntry.tsx  (filter `_touched`)
- src/hooks/useOrgKpiValues.ts  (rewrite bulk upsert to use RPC)
- supabase/migrations/<new>.sql  (new RPC + GRANT)
- src/test/orgKpiEntryCardRowSave.test.ts  (new)
- src/test/orgKpiHandleCardSave.test.ts  (new)
- src/test/orgKpiBulkUpsert.test.ts  (new)
- docs/adr/ADR-080.md  (new)
- DOCUMENTATION.md, POLICY.md  (changelog)
- mem/features/admin/org-kpi-data-entry-manual-save.md  (update)

## Open question

OK to ship the bulk RPC as **SECURITY INVOKER** (RLS still enforced per row; silently-rejected rows surface via `assertRowsTouched`)? Alternative: SECURITY DEFINER with `has_menu_right('admin-org-kpi','update')` — stricter but couples the RPC to the menu-rights model.  
**Recommendation: SECURITY INVOKER**, matching every other Org KPI write path today.
