# Fix: "Could not preview propagation" overload ambiguity

## RCA (5 Whys)

1. **Symptom**: Ankan clicked Propagate on "IT Awareness & Training Programs" and got the toast: *"Could not choose the best candidate function between: public.preview_org_kpi_propagation(p_kpi_ids ⇒ uuid[]), public.preview_org_kpi_propagation(p_kpi_ids ⇒ uuid[], p_new_value ⇒ numeric, p_new_self_score ⇒ numeric, p_overwrite_policy ⇒ text)."*
2. **Why?** PostgREST sent the 4-arg form (`p_kpi_ids`, `p_new_value`, `p_new_self_score`, `p_overwrite_policy`) but the database has **two** functions with the same name.
3. **Why two?** The original ADR-053 migration created `preview_org_kpi_propagation(uuid[])`. ADR-054 added the richer signature `preview_org_kpi_propagation(uuid[], numeric, numeric, text)` with all-default parameters but **never dropped** the legacy one.
4. **Why ambiguous?** Because `p_new_value`, `p_new_self_score`, `p_overwrite_policy` all have `DEFAULT NULL`/`'pre_review_only'`, a call passing only `p_kpi_ids` is valid against both overloads. PostgREST cannot pick one and aborts.
5. **Why now?** The frontend (`usePreviewOrgKpiPropagation`) **always** passes all four parameters, but PostgREST's resolver still considers both candidates because every extra arg matches the defaults of the legacy form by name (it ignores nothing — the conflict is the defaults make both signatures applicable).

Confirmed via `pg_proc`:
```
preview_org_kpi_propagation(p_kpi_ids uuid[])                                            -- legacy, ADR-053
preview_org_kpi_propagation(p_kpi_ids uuid[], p_new_value numeric DEFAULT NULL,
                            p_new_self_score numeric DEFAULT NULL,
                            p_overwrite_policy text DEFAULT 'pre_review_only')           -- ADR-054 (current)
```

## Fix

Single migration that drops the obsolete 1-arg overload. The 4-arg version already covers every call site (`src/hooks/usePreviewOrgKpiPropagation.ts` is the only caller and always sends all four).

```sql
DROP FUNCTION IF EXISTS public.preview_org_kpi_propagation(uuid[]);
```

No code changes required in the frontend — the hook is already correct. Tile / dialog status logic (ADR-055/056) is unaffected.

## Risk & Impact

- **Data**: None. Read-only function, no schema/RLS changes.
- **Workflow**: None. The 4-arg form is a strict superset.
- **Regression**: Only consumer is `usePreviewOrgKpiPropagation` which uses the 4-arg form. Verified by repo grep — no other callers.
- **Mitigation**: Add a unit/integration guard test that asserts only one overload exists (queries `pg_proc`) so future migrations don't reintroduce the ambiguity.

## Deliverables

1. `supabase/migrations/<ts>_drop_legacy_preview_org_kpi_propagation.sql` — single `DROP FUNCTION` statement.
2. `src/test/orgKpiPreviewOverloadGuard.test.ts` — parity test stub asserting the hook signature stays in sync with the surviving overload.
3. `docs/adr/ADR-058.md` — short note recording the cleanup and pointing back to ADR-053/054.
4. `CHANGELOG_2026.md` + `mem/features/admin/org-kpi-management-suite` — one-line entries.

## Verification

- After migration, re-run propagation preview for any KPI; the red toast disappears and `PropagationPreviewDialog` opens normally.
- `select count(*) from pg_proc where proname = 'preview_org_kpi_propagation'` returns `1`.
