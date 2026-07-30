## Assumptions

- "Score < 2" refers to POLICY §15.2: monthly rating below 2 on the 5-point scale, sustained into the **third consecutive month**. The current default threshold constant in the app is `3.0` (`DEFAULT_PIP_THRESHOLD` in `src/lib/pmsSettings.ts`), read from `system_settings.pms_pip_threshold`. The suggestion engine will read the same setting so Admin stays in control (zero-hardcoding), with the policy value 2.0 as the recommended configured value.
- Suggestions are advisory only. They never auto-create a PIP; a human must initiate (POLICY §15.5).
- Verified in the database this turn: `performance_improvement_plans` has columns `id, employee_id, initiated_by, hr_reviewer_id, status, start_date, end_date, extended_end_date, reason, improvement_areas, success_criteria, hr_remarks, hr_approved_at, completion_remarks, outcome, created_at, updated_at`. There is **no** column recording *why* a PIP was triggered, and no `pip_candidates` table exists. Sibling tables `pip_milestones` and `pip_audit_logs` exist.

## Clarifications (answer while I build; safe defaults chosen)

1. Should the configured `pms_pip_threshold` be changed from 3.0 to 2.0 to match POLICY §15.2? Default: leave the stored value untouched, show it in the UI ("Threshold: X — configurable in Settings"), and surface a warning banner when it differs from the policy value of 2.0.
2. Consecutive-month window: default is the **last 3 completed months** (policy: "third consecutive month"), with a selector for 3 / 6 months.

## Risk & Impact Report

- **Data impact:** One additive migration — nullable `trigger_source text` and `trigger_context jsonb` on `performance_improvement_plans`, so a PIP records which rule surfaced it and the scores at initiation (POLICY §15.6 "supporting evidence", §15.13 audit). No column drops, no backfill required, existing rows stay NULL. Additive → included automatically in the RPC-driven backup coverage (no denylist entry).
- **Workflow impact:** None to the existing PIP lifecycle graph or `trg_pip_status_transition`. Suggestions sit *before* draft creation. Segregation of duties unchanged.
- **UI/UX impact:** New "Suggestions" tab in `PIPManagement.tsx` alongside the existing list. Existing list, filters and paging untouched.
- **Regression risk:** Low-medium. Main risk is reusing the heavy `get_monthly_trend` RPC (full-org aggregate) inside an admin page that currently loads instantly. Mitigated by making the tab opt-in (data fetches only when the tab is opened) plus client-side pagination of candidates.
- **Scalability:** `get_monthly_trend` already server-aggregates and is capped at 12 months; the suggestion query uses a 3-month window. Candidate list is paginated at 25/page and filtered server-side by BU/department where the RPC already supports it. No unbounded fetch.
- **Mitigation:** shared rule module (no logic duplication), unit tests on every rule branch, opt-in loading, additive schema only.

## What gets built

### 1. Rule engine (SSOT, no duplication)

`src/lib/pip/pipTriggerRules.ts` — extends the existing `isPipCandidate` rather than replacing it:

- `evaluateMonthlyTrigger(employee, monthKeys, threshold)` → uses the existing `isPipCandidate` (every month present **and** strictly below threshold; a missing month disqualifies). Returns `{ qualifies, months, scores, worstScore }`.
- `evaluateAnnualTrigger(finalAnnualRating, threshold)` → POLICY §15.3: annual rating **at or below** 2 qualifies (note the ≤ vs < asymmetry with the monthly rule — this is per policy, and is covered by an explicit test).
- `resolveTriggerReason(...)` → human-readable string used to prefill the PIP `reason` field, e.g. *"Monthly rating below 2.0 for 3 consecutive months (Apr 1.6, May 1.4, Jun 1.8) — POLICY §15.2."*
- `isSuppressed(candidate, existingPips)` → suppresses employees who already have a live PIP (`draft`, `pending_hr_approval`, `active`, `extended`) — POLICY §15.7 forbids overlapping PIPs — and flags those inside the 3-month post-PIP sustain window (POLICY §15.12) as **"Relapse — review for reopen"** instead of a fresh suggestion.

### 2. Data hook

`src/hooks/usePIPCandidates.ts`:

- Reads the threshold via existing `getPipThreshold()` / `pms_pip_threshold`.
- Calls `useMonthlyTrend` for the selected trailing window with `enabled` gated on the Suggestions tab being open and `includeInactive: false` (inactive employees are never suggested).
- Calls `usePIPs` for live/recent plans to apply suppression.
- Adds the annual trigger by reading the completed annual-review final rating for the current cycle (reuses the existing comprehensive-report RPC path; if the value is unavailable for an employee, the monthly trigger alone still applies and the row is labelled accordingly — no silent failure).
- Returns `{ candidates, threshold, thresholdMatchesPolicy, months, isLoading, error }`.

