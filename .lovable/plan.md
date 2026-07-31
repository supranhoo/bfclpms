## Goal

Show the **first submission / first action date** on every Review Journey stage card (Self, Manager, Skip-Level, HR PMS, Auditor, Management) as small gray text in the card header — **visible only to Admins**.

## Assumptions

- "1st submission" = the earliest immutable `kpi_audit_logs` entry for that stage on that KPI. It stays fixed even if the KPI is sent back and re-submitted (`review_submissions.submitted_at` is overwritten on resubmit, so it is not usable for this).
- Admin = `effectiveRole === 'admin'` from `AuthContext` (same gate used elsewhere, so the admin role-switch masking is respected).
- Presentation-only change — no schema, no writes, no workflow logic.

## Risk & Impact

- **Data impact:** none. Read-only, uses the audit-log query that `KpiJourneySection` already runs (`['kpi-journey-audit-logs', kpi.id]`) — no extra network calls.
- **Workflow/permission impact:** none. Non-admins see the card exactly as today.
- **UI impact:** one extra line of `text-[10px] text-muted-foreground` in the stage-card header row (the red-boxed area in your screenshot). Cards keep their height on mobile because the date sits inline next to the title, wrapping only when needed.
- **Regression risk:** low; the only shared component touched is `ReviewStageCard`, and the new prop is optional so all other call sites are unchanged.
- **Scalability:** derivation is an O(n) pass over already-loaded logs, memoized.

## Step-by-step

1. **New SSOT module `src/lib/review/stageFirstActionDate.ts`**
   - Export `STAGE_FIRST_ACTION_ACTIONS`: stage → set of qualifying audit actions.
     - `self`: `SELF_REVIEW_SUBMITTED`, `BACKFILL_SELF_REVIEW_SUBMITTED`, `ADMIN_DATA_ENTRY_SELF`
     - `manager`: `MANAGER_FORWARDED`, `MANAGER_NA_CONFIRMED`, `BACKFILL_MANAGER_REVIEWED`, `ADMIN_DATA_ENTRY_MANAGER`
     - `skip_level`: `SKIP_LEVEL_FORWARDED`, `BACKFILL_SKIP_LEVEL_REVIEWED`, `ADMIN_DATA_ENTRY_SKIP_LEVEL`
     - `hr_pms`: `HR_PMS_FORWARDED`, `HR_PMS_NA_CONFIRMED`, `BULK_STAGE_SIGNOFF_HR_PMS`, `BACKFILL_HR_PMS_REVIEWED`, `ADMIN_DATA_ENTRY_HR_PMS`
     - `auditor`: `AUDITOR_REVIEWED`, `AUDITOR_FORWARDED`, `BULK_STAGE_SIGNOFF_AUDITOR`, `BACKFILL_AUDITOR_REVIEWED`, `ADMIN_DATA_ENTRY_AUDITOR`
     - `management`: `MANAGEMENT_APPROVED`, `BACKFILL_MANAGEMENT_REVIEWED`, `ADMIN_DATA_ENTRY_MANAGEMENT`, `ADMIN_BULK_OVERRIDE_FORCE_APPROVE`
   - Export `resolveStageFirstActionDates(logs)` → `Record<stage, string | null>` returning the **earliest** `created_at` per stage (generic `STATUS_TRANSITION` rows are ignored to avoid false positives).
   - *Verification:* unit test with a log fixture containing a submit → send-back → re-submit sequence; asserts the first date wins.

2. **`ReviewStageCard.tsx`** — add optional props `firstActionAt?: string | null` and `showFirstActionDate?: boolean`. When both are set, render in the header row, right of the title:
   `1st: 05 Jun 2026` in `text-[10px] text-muted-foreground` with a tooltip `First recorded action at this stage (admin-only)`. Nothing renders when the date is unknown.

3. **`KpiJourneySection.tsx`** — memoize `resolveStageFirstActionDates(auditLogs)` (logs are already fetched here), read `effectiveRole` from `useAuth()`, and pass `firstActionAt={firstActionDates[stage]}` + `showFirstActionDate={effectiveRole === 'admin'}` into each `ReviewStageCard`. Same wiring for the "Previous Months" mini-cards is **out of scope** (they use a separate compact renderer).

4. **Docs/policy sync** — add `docs/adr/ADR-209.md` (Stage first-action date visibility) and a `POLICY §AR-STAGE-FIRST-ACTION-DATE` entry stating: date derives from the earliest stage audit action, never from `submitted_at`, and is admin-only.

## UI changes (exact)

- **Where:** Review Journey stage cards inside the KPI review sheet (`KpiReviewPanel` → `KpiJourneySection`) — the header row of each card, exactly the red-boxed spot in your screenshot.
- **What:** small gray `1st: DD MMM YYYY` label, tooltip on hover/tap.
- **Interaction:** none; purely informational, no layout shift for non-admins.
- **Responsive:** the label sits in a flex header with `min-w-0` + wrap so narrow mobile cards push it to a second line rather than truncating the stage title.

## Tests

- `src/test/stageFirstActionDate.test.ts` — earliest-wins, resubmit ignored, unknown stage → null, backfill/admin-data-entry actions counted, `STATUS_TRANSITION` ignored.
- `src/test/reviewStageCardFirstActionDate.test.tsx` — renders the date when `showFirstActionDate` is true, renders nothing when false or when the date is null.
