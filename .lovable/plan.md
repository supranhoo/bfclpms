# Risk & Impact Report

- **Data impact**: One backend access-rule mismatch is causing the page to read KPI definitions successfully but fail to read the corresponding propagated submission facts for some users. If fixed correctly, no historical business data needs to be rewritten just to restore truthful display.
- **Workflow impact**: The current UI can mislead admins/data owners into thinking propagated rows are still pending, which can trigger duplicate propagation attempts and distrust in the process.
- **UI/UX consistency**: Two regressions exist: the summary badges were hidden unless both counts were non-zero, and per-row status depends on a fallback read path that is not returning the true propagated facts for affected sessions.
- **Regression risk**: Medium. The Org KPI page already has multiple status sources (`kpis.status`, `org_kpi_values.status`, `review_submissions`, snapshot RPC). Fixing only one surface would reintroduce drift.
- **Mitigation plan**: Fix the backend access contract first, then simplify the frontend to consume one fact-based source consistently, and lock it with targeted tests for both admin and data-owner paths.

# What I verified

- **The underlying business data does not support “all not propagated.”** Sample employees visible in your screenshot already have:
  - `review_submissions` rows present
  - achieved value `100`
  - KPI stages advanced beyond `kra_set`
- **The current page is therefore reading the wrong truth source for your session.**
- I also confirmed a separate UI regression:
  - the summary line is intentionally hidden by `showStatusBreakdown = propagatedCount > 0 && notPropagatedCount > 0`
  - so even a truthful `0 propagated / 50 not propagated` or `50 propagated / 0 not propagated` would disappear

# Root Cause Analysis

## Root Cause 1 — backend truth is not readable through the fallback path
The per-row badge now depends on `useOrgKpiSubmissionFallback`, which reads propagated truth from `review_submissions`.

But the access rule for data owners on `review_submissions` joins `org_kpi_data_owners` using **exact text equality** on `kra_name` and `kpi_name`, while the Org KPI snapshot and newer KPI visibility logic use **normalized matching**.

That means a user can:
- see the KPI definition in the Org KPI page
- but fail to read the corresponding propagated submission rows

Result:
- `submissionFallbackMap` is empty or incomplete for that user
- rows fall back to `OKV entered`
- the UI shows **Not propagated** even though the scorecard already contains data

This matches the live evidence I checked.

## Root Cause 2 — summary badges were hidden by UI logic
The header summary is only rendered when both conditions are true:
- at least one row is propagated
- at least one row is not propagated

So the summary was removed from the UI even though you explicitly need that signal always visible.

## Root Cause 3 — the current design is still over-coupled
The page now combines:
- snapshot RPC for KPI definitions and mapping
- direct browser reads for `review_submissions`
- `org_kpi_values.status` as a secondary signal

That creates a fragile multi-source contract. Even if each piece is individually valid, they can disagree under RLS or normalization drift.

# Corrective Plan

## 1. Fix the backend access contract for propagation truth
Create a backend change so data-owner reads of propagated submission facts use the **same normalized KPI matching** as the snapshot path.

Preferred fix:
- update the data-owner `review_submissions` visibility rule to use normalized `kra_name` and `kpi_name` matching
- verify the same normalization is used consistently for insert/update rules if needed

Why first:
- without this, any frontend fix would still be guessing from incomplete data

## 2. Stop relying on raw browser-side submission joins for row truth
Refactor the Org KPI page so the propagated-state source comes from a single backend-aligned read model.

Safer options:
- either extend the existing snapshot RPC to include per-employee propagation fact
- or replace the direct fallback hook with a backend read path that already respects the same access semantics as the snapshot

Goal:
- the page should not separately reconstruct truth from a second RLS-sensitive path

## 3. Restore the summary and make it always visible
Update the scoped table header so it always shows a factual propagation summary when rows are present:
- `X propagated`
- `Y not propagated`

Rules:
- show both counts even when one side is zero
- keep the current entered count separately
- never hide the summary just because the distribution is one-sided

## 4. Make per-row status derive from one canonical fact contract
After step 1/2, keep the row logic simple:
- `approved` stays explicit
- `propagated` means propagated fact exists
- `entered` means value exists but propagated fact does not
- `pending` means no value/no propagated fact

This avoids mixing stale helper flags with scorecard truth.

## 5. Add regression protection
Add tests for all failure modes that matter here:

### Frontend tests
- summary is shown for:
  - mixed rows
  - all propagated
  - all not propagated
- row pill shows propagated when canonical propagated fact exists even if `org_kpi_values.status = 'entered'`

### Backend / contract tests
- data-owner normalized match can read submission facts when owner text differs only by punctuation/spacing/description formatting
- snapshot and propagated read model return consistent counts for the same KPI definition

## 6. Update policy and technical documentation atomically
Document the corrected rule:
- propagation truth is read from scorecard/submission fact, not helper flags
- all access paths for Org KPI truth must use the same normalized KPI identity contract
- summary counts must always remain visible to admins/data owners

# Expected outcome after implementation

For the case you raised, the page should return to a truthful state such as:
- **40 propagated / 10 not propagated** if 10 are genuinely missing scorecard entries
- or **50 propagated / 0 not propagated** if all 50 truly already have propagated scorecard data

Most importantly, it will stop showing **all Not propagated** for rows that already have scorecard submissions.

# Implementation order

1. Backend policy/read-model correction
2. Frontend canonical truth wiring
3. Summary visibility restoration
4. Regression tests
5. Documentation + policy sync