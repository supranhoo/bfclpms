# Evidence attachment "You do not have access to this file" — RCA & fix

## What was verified (queried, not assumed)

- The file in the screenshot belongs to employee **201133**, KPI "Continuous monitoring of budget and cost control measures…". All five of that KPI's evidence objects (self-evidence + org-kpi-evidence variants) **exist in the `review-evidence` bucket** — nothing was deleted, and no path is orphaned.
- Across the whole system, every self-evidence URL whose path carries a KPI id resolves to an existing KPI (0 orphans), and **0** cases point at a KPI belonging to a different employee. So the KPI owner is never denied by a path mismatch.
- The failure therefore comes from **storage authorisation**, not from a missing file. `createSignedUrl` returns a 400/404-shaped error, which `normalizeEvidenceError()` maps to "You do not have access to this file, or it is no longer available."

## Root cause

Two different authorisation rules govern the same evidence, and they do not agree:

```text
Can I SEE the KPI + its attachment link?   -> public.can_view_kpi_row()
Can I OPEN the attached file?              -> public.can_read_kpi_evidence()
```

`can_view_kpi_row()` grants: owner, admin, auditor, hr_pms, **management**, report-access override, manager, **skip-level manager (via get_skip_level_manager)**, mention access, **org-KPI data owner**.

`can_read_kpi_evidence()` grants only: owner, direct reporting manager, manager-of-manager, assigned auditor (employee or KPI level), mention access.

The legacy storage policy `Users can view authorized evidence` patches back admin / auditor / hr_pms, so those roles still work — which is why the problem looks intermittent and only some users hit it.

Nobody covers: **`management` role, skip-level resolved through `get_skip_level_manager` (not just manager-of-manager), the functional manager (`profiles.functional_manager_id`, added in ADR-193), org-KPI data owners, and report-access overrides.** Any of those users sees the attachment chip, clicks it, and is told they have no access.

### 5 Whys
1. Why the error? `createSignedUrl` was refused by storage RLS.
2. Why refused? `can_read_kpi_evidence()` returned false for the viewer.
3. Why false? Its participant set is narrower than the set that can view the KPI.
4. Why narrower? It was written for ADR-190 (uploader-folder problem) and never re-synced when management/functional-manager/skip-resolver visibility was added.
5. Why not caught? No test asserts parity between KPI-row visibility and evidence-read visibility, and the error text hides the real cause by labelling every denial "no access".

## Fix (CAPA)

1. **Single source of truth for evidence read.** Rewrite `can_read_kpi_evidence(kpi_id)` as `STABLE SECURITY DEFINER` that resolves the KPI's employee and delegates to the same predicate set as `can_view_kpi_row()`, adding: `management` role, `hr_pms`, `admin`, `get_skip_level_manager()`, `functional_manager_id`, org-KPI data owner, and report-access override. Behaviour is additive — no one loses access; the legacy folder-owner policy stays untouched (ADR-190 invariant).
2. **Keep storage policies as-is** — they already call the helper, so fixing the helper fixes every prefix (self / reviewer / auditor / management / observation / observation-replies) in one place.
3. **Stop mislabelling denials.** When signing fails, log the storage status code and show "You do not have access to this file" only for a true 403/404 on an object that exists for someone else; keep the existing transient-busy branch (ADR-250). Add the KPI id to the console diagnostic so support can reproduce.
4. **Regression guard.** A parity test that fails if `can_view_kpi_row` grants a role/relationship that `can_read_kpi_evidence` does not, plus unit tests for the error normaliser branches.

## Risk & impact

- **Data:** none — read-only predicate change, no schema or row edits.
- **Security:** widens evidence read strictly to users who already see the KPI and its scores; no new data exposure, no anon access.
- **Workflow / UI:** no visual change except that previously failing previews now render.
- **Regression risk:** low; the helper is called only by the two storage SELECT policies.
- **Rollback:** re-create the previous `can_read_kpi_evidence` body in one migration.

## Deliverables

Migration (function replacement), parity + normaliser tests, `docs/adr/ADR-256.md`, and `DOCUMENTATION.md` / `POLICY.md` (§EVIDENCE-READ-KPI-PARTICIPATION updated to "evidence read must equal KPI visibility") / `CHANGELOG_2026.md` updates.

## One thing that would sharpen this

Tell me **who** was on screen when the error appeared (name or employee code) and I will confirm which of the uncovered relationships applied before shipping. The fix above closes all of them either way.