### 3. UI

`src/pages/admin/PIPManagement.tsx` — wrap existing content in tabs: **PIPs List** (current, unchanged) and **Suggestions** (new, badge showing candidate count once loaded).

Suggestions tab contents:

- **Controls row:** window selector (Last 3 / 6 months), trigger-type filter (Monthly / Annual / Both), BU + Department filters, employee search, and a read-only threshold chip. Amber inline note when threshold ≠ 2.0.
- **Candidate table** (shadcn `Table`, sticky header, `hover:bg-muted/50`, rows ≥ `h-10`): Employee (name, code, designation) · Department / BU · Reporting Manager · per-month score cells (destructive-toned when below threshold) · Trigger badge (Monthly §15.2 / Annual §15.3) · Status (`Eligible` / `Live PIP exists` / `Relapse in sustain window`) · Action.
- **Action:** "Initiate PIP" opens the existing `PIPCreateDialog` prefilled with the employee, a policy-worded `reason`, and default 30-day dates. Suppressed rows render a disabled button with a tooltip explaining why (never a silent no-op).
- **Empty state:** `ShieldCheck` icon + "No employees meet the PIP trigger criteria for this window" + a link to the Monthly Scorecard Trend report.
- **Loading:** `Skeleton` rows matching the table shape (not a spinner). Errors surface as a destructive inline alert with a Retry button.
- Client-side pagination, 25 rows/page, matching the existing `PIP_PAGE_SIZE` convention.

### 4. Policy guardrails added to `PIPCreateDialog`

These close real gaps against POLICY §15 that exist today regardless of the suggestions feature:

- **Duration 30–90 days** (§15.7) — zod validation on `end_date - start_date`, with the bounds read from PIP SLA settings rather than hardcoded.
- **Checkpoint cadence** (§15.7) — validate milestones are at least fortnightly/monthly and that the final milestone is on or before the end date.
- **No overlapping PIP** (§15.7) — block creation when the selected employee already has a live plan; message names the existing plan.
- **Evidence prefill** (§15.6) — when opened from a suggestion, the reason carries the KPI-score evidence and window; the trigger metadata is persisted to `trigger_source` / `trigger_context`.
- The dialog's employee dropdown currently fetches **all** profiles unpaginated and without an active filter — it will be switched to an active-only, server-side searched combobox.

### 5. Tests (`src/test/pip/pipTriggerRules.test.ts`)

Monthly trigger: 3 consecutive below → qualifies; one month at threshold → no; missing month → no; threshold unset → inert. Annual trigger: exactly 2 → qualifies (≤), 2.1 → no. Suppression: live PIP in each of the four live statuses → suppressed; completed 2 months ago → relapse label; completed 5 months ago → eligible. Reason string snapshot. Duration validator: 29 / 30 / 90 / 91 days.

### 6. Documentation & policy sync

- New `docs/adr/ADR-207.md` — PIP trigger suggestion engine.
- `POLICY.md` → new **§PIP-TRIGGER-SUGGESTIONS** recording the monthly/annual triggers, the configurable-threshold rule, suppression semantics, and that suggestions are advisory only.
- `DOCUMENTATION.md` version-history entry.

## Known policy gaps this plan does **not** close (flagged, not silently dropped)

These need separate decisions before I build them; say the word and I will fold any into this plan:

1. **RM2 / Dept-Head approval** (§15.5) — the current lifecycle has a single HR approval step, not the joint RM2 + HR approval the policy requires. - This should be created and Implimented with Option to keep this customisable.  
2. **Employee acknowledgment & comments** (§15.9) — no acknowledgment capture exists on a PIP today. - This should also be build and Employee will only see the PIP Tab if the employee is active in PIP window. 
3. **Post-PIP 3-month sustain monitoring** (§15.12) — this plan only *labels* relapse in the suggestions list; there is no monitoring record or reopen flow. - plan in detail how this can be achieved.  
4. **Support/resources field** (§15.6, Annexure F) — not currently captured on the PIP form. - This must be there in the form. 

## Rollback

Feature is additive and tab-gated. Rollback = revert the two new modules plus the tab block in `PIPManagement.tsx`; the migration's two nullable columns can be left in place harmlessly or dropped in a follow-up.