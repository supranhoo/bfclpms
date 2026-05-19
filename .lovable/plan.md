# Org KPI Evidence — Deep-Dive Brainstorm

Scope: Discussion + design options only. No code changes in this turn.

## Current state (RCA)

**Schema (`org_kpi_values`)**

- `evidence_url text` — legacy single attachment.
- `evidence_urls jsonb default '[]'` — added Feb 2026, designed for multi-file. **Not yet wired into the UI.**

**UI (`OrgKpiFileUpload` + `OrgKpiEntryCard` + `OrgKpiScopedEntryTable`)**

- Single slot per row. "Upload" button → on success replaces `evidenceUrl`. Existing file shows `View | X (remove)`.
- No multi-file UI, no "Add another", no listing of `evidence_urls[]`.
- View action uses `openStorageFile(existingUrl)` — works only when a URL exists in `evidence_url`.

**Propagation (`propagate_org_kpi_value`)**

- Copies `okv.evidence_url` → `review_submissions.self_evidence_url` and `okv.evidence_urls` → `self_evidence_urls`, **by-value**, with `COALESCE(EXCLUDED.x, review_submissions.x)` (only fills if employee row is null — never overwrites).
- Eligibility gate: row must still be in `kra_set` status (ADR / memory §16, §18, §19). Once any sibling self-reviews, that employee's row is excluded from future propagation → admin edits to OKV evidence don't reach already-advanced rows.

**Employee dashboard read path**

- Dashboards/Scorecards read from `review_submissions.self_evidence_url[s]` per employee, NOT from `org_kpi_values`. After propagation the two are decoupled by design (POLICY §88, snapshot immutability).

## The four questions, answered

### 1) How do we ensure "Supporting is showing on display" at the OKV entry point?

Today there is **no explicit indicator** beyond the file pill — if `evidence_url IS NULL` and `evidence_urls = []` you just see the "Upload" button; admins can't tell at a glance:

- whether a file was ever attached and later removed,
- whether the file in storage is actually reachable (orphan URL),
- whether the scoped row inherited propagated employee evidence.

Proposal:

- **Evidence status chip per row**: `None` / `1 file` / `N files` / `Broken link` (resolved with a lightweight HEAD check, cached).
- **Resolution rule** for what counts as "shown": `coalesce(jsonb_array_length(evidence_urls), 0) + (evidence_url IS NOT NULL)::int > 0`. Surface that count in `OrgKpiScopedEntryTable` and in the propagation preview dialog.
- **Tile-level rollup** on the Org KPI Data Entry tile: include an "Evidence: x/y rows" sub-count next to the existing Entered/Propagated chip (shared helper `deriveOrgKpiTileStatus`, mem §16/17).
- **Storage integrity guard**: nightly job (or on-demand "Verify Evidence" button) that flags `evidence_url` values whose storage object 404s and writes to `org_kpi_audit_log` (`ORG_KPI_EVIDENCE_BROKEN`).

### 2) Uploading **additional** supporting files on an Org KPI

Schema already supports it (`evidence_urls jsonb[]`); the UI does not.

Proposal — convert `OrgKpiFileUpload` into a true multi-file control:

- Render a chip-list of all current files (legacy `evidence_url` + every entry in `evidence_urls`), each with View / Remove.
- "+ Add file" button + Ctrl+V paste appends; total file count + cumulative size capped via `useUploadLimits` (per-file cap stays; add `max_org_kpi_files` setting, default 10).
- Save path: write the unified array into `evidence_urls`; mirror the first entry into `evidence_url` for backwards compat until a sweep migration retires the scalar column.
- Validation: dedupe by URL, sanitize filenames, keep the existing `org-kpi-evidence/` folder convention so the `iac_leaver_revoke` and storage RLS continue to work.
- Audit: emit `ORG_KPI_EVIDENCE_ADDED` / `ORG_KPI_EVIDENCE_REMOVED` per file with actor + URL hash.

This is a **purely additive** UI/storage change — no propagation contract changes.

### 3) Adding/replacing supporting **after** the data has propagated, without breaking workflow

Hard constraint we must preserve (POLICY §88, mem org-kpi-management-suite §13): once a per-employee `review_submissions` row has advanced past `self_review`, admin edits to the OKV must **not** silently mutate that employee's evidence — HR audit law. So we need an explicit, audited path.

