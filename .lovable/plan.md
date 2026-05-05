
## Fix: CRLF/LF Mismatch Breaking Org KPI Propagation

### Root Cause
`propagate_org_kpi_value` matches per-employee KPIs to the Org KPI by exact text equality on `(category_id, kra_name, kpi_name, review_period, review_year)`. Binod's and Santosh's April `kpis.kpi_name` rows store the SOP/SMP KPI text with `\r\n` line endings (350 chars); the corresponding `org_kpi_values.kpi_name` stores it with `\n` (347 chars). The byte mismatch causes the propagate eligibility check to mark them as `not_in_kra_set`, silently skipping them — so no `review_submissions` row is created and the UI shows an empty row.

System-wide audit:
- 8,587 of 12,031 `kpis` rows contain CRLF in `kpi_name`.
- 2,217 `org_kpi_values` rows contain CRLF in `kpi_name`.
- Any KPI whose newline style drifts from its sibling rows or its OKV counterpart will silently fail propagation, scope-cascade, forward-sync, registry alias matching, and rollover dedup.

### Plan

1. **Database migration: normalize newlines retroactively (one-shot)**
   - Update `kpis.kpi_name`, `kpis.kra_name`, `org_kpi_values.kpi_name`, `org_kpi_values.kra_name`, `kra_library.kpi_name`, `kra_library.kra_name`, and `org_kpi_master.kpi_name`/`kra_name` to replace `\r\n` and bare `\r` with `\n`. Trim trailing whitespace.
   - Same normalization for `kpi_standardization_registry` canonical + alias text.
   - Audit log a single `KPI_TEXT_NEWLINE_NORMALIZED` row with affected counts and `performed_by = NULL`.

2. **Database migration: forward guard triggers**
   - Add `BEFORE INSERT OR UPDATE` triggers on `kpis`, `org_kpi_values`, `kra_library`, and `org_kpi_master` that run a `normalize_kpi_text()` PL/pgSQL helper:
     - `regexp_replace(NEW.kpi_name, E'\\r\\n?', E'\\n', 'g')`
     - same for `kra_name`
     - rtrim
   - Idempotent — only writes back if the value actually changed (avoids spurious `UPDATE` audit noise).
   - Skip on tables that already have triggers performing this work (verified none currently).

3. **Re-run propagation for the broken April rows**
   - After normalization, the existing `propagated` OKV rows for Binod (`14a4415f-…`) and Santosh (`08cb3564-…`) will signature-match their KPIs.
   - Migration calls `propagate_org_kpi_value` for the SOP/SMP April category once more to insert the missing `review_submissions` rows and advance their `kpis.status` to `self_review`, mirroring what Umesh/Satyendra already received.
   - No-op for already-propagated employees (idempotent — handled by RPC's existing `not_in_kra_set` / `already advanced` skip).

4. **Tests**
   - Unit test: pure helper `normalizeKpiText()` in `src/lib/kpiTextNormalization.ts` confirms `\r\n`, `\r`, mixed, and trailing-whitespace inputs collapse to canonical LF.
   - DB regression test in `src/test/orgKpiPropagationCrlf.test.ts`: insert two synthetic OKV + KPI rows that differ only in newline style, call propagate, assert both employees receive a `review_submissions` row.

5. **Documentation & memory**
   - `DOCUMENTATION.md` Version History: add "v2.66.9 — KPI text canonicalization (CRLF→LF) + insert/update guard triggers".
   - `POLICY.md` §88.2 (new): "All KPI/KRA text columns are stored in LF-only canonical form. Inserts and updates are normalized at the DB layer before signature equality is evaluated."
   - Update `mem/features/admin/org-kpi-management-suite` with a new bullet (16) covering the canonicalization rule.
   - Update `mem/features/admin/kpi-standardization-registry` to note newline canonicalization is now enforced server-side, not just client-side.
   - Append to `CHANGELOG_2026.md` under May W1.

### Risk & Impact

- **Data Impact:** Modifies `kpi_name` / `kra_name` text in ~10.8k rows. Change is purely whitespace canonicalization — display strings render identically (newlines remain), historical scores untouched. Audit row records the operation.
- **Workflow Impact:** None for already-completed reviews. Unblocks propagation, scope-cascade, forward-sync, and registry alias matching for any KPI previously stuck due to newline drift.
- **UI/UX:** No visual change. Cards continue to render multi-line text; only the byte representation is normalized.
- **Regression Risk:** Low. The only consumers comparing KPI text by equality are DB triggers/RPCs, which now see consistent input. Client-side `nk` normalization (lowercase+trim+collapse-whitespace) already tolerates either form, so React components are unaffected.
- **Mitigation:** New unit + integration tests guard the normalizer and the propagation path. Triggers are idempotent and only write on change. Migration runs in a single transaction; rollback restores by re-importing from `kpi_audit_logs` snapshot if ever needed.

### Files Touched

- `supabase/migrations/<ts>_kpi_text_canonicalization.sql` (new)
- `src/lib/kpiTextNormalization.ts` (new)
- `src/test/kpiTextNormalization.test.ts` (new)
- `src/test/orgKpiPropagationCrlf.test.ts` (new)
- `DOCUMENTATION.md`, `POLICY.md`, `CHANGELOG_2026.md`
- `mem/features/admin/org-kpi-management-suite`, `mem/features/admin/kpi-standardization-registry`

Approve to implement.
