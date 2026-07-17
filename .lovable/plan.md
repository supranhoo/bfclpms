## Scope

FAD- W - E&I (New) template (`a0d7040e-dcfc-426c-9723-9598a68bd103`) — 12 mapped employees. Two problems, both traced to today's 13:25 IST template re-save.

## Assumptions

- "Reset" = the template re-save that happened at 13:25 IST today. Nothing else has cleared/rewritten instance data in that window.
- Validation should stay in place. The real defect is that clicks on the option cards / 0–5 buttons are being dropped for at least one criterion, so the draft goes up to the server empty and Submit legitimately blocks.
- No policy change to which criteria are mandatory — only fix the write path so scored values actually persist.

## Risk & Impact Report

- **Data**: Only `annual_review_instances.system_scores` / `system_scores_raw` for the 12 E&I employees are touched, and only for values that today's re-save regressed. Every write is preceded by a snapshot into an audit table so it's fully reversible.
- **Workflow**: No stage advance triggered; `status`, `current_stage`, `final_rating` untouched. Submissions continue to require the reviewer to hit Submit.
- **UI/UX**: One narrow bug fix in the self-review scoring surface (`CriteriaScoringMatrix` + draft debounce). No visual redesign.
- **Regression risk**: Medium — the draft debounce and option-card write path is shared with every annual-review template. Mitigated by (a) reproducing on a copy of Md Sagir's instance in a Playwright script before touching code, (b) targeted unit tests, (c) rollback = revert the migration/patch, `system_scores` audit table lets us re-restore.
- **Mitigation**: All backfills are idempotent and gated by "value changed" checks; a `POLICY §AR-TEMPLATE-RESAVE-PRESERVES-SYSTEM-DATA` note is added so any future template edit path is required to preserve `system_scores`.

## Investigation plan (do this first, don't code yet)

1. **Confirm what got wiped and when.**
   - Compare current `system_scores` / `system_scores_raw` on the 12 instances against the pre-13:25 values. Sources of truth to cross-check per `library_key`: safety KPIs (LTI/STI/UA-UC-NM/5S) → safety module aggregates; Training Attended → HR module; Fugitive PM10 → env source; Annual Production + Annual PM → manual/org-KPI values.
   - Any key whose current value ≠ SSOT-recomputed value = a value the re-save regressed. That's the exact set we restore.
2. **Confirm the save-drop for scoring.**
   - Open Md Sagir's instance in Playwright as an assisted-submission proxy, click one option card per criterion, wait for the debounced autosave, then read `annual_review_responses.criteria_scores`. Whichever criterion IDs never land in the row are the ones with a broken write path.
   - Prime suspect: the 5 new criteria (`crit_dzlyer7`, `crit_94h19de`, `crit_it39bx4`, `crit_nrm3dlt`, `crit_348k3lz`) were authored today without a `key` field. Every reader keys off `id`, but I need to prove the write actually reaches the debounced service call before assuming it's only a validation bug.

Only after both are confirmed do we touch code.

## Fixes

### 1. System-data restoration (issue #1)

- Create `annual_review_system_scores_resave_audit_2026_07` (append-only) and snapshot the current `system_scores` / `system_scores_raw` for the 12 E&I instances before any write.
- Recompute the 8 system-score values per instance from their canonical sources using the existing template-factory / system-score resolvers (no new math introduced). Update `annual_review_instances.system_scores[*]` and `system_scores_raw[*]` only where the recomputed value differs from the currently persisted value.
- Add `POLICY §AR-TEMPLATE-RESAVE-PRESERVES-SYSTEM-DATA`: template edits must never blank an existing instance's `system_scores` — the resolver must reconcile deltas (add new sys_ids, keep values for surviving sys_ids, retire dropped sys_ids) rather than overwrite the whole map.
- Patch the template save path that regressed the data so this can't recur (surgical change in the template-factory / template-editor save code — no unrelated refactor).

### 2. Self-scoring save (issue #2)

- Once the reproduction pinpoints the criterion(s) whose scores don't land, fix the specific dropped-write bug. Two most likely surfaces:
  - `CriteriaScoringMatrix` writing under a stale/unexpected id for the 5 newly authored criteria.
  - `useDebouncedResponseDraft` initial-load race that overwrites the just-clicked score with an older server draft.
- Backfill the missing `key` field on the 5 criteria (`Breakdown Response time`, `Shutdown Maintenance Adherence`, `33 KV Sub-station Maintenance & Availability`, `MRP & Briquetting Plant Maintenance & Availability`, `Plant Inside and Outside lighting availability`) so template exports / translations / analytics stay consistent with the first 5. This is data hygiene, not the root fix.
- Keep the "Please score all criteria" validation exactly as it is today — it is the correct guardrail; only the write path is broken.

## Tests (mandatory)

- `criteriaScoringMatrixSaveOnClick.test.tsx` — clicking every criterion in the new-template criteria list produces a call to `setDraft` with the correct `criterion.id` (covers criteria with and without a `key`).
- `useDebouncedResponseDraftLateInitial.test.ts` — extend to cover the specific race exposed by repro if that's the culprit.
- `annualReviewTemplateResavePreservesSystemScores.test.ts` — saving a template must never blank an instance's `system_scores` for surviving sys_ids.
- Backfill migration is idempotent (running twice changes nothing on the second pass); verified by a dry-run assertion in the migration description.

## Docs / Policy sync

- `POLICY.md` — add §AR-TEMPLATE-RESAVE-PRESERVES-SYSTEM-DATA.
- `DOCUMENTATION.md` — Version History entry for both fixes and the new audit table.

## Deliverables order

1. Diagnostic script output (which sys_ids regressed, which criteria drop their write) — reported back to you before any migration.
2. Restore migration + audit table.
3. UI/service patch for the dropped-write bug + criteria `key` backfill.
4. Tests + doc/policy updates.
5. Rollback: revert migration + revert code patch; audit table lets us re-restore any instance to today's post-fix state.