Three options (pick one; recommend B):

**A. OKV-only addendum (lightest touch)**

- Admin can add files to `org_kpi_values.evidence_urls` at any time. Already-propagated employee rows are **not** touched.
- Pros: zero workflow disruption, immutable history.
- Cons: dashboard drift — employees never see the new evidence (fails Q4).

**B. Forward-only re-sync with explicit action (recommended)**

- New RPC `resync_org_kpi_evidence(p_okv_id, p_mode)` with two modes:
  - `append_only` — merges any **new** URLs into `review_submissions.self_evidence_urls` for every mapped employee regardless of stage, **without** stepping the workflow back or altering `achieved_value`. Replacements/removals are blocked in this mode.
  - `replace_with_stepback` — full replace; for rows already advanced past `self_review`, triggers the existing `request_org_kpi_revision` send-back flow per row (re-uses ADR-053 step-back guarantees in mem `workflow-resilient-status-stepback`).
- UI: an "Update supporting files" sheet on the OKV row showing per-employee current stage + the diff (added / removed / replaced) before commit, gated by `ConfirmDestructiveDialog`.
- Audit: `ORG_KPI_EVIDENCE_RESYNCED` per affected `kpi_id`, mirroring the per-KPI granularity rule (mem §14).

**C. Side-channel "Org KPI attachments" table**

- New `org_kpi_attachments(okv_id, url, added_by, added_at, visible_to_employees)` queried as a union by both the OKV editor and the per-employee Scorecard. No mutation of `review_submissions` ever.
- Pros: cleanest audit trail, no workflow risk.
- Cons: changes the read path on every employee-facing surface (Scorecard, KpiTimeline, KpiJourneySection, exports, reports) — large blast radius.

### 4) Parity between OKV Data Entry view and Employee Dashboard

Today they can diverge for three legitimate reasons: propagation snapshot immutability, employee overrides during self-review, and OKV edits made after advancement. We need observability, not forced equality.

Proposal — a **Parity panel** on the OKV editor (and a matching badge on the tile):

- **Parity badge per row** with three states:
  - `In sync` — every mapped employee's `self_achieved_value` / `self_evidence_urls` equals the current OKV snapshot.
  - `Drift: pre-propagation` — OKV updated, propagation pending (already covered by §16 tile chip; reuse).
  - `Drift: post-propagation` — at least one employee row diverges from current OKV (value or evidence). Hover reveals: "3 of 12 employees have different evidence; 1 employee has a different achieved value (self-edited)."
- **Drift drilldown** = reuse `OrgKpiImpactSheet` + new "Evidence diff" tab listing per-employee files vs OKV files.
- **Re-sync action** invokes the Option-B RPC from Q3 with the same audit/stepback semantics.
- **Source of truth contract** documented in POLICY: OKV is the source of truth **for new data and unadvanced rows only**; employee `review_submissions` is the source of truth **for any row that has progressed past `self_review**`. Drift is expected, not a bug — visibility + on-demand reconciliation is the control.

### Technical notes / risk

- All three Q3 options must respect `review_period_locks` and the `is_org_kpi_data_owner_for_profile` RLS (ADR-060) so non-admin data owners can't push files to employees outside their scope.
- Storage: keep `review-evidence/org-kpi-evidence/` prefix to inherit current RLS and leaver-revoke triggers.
- Propagation RPC stays untouched; the new resync RPC is a separate, narrowly-scoped function — does not re-introduce a second overload of `preview_org_kpi_propagation` (ADR-058).
- Tests required: multi-file upload UI, append-only resync vs replace-with-stepback, parity badge derivations, broken-link detection, snapshot immutability still holds for `achieved_value` after evidence-only resync.
- Memory updates on implement: extend `org-kpi-management-suite` with new §21 (multi-file evidence) and §22 (evidence resync contract); new ADR for the resync RPC + parity contract.

### What to decide next

Confirm before I plan implementation:

1. Multi-file UI scope — do we want per-file labels/captions or just URLs? - let's move with  "per-file labels/captions"
2. Q3 path — **B (recommended)**, A, or C? let's move with   "B"
3. Drift parity — show on tile + row, or row only? - show on tile + row
4. Whether to retire the scalar `evidence_url` column in a follow-up sweep, or keep dual-write indefinitely. - whichever will be best fit for this process. 