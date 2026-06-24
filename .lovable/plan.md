## Issue

On the Cycles tab, the date range editor shows pairs for Self / Manager / Skip / BU only — there is no **Department Head** date pair, even though `dept_head` is a first-class stage in the workflow chain (it appears in the "Default workflow stages" checklist and in `ALL_STAGES`).

Verified:
- `src/lib/annualReview/stageChain.ts` canonical chain: `self → manager → skip_manager → dept_head → bu_head → hr`.
- `src/pages/annual-review/AnnualReviewAdmin.tsx` line 1172 iterates only `['self_review','manager_review','skip_review','bu_review']` for the date pairs.
- DB `annual_review_cycles` columns: only `self_/manager_/skip_/bu_review_start|end` exist — `dept_review_*` is missing.

So Dept Head is mapped in the workflow but the cycle has no window dates for it, and there is no DB field to store them.

## Risk & Impact

- **Data:** Additive — two new nullable timestamptz columns on `annual_review_cycles`. No backfill. Existing cycles continue working (NULL = no enforced window, same as today for other stages when blank).
- **Workflow:** None. Stage chain logic already supports `dept_head`. Reminder/lock logic that reads window dates per stage will start respecting Dept Head dates only after they are set.
- **UI:** One extra date pair row in the New/Edit cycle card, placed between Skip and BU (canonical order).
- **Regression:** Low — touches the cycle editor row map, the clone payload, and the export mock. No scoring path changes.
- **Scalability:** Two scalar columns; no query impact.
- **Rollback:** Drop the two columns + revert UI + revert mock.

## Plan

1. **Migration** — add `dept_review_start timestamptz NULL`, `dept_review_end timestamptz NULL` to `public.annual_review_cycles`. No grants needed (existing table). No RLS change.

2. **UI (`AnnualReviewAdmin.tsx`)** — extend the stage list at line 1172 to `['self_review','manager_review','skip_review','dept_review','bu_review']` so the loop renders the Dept Head date pair in canonical order (after Skip, before BU). No other change to the editor.

3. **Service / clone payload** — verify `svc.upsertCycle` and `useCloneCycle` pass through unknown keys; if they whitelist columns, add `dept_review_start`/`_end` to the list. (Need to read `annualReviewService.ts` cycle helpers to confirm — will adjust as part of build.)

4. **Reminders / window enforcement** — audit `annual-review-reminders` edge fn and any service that reads `${stage}_review_start|_end` to ensure `dept` is handled symmetrically with the other stages (read-only check; only edit if a hard-coded stage list excludes it).

5. **Types** — regenerated automatically from the migration (`src/integrations/supabase/types.ts`). Update `AnnualReviewCycle` type in `src/types/annualReview.ts` if it has an explicit shape rather than re-exporting the DB row.

6. **Tests**
   - `src/services/annualReview/exports.test.ts` — add `dept_review_start/end: null` to the mock cycle.
   - New: extend any cycle-form test (or add a smoke render test) to assert all five date pairs render.

7. **Docs**
   - `DOCUMENTATION.md` — add a v2.66.56 entry: "Annual Review cycle now exposes Dept Head review window dates (`dept_review_start/_end`), mirroring the other stages."
   - `POLICY.md` — note that the cycle window for Dept Head is optional (NULL = no enforced window) and that the stage is still controlled by `default_enabled_stages` / per-instance `enabled_stages`.

## Out of scope

- No change to scoring, weights, or workflow advance logic.
- No backfill of dates for existing cycles (admins set them when editing).
- No change to the existing flat weights / two-tier pool config.

## Rollback

Revert UI commit + drop the two new columns. Existing cycles unaffected because the columns are NULL.
