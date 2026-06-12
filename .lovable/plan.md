## Goal

Stop the Incidents list's **Due / Remaining** column from showing a stale SLA due-date and a misleading "in N days" / "overdue by" countdown after an incident has been closed (or orphaned). The SLA column already handles closure correctly via `sla_status` — only the date cell next to it is wrong.

## Where

`src/pages/safety/SafetyIncidents.tsx` — the desktop table cell at lines ~393–405 that renders `sla_due_at` + `formatDistanceToNowStrict(...)`. No other surface uses this exact rendering.

## What changes (UI only)

For any row whose `status` is `closed` or `orphaned`:

- Replace the SLA due date + countdown with the **actual close time**:
  - If `closed_at` is set → `"Closed dd MMM yyyy, HH:mm"` in muted text.
  - Else (orphaned without `closed_at`) → `"—"`.
- The countdown ("in 14 days" / "overdue by …") is suppressed entirely for terminal rows.

Open / in-progress rows are unchanged — they keep the existing `sla_due_at` + "in N / overdue by N" line.

Mobile card view (`SafetyMobileListCard`) does not render this column, so no mobile change.

## Why this is the right fix

- `status` is the canonical terminal flag (POLICY §workflow-status-convention).
- `sla_due_at` is preserved on closed rows for audit/history but is not a live deadline once closed; showing a future countdown next to a "Closed" status badge is contradictory.
- The SLA badge column already uses `sla_status` (`closed_on_time` / `closed_late`) to convey the post-closure outcome, so Due/Remaining only needs to show *when* it closed, not *when it was due*.

## Risk & impact

- **Data:** none — read-only display change.
- **Workflow / RLS / scoring / backup:** none.
- **UI:** Due/Remaining column for ~all historical closed rows will switch from a date+countdown to a "Closed …" timestamp. The SLA badge already communicates on-time vs late, so no information loss.
- **Regression risk:** very low; the change is gated on `status in ('closed','orphaned')`.

## Test

Add a focused render test in `src/test/safety/` that mounts the row cell logic with three fixtures — `open` (countdown shown), `closed` with `closed_at` (shows "Closed …", no countdown), and `orphaned` without `closed_at` (shows "—") — and asserts the relevant text/absence.

## Docs

- `DOCUMENTATION.md` v2.66.21.1 — one-line UI fix note.
- No POLICY.md change (display refinement, no policy shift).
- No memory file (too small to warrant one).

## Rollback

Revert the single-file diff in `SafetyIncidents.tsx`.
