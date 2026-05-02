# Why your KPI Standardization edit doesn't show on the dashboard

## What I found (RCA)

I traced the exact KPI in your screenshot ("Ensure Zero Harm workplace" / "Proactive Safety Reporting (UA, UC, & Near Miss) …", May 2026, employee Gaurav Tiwari) end-to-end through the database.

There are **two independent reasons** the edit isn't reflecting, and both have to be fixed for the dashboard to show your new wording.

### Reason 1 — The actual KPI rows are not linked to the canonical definition

A canonical definition does exist in `kpi_definitions`:
- id `bc48a549-cab6-4903-808b-ef2a12495a96`
- canonical KRA: `Ensure Zero Harm workplace`
- canonical KPI: `Proactive Safety Reporting (UA, UC, & Near Miss) Description: …`

But every matching row in `kpis` for May 2026 has **`kpi_definition_id = NULL`** — so the auto-link never bound them to the definition you edited. As a consequence, even on consumers that *are* canonical-aware (`KpiHistoryCard`, `KpiTrackerModal`, `KpiJourneySection`), `useCanonicalVariantPairs` returns `[]` and they fall back to **strict string equality** on `kra_name`/`kpi_name`. The dashboard therefore renders whatever literal text is stored on the `kpis` row — your registry edit is invisible.

### Reason 2 — The dashboard "View KPI Details" reads `kpis.kra_name` / `kpis.kpi_name` directly

Even when a KPI *is* linked, today only the **propagate** branch of `useEditDefinition` rewrites the literal `kra_name`/`kpi_name` columns on `kpis` (via `correct_may_kpis`). The detail panel, scorecard header, breadcrumbs, etc. read those columns directly. So:
- If you edited the canonical text **without ticking "Propagate"** → the registry row changes but the live `kpis` row text doesn't, and the dashboard keeps showing the old text.
- If you ticked Propagate → it only rewrote rows where `kpi_definition_id = <this definition>`, which (per Reason 1) was zero rows for this KPI.

Net effect for your screenshot: **0 rows updated, dashboard shows the original imported text.**

### Bonus observation
The `canonical_kpi_name` for this definition is the entire "Description / Formula / Scoring Logic" blob (over 400 chars). Whatever the admin pasted as the canonical KPI name went straight into the column — that's why the rendered title in the dialog is so long. You probably want to re-edit it to a short, clean canonical (e.g. `Proactive Safety Reporting (UA, UC, & Near Miss)`) and put the description into the `kpi_description` field instead.

---

## Fix plan

### Step 1 — Backfill the missing `kpi_definition_id` link (one-time, scoped)

Add an admin-only utility (one-shot SQL migration) that, for **May 2026+ rows only** and respecting the existing forward-only freeze, sets `kpis.kpi_definition_id = d.id` where the row's `(category_id, normalized kra_name, normalized kpi_name)` matches either:
- a `kpi_definitions` canonical pair, OR
- a `kpi_name_aliases` variant pair.

This is the same matcher already used by `useCanonicalAutolink`; we just run it once retroactively. Pre-May-2026 rows are never touched (POLICY §88I freeze).

After this backfill, all the canonical-aware UI (`KpiHistoryCard`, `KpiTrackerModal`, `KpiJourneySection`) will start grouping the historical alias rows correctly without any further code change.

### Step 2 — Make `useEditDefinition` always propagate the visible text on May 2026+ rows

Today the propagate checkbox is opt-in. Change the contract so that for May 2026+ rows linked to the definition (post-Step-1 they will be linked), the literal `kra_name` / `kpi_name` columns on `kpis` are **always** rewritten to the new canonical text. The checkbox stays only as an "also rewrite older alias rows" escalation if we ever extend it.

Implementation: in `src/hooks/useKpiRegistry.ts → useEditDefinition`, drop the `if (propagate)` guard around the `correct_may_kpis` loop and run it unconditionally for May-2026+ tuples; keep the existing audit log entry but record `propagate=true` automatically. Update `EditDefinitionDialog.tsx` copy so admins know edits are always applied to current-period rows.

### Step 3 — Fall back to canonical text in the dashboard detail panel

Belt-and-braces: in the "View KPI Details" component (the dialog in your screenshot — `KpiTrackerModal` / its header), when `useCanonicalVariantPairs` resolves a definition, render `canonicalPair(variantPairs).kra_name` / `.kpi_name` for the visible title instead of `kpi.kra_name` / `kpi.kpi_name`. This guarantees the registry's canonical wording wins on screen even if a future row is created before autolink stamps it.

### Step 4 — Re-edit the bad canonical entry for this specific KPI

Admin task (no code): in `/admin/kpi-standardization → Review Registry`, open definition `bc48a549-…` and shorten `canonical_kpi_name` to the real KPI title (e.g. `Proactive Safety Reporting (UA, UC, & Near Miss)`). Tick "Propagate". With Steps 1-3 in place this will now correctly rewrite every May-2026+ row.

### Step 5 — Tests & docs

- Unit test for the backfill SQL: an unlinked May-2026 row whose `(kra,kpi)` matches an alias gets stamped; a pre-May-2026 row never does.
- Unit test for `useEditDefinition`: editing a canonical now updates `kpis.kra_name`/`kpi_name` on linked May-2026+ rows even with `propagate=false` in the call site (default behaviour change).
- Component test asserting the detail header prefers canonical text when variant pairs are present.
- Update `mem/features/admin/kpi-standardization-registry` and `POLICY.md` §88I to reflect: (a) one-shot backfill semantics, (b) edit-always-propagates contract, (c) detail-panel canonical-first rendering.

## Risk & impact

- **Data impact**: Step 1 only writes to `kpis.kpi_definition_id` (no business field change), only for May 2026+ rows where a canonical mapping already exists, so it cannot change scores or history. Step 2/4 will rewrite `kra_name`/`kpi_name` for May 2026+ rows linked to *edited* definitions — exactly what the user wants — and is logged in `kpi_audit_logs` + `kpi_standardization_actions` for full reversibility via the existing History/Undo tab.
- **Workflow impact**: None. Workflow stages, scores, weightages, and approvals are untouched.
- **UI/UX**: Headers across the dashboard, scorecard, modals, and reports will start showing the cleaned canonical wording for current-period rows.
- **Regression risk**: Low. Canonical-aware consumers already exist; we're feeding them the link they were missing. Pre-May-2026 freeze is preserved by every code path.
- **Mitigation**: New unit tests in Step 5; manual QA on the exact KPI from the screenshot before merging.

## Files I expect to touch

- `supabase/migrations/<new>.sql` — one-shot backfill of `kpis.kpi_definition_id`.
- `src/hooks/useKpiRegistry.ts` — make `useEditDefinition` always propagate to current-period rows.
- `src/components/admin/kpi-standardization/EditDefinitionDialog.tsx` — copy update.
- `src/components/dashboard/KpiTrackerModal.tsx` (and the detail header it renders) — prefer canonical pair for display.
- `src/lib/canonicalRelatedKpis.ts` — small helper to expose the canonical pair to header components if not already exported in a usable form.
- Tests under `src/test/` and `src/lib/`.
- `mem/features/admin/kpi-standardization-registry`, `POLICY.md`, `DOCUMENTATION.md` change-log.
