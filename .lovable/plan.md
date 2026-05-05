## Fix: Org KPI text-normalization mismatch (Samir & Vivek)

### Root Cause
- `org_kpi_data_owners` and `org_kpi_values` rows were written with raw text (extra whitespace, stray `\r`, punctuation variants) before the KPI Standardization Registry normalized canonical names. They no longer match `kpis.is_org_level=true` rows on exact text.
  - **Samir:** ownership row's `kra_name`/`kpi_name` doesn't match any current canonical Org KPI → card hidden in UI.
  - **Vivek:** `useBulkUpsertOrgKpiValues` does a raw-text SELECT → INSERT → SELECT-with-`.single()` ladder. When normalization triggers rewrite the inserted text, the retry SELECT finds nothing and `.single()` throws `PGRST116` → "Cannot coerce... to a single JSON object".

### Plan

**1. DB migration — atomic upsert RPC + backfill**
- Create `public.upsert_org_kpi_value(category_id, kra_name, kpi_name, period, year, achieved_value, sub_factors, owner_id)` as `SECURITY DEFINER`:
  - Normalize inputs (`btrim`, collapse whitespace, strip `\r`).
  - `INSERT ... ON CONFLICT (category_id, kra_name, kpi_name, review_period, review_year) DO UPDATE` returning the row.
  - RLS check: caller must be admin OR owner in `org_kpi_data_owners` for that signature.
- Backfill reconciliation:
  - Update `org_kpi_data_owners.kra_name/kpi_name` and `org_kpi_values.kra_name/kpi_name` to match the canonical text from `kpis` where `is_org_level=true` (join on normalized text).
  - Log every row touched into `kpi_audit_logs` as `ORG_KPI_TEXT_RECONCILED` with `performed_by = NULL`.
- Add unique index (if missing) on `org_kpi_values (category_id, kra_name, kpi_name, review_period, review_year)` to back the ON CONFLICT.

**2. Frontend — kill the lookup-retry ladder**
- `src/hooks/useOrgKpiValues.ts`:
  - Replace `useBulkUpsertOrgKpiValues` body with a single `supabase.rpc('upsert_org_kpi_value', …)` call per row, batched via `Promise.allSettled`.
  - Remove all `.single()` calls on lookup paths; use `.maybeSingle()` everywhere as a defensive net.
  - Map `PGRST116` to friendly toast "Could not save KPI — please refresh and retry" instead of raw Postgres text.
- `src/hooks/useOrgKpiDataOwner.ts`:
  - Apply consistent `normalizeKpiText` (`s.replace(/\r/g,'').toLowerCase().replace(/\s+/g,' ').trim()`) in `useOrgKpiOwnershipMap`, `useOrgKpiDataOwnerNames`, `getOwnerNamesForKpi`, `useIsOrgKpiDataOwner`, `useOrgKpiOwners` (currently inconsistent — some use full nk, some only `.toLowerCase()`).
- `src/pages/admin/OrgKpiDataEntry.tsx`:
  - Filter `ownershipFilteredKpis` using the same `normalizeKpiText` so Samir's mapped KPIs render even if registry text drifts again.
- New helper `src/lib/kpiTextNormalize.ts` exporting one shared `normalizeKpiText` to stop drift.

**3. Tests**
- `src/test/orgKpiUpsertRpc.test.ts` — mocks RPC: success path, RLS-denied path, mapping of PGRST116 → friendly message.
- `src/test/orgKpiOwnershipNormalize.test.ts` — feeds owners with `\r`, double spaces, and trailing whitespace; asserts ownership map keys + filter still match canonical KPI signatures.

**4. Docs / Memory**
- `docs/adr/ADR-051.md` — "Normalized text is mandatory for all Org KPI lookups; client never does INSERT-then-SELECT."
- `POLICY.md` — add §90: Org KPI writes go through `upsert_org_kpi_value` RPC only.
- `DOCUMENTATION.md` — Version History entry v2.66.14.
- `CHANGELOG_2026.md` — v2.66.14 entry.
- Update `mem://features/admin/org-kpi-management-suite` with the RPC + shared normalizer rule.
- Update `mem://features/admin/kpi-standardization-registry` noting the backfill reconciler.

### Risk & Impact
| Area | Impact |
|------|--------|
| Data | Backfill is text-only; original values archived in audit log; no score mutation. |
| Workflow | None — same write semantics, just atomic. |
| RLS | RPC enforces same admin-or-owner rule already in policies. |
| Regression | Low; covered by 2 new tests + existing `orgKpiPropagationToast.test.ts`. |
| Mitigation | Dry-run backfill count printed in migration NOTICE before commit; RPC additive (old code paths replaced, not removed at DB level). |

### Files
- **New** `supabase/migrations/<ts>_org_kpi_upsert_rpc_and_text_reconcile.sql`
- **New** `src/lib/kpiTextNormalize.ts`
- **Edit** `src/hooks/useOrgKpiValues.ts`, `src/hooks/useOrgKpiDataOwner.ts`, `src/pages/admin/OrgKpiDataEntry.tsx`
- **New** `src/test/orgKpiUpsertRpc.test.ts`, `src/test/orgKpiOwnershipNormalize.test.ts`
- **New** `docs/adr/ADR-051.md`
- **Edit** `POLICY.md`, `DOCUMENTATION.md`, `CHANGELOG_2026.md`
- **Edit** `mem://features/admin/org-kpi-management-suite`, `mem://features/admin/kpi-standardization-registry`
