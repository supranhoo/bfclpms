## Scope

FAD- W - E&I (New) template (`a0d7040e-dcfc-426c-9723-9598a68bd103`) — 12 mapped employees. Two problems, both traced to today's 13:25 IST template re-save.

## Investigation (do first, before any write)

1. **Confirm what got wiped and when.** Compare current `system_scores` / `system_scores_raw` on the 12 instances against SSOT-recomputed values per `library_key` (safety KPIs, Training Attended, Fugitive PM10, Annual Production, Annual PM). Any key whose current value ≠ recomputed value is a value the re-save regressed — that is the exact set we restore.
2. **Confirm the save-drop for scoring.** Reproduce on Md Sagir's instance via Playwright (assisted proxy): click one option card per criterion, wait for debounced autosave, then read `annual_review_responses.criteria_scores`. Any criterion whose id never lands is a broken write path. Prime suspects: the 5 new criteria authored today without a `key` field (`crit_dzlyer7`, `crit_94h19de`, `crit_it39bx4`, `crit_nrm3dlt`, `crit_348k3lz`).

Only after both are confirmed do we touch code.

## Fixes

### Issue #1 — System data restoration

- Create `annual_review_system_scores_resave_audit_2026_07` (append-only) and snapshot current `system_scores` / `system_scores_raw` for the 12 E&I instances before any write.
- Recompute the 8 system-score values per instance from their canonical sources using the existing template-factory / system-score resolvers (no new math). Update `annual_review_instances.system_scores[*]` / `system_scores_raw[*]` only where recomputed ≠ persisted.
- Add **POLICY §AR-TEMPLATE-RESAVE-PRESERVES-SYSTEM-DATA**: template edits must reconcile deltas (add new sys_ids, keep values for surviving sys_ids, retire dropped sys_ids) — never blank the whole map.
- Patch the template-save path in `templateFactoryBulk.ts` that regressed the data. Surgical change only.

### Issue #2 — Self-scoring save

- Fix whichever surface the repro pinpoints:
  - `CriteriaScoringMatrix` writing under a stale/unexpected id for the 5 new criteria, OR
  - `useDebouncedResponseDraft` initial-load race that overwrites the just-clicked score with an older server draft.
- Backfill the missing `key` field on the 5 new criteria (data hygiene, not the root fix).
- Keep the "Please score all criteria" validation as-is — the guardrail is correct; only the write path is broken.

## Tests (mandatory)

- `criteriaScoringMatrixSaveOnClick.test.tsx` — every criterion click produces `setDraft` with the correct `criterion.id` (with and without a `key`).
- `useDebouncedResponseDraftLateInitial.test.ts` — extend for the specific race if that's the culprit.
- `annualReviewTemplateResavePreservesSystemScores.test.ts` — template save must never blank an instance's `system_scores` for surviving sys_ids.
- Backfill migration is idempotent (second run = no-op).

## Docs / Policy

- `POLICY.md` — add §AR-TEMPLATE-RESAVE-PRESERVES-SYSTEM-DATA.
- `DOCUMENTATION.md` — Version History entry for both fixes and the new audit table.

## Deliverables order

1. Diagnostic output (which sys_ids regressed, which criteria drop writes) — reported before any migration.
2. Restore migration + audit table.
3. UI/service patch for dropped-write bug + criteria `key` backfill.
4. Tests + docs/policy.
5. Rollback: revert migration + revert patch; audit table lets us re-restore.

## Risk & Impact

- **Data**: Only the 12 E&I instances' `system_scores` / `system_scores_raw` touched, only where value regressed, snapshotted first — fully reversible.
- **Workflow**: No stage advance; `status`, `current_stage`, `final_rating` untouched.
- **UI/UX**: One narrow bug fix in the scoring surface; no redesign.
- **Regression**: Medium — debounce/option-card path is shared across templates. Mitigated by repro-first, targeted tests, and rollback via audit table.
