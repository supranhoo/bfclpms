# Group edit: forward months from a past anchor + text-only edits on locked rows (ADR-321)

## What was verified

- The **Apply to** control already exists (ADR-291), with three modes: this month / this and all future months / next N. It is collapsed to a single option here purely because `spanModesAvailable()` in `src/components/admin/bu-console/groupEditSpan.ts` returns `['this']` whenever the selected month is in the past — Jul 2026 against a current date of Aug 2026. So the option is not missing, it is gated off.
- The 12 skips are produced by `bu_console_group_edit_definition`, which decides skip/write **before** looking at which fields changed:
  - `final_score_locked` — any row with an approved final score (9 of the 12),
  - `past_kra_set` — row past the KRA-set stage and "include rows already in review" not ticked (3 of the 12).
- The change set in the screenshot is Title + Description only. Neither field takes part in any score: the editable-field list separates them from `weightage`, `target_value`, `frequency`, `frequency_cycle_start` and the `r0..r5` bands.

## Part 1 — Offer forward months even when the anchor is in the past

Today the rule is "never write a past month". It is really "never write a past month the admin did not pick" — the dialog already writes Jul 2026 when the admin selects it.

New behaviour when the selected month is past:

- All three modes are offered.
- `This and all future months` resolves to: the selected month itself, plus every month from the **current** calendar month to June of the selected month's fiscal year. Past months between the anchor and today are never included.
- The chip line spells the result out, e.g. `Jul 2026 (selected) + Aug 2026 … Jun 2027 — 12 periods`, and a note states that intervening past months are excluded.
- The 12-period cap, the per-month dry-run table, sequential commit, per-month `bu_console_edit_runs` rows and per-month undo all stay exactly as they are.

## Part 2 — Text-only standardisation on locked rows

Introduce one explicit classification, mirrored on client and server:

- **Descriptive fields** (no scoring effect): `kpi_title`, `kpi_description`, `criteria`, `source_of_data`, `kpi_formula`, `kpi_scoring_logic`, `uom`.
- **Scoring / structural fields** (everything else): weightage, target, frequency + cycle anchor, rating bands, threshold mode, `kra_name`, `category_id`, org-level scope.

When **every** changed field is descriptive, the dialog offers a new checkbox:

> **Standardise text on locked and in-review rows** — updates wording only; scores, targets, weightages and statuses are untouched.

With it ticked, `final_score_locked` and `past_kra_set` stop being skip reasons. Guardrails:

- Admin-only; the server re-derives the classification from `p_changes` and refuses the flag if a single scoring or structural field is present — the client cannot talk the server into it.
- The checkbox is hidden (and the flag ignored) the moment a scoring field is in the change set, so the current immutability behaviour is byte-identical for every real edit.
- POLICY §88 is amended, not bypassed: an approved final score, its inputs and the workflow status remain immutable. Only wording is rewritten.
- Every such write is recorded on the existing `bu_console_edit_runs` row with the flag set, so a text rewrite of a closed period is fully auditable and undoable.
- Rows still skipped for `individual_override` or `cycle_anchor_conflict` are unaffected.

The preview then shows these rows as writable, with a `text only` marker, instead of listing them as skipped.

## Technical notes

- `groupEditSpan.ts`: `spanModesAvailable` no longer collapses on a past anchor; `resolveEditSpan` keeps the explicit anchor and filters implicit targets to `>= current month`. New unit tests for past anchor + fiscal-year wrap, anchor-in-a-closed-FY, and the cap.
- New pure module `src/components/admin/bu-console/editFieldClass.ts` — `isDescriptiveOnly(changes)`; single source of truth for the client side, unit tested per field.
- `GroupDefinitionEditDialog.tsx`: conditional checkbox, updated span note, `text only` badge in the preview table; passes `p_text_only` through the existing preview/commit hooks in `useBuConsole.ts`.
- Migration: add `p_text_only boolean DEFAULT false` to `bu_console_group_edit_definition` plus a `bu_console_descriptive_fields()` helper; server-side re-validation and the relaxed skip branch. Additive signature change, no schema change, no RLS change.
- Docs: `docs/adr/ADR-321.md`, POLICY §CONSOLE-GROUP-EDIT-SPAN (past anchor) and §88 amendment (§CONSOLE-TEXT-ONLY-STANDARDISATION), DOCUMENTATION.md + version history.

## Risk

- **Data:** a text-only path can now write rows in closed periods. Contained by the server-side field whitelist, admin-only gate, mandatory preview and the existing per-run undo. No score, status or numeric field is reachable through it.
- **Regression:** low — both changes are opt-in; with the checkbox unticked and mode left at `This month only`, behaviour is unchanged.
- **Scale:** unchanged; still ≤ 12 sequential capped RPC calls.
- **Rollback:** revert the UI commit and restore the previous function body; the added parameter defaults to false.
