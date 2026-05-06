# Fix "type workflow_status does not exist" on Propagate (ADR-059)

## RCA (5-Why)
1. **Symptom** — Ankan clicks **Propagate** on the IT Awareness KPI and gets the toast `Failed to propagate values — type "workflow_status" does not exist`.
2. **Why does the toast appear?** — `propagate_org_kpi_value(jsonb, boolean, text, text)` raises a Postgres error when executing `UPDATE kpis SET status = v_target_status::workflow_status`.
3. **Why does that cast fail?** — There is no enum named `workflow_status` in the database. The actual enum on `public.kpis.status` is `public.review_status` (verified via `information_schema.columns`: `udt_name = review_status`).
4. **Why was the wrong type used?** — Migration `20260506065308_..._policy_aware_propagation.sql` (ADR-054 follow-up) was authored against the wrong enum name; the cast was never executed in CI because the function only fires when an admin/data-owner clicks Propagate on a `kra_set`/`self_review` row.
5. **Root cause** — Naming drift between the documented "workflow status" concept and the canonical enum `review_status`. No regression test pins the propagate RPC's enum cast, so the typo shipped.

## Fix
Replace the bad cast with the real enum (`public.review_status`) inside `public.propagate_org_kpi_value(jsonb, boolean, text, text)`. No other call sites use `workflow_status`.

```sql
-- inside CREATE OR REPLACE FUNCTION public.propagate_org_kpi_value(...)
UPDATE public.kpis
   SET status = v_target_status::public.review_status
 WHERE id = v_kpi_id;
```

Everything else in the function body (policy gating, audit log writes, `review_submissions` upsert) stays exactly as it is — we are only correcting the enum name.

## Regression guard
Add `src/test/orgKpiPropagateEnumGuard.test.ts` that greps the live migration set and asserts:
- 0 occurrences of the literal `workflow_status` in `supabase/migrations/**` (the type does not exist).
- the propagate migration body contains the canonical `::review_status` cast.

This is a cheap source-level guard that will fail fast if the wrong enum name ever returns.

## Deliverables
- **New migration** `supabase/migrations/<ts>_fix_propagate_org_kpi_value_enum_cast.sql` — `CREATE OR REPLACE` of the 4-arg `propagate_org_kpi_value` with the corrected `::review_status` cast (function signature unchanged, so PostgREST contract and ADR-058's single-overload guarantee are preserved).
- **New test** `src/test/orgKpiPropagateEnumGuard.test.ts` — source-level guard described above.
- **ADR-059** `docs/adr/ADR-059.md` documenting the typo, why `review_status` is the canonical enum, and the regression guard.
- **CHANGELOG_2026.md** — append an entry under today's date.
- **Memory update** — append a one-liner to `mem/features/admin/org-kpi-management-suite` noting that the propagate RPC must cast to `public.review_status`.

## Risk & Impact
- **Data impact:** none — function body and write semantics are identical; we only correct a cast that currently aborts the transaction before any row is written.
- **Workflow impact:** Propagate dialog starts working again for data owners and admins. No permission or RLS change.
- **UI/UX:** unchanged.
- **Regression risk:** very low — single-line cast change inside an already-isolated SECURITY DEFINER function. Guard test prevents the typo from coming back.
- **Mitigation:** keep the 4-arg signature byte-identical to ADR-058's contract so `usePreviewOrgKpiPropagation` and the propagate hook keep working without code edits.

Approve to ship the migration, ADR-059, the guard test, and the changelog/memory updates.
