## Goal
Add **Previous / Next** navigation buttons in `EvidencePreviewDialog` so users can flip through sibling evidences (e.g. a KPI's multi-file self-evidence, all Day_1..Day_31 evidences) without closing the preview and clicking each thumbnail.

## UX
- New icon buttons (`ChevronLeft`, `ChevronRight`, `variant="outline" size="sm"`) placed to the left of the "Fullscreen" button.
- Small "2 / 5" counter between them.
- Hidden entirely when the current preview is a single, standalone evidence (no siblings).
- Disabled at the ends (no wrap-around).
- Keyboard: `←` / `→` while the dialog is open.
- Header title updates to the newly selected file. Loading spinner shows while the next file resolves.
- Closing + reopening a different group resets navigation.

## Data flow — group-aware dispatch
`openStorageFile()` currently dispatches one file at a time. Extend the payload so callers that have a list can pass siblings:

```ts
type EvidenceGroupItem = { url: string; fileName?: string | null };
openStorageFile(url, fileName, { group?: EvidenceGroupItem[], index?: number })
```

- `evidence-preview` CustomEvent `detail` becomes `{ url, fileName, group?, index? }`.
- Backward compatible: single-file callers keep working unchanged (no Prev/Next shown).
- `EvidencePreviewProvider` stores `group` + `index` in state; Prev/Next mutate `index` and re-set `detail` to `group[index]`, which re-runs the existing resolve effect.

## Call-site updates (all existing multi-file loops)
Replace the per-URL `forEach(openStorageFile)` pattern with a single call that passes the whole group, opening the first item:

- `src/components/review/WeeklySubmissionTable.tsx` (weekly evidences per week)
- `src/components/review/DailySubmissionSummary.tsx` (day evidences)
- `src/components/review/DailySubmissionGrid.tsx` (day evidences)
- `src/components/review/SelfReviewSheet.tsx` (self evidence chips — each button opens one file; pass the full `selfEvidenceUrls` array as group with the clicked index)
- `src/components/review/ReviewTrailCard.tsx` (Self / Manager / Auditor / Management chip rows — pass that stage's `urls` array + `idx`)
- `src/components/review/ReviewTrailCardCompact.tsx` (same pattern)
- `src/components/review/ReviewStageCard.tsx` (stage's `evidenceUrls` + `idx`)
- `src/components/review/ObservationCard.tsx`, `ObservationReplyThread.tsx` (per-message evidence arrays)
- `src/components/admin/OrgKpiAuditCard.tsx`, `OrgKpiEvidenceManagerSheet.tsx` (KPI's evidence list)
- `src/components/ui/MultiFileUpload.tsx` (uploaded files list)

Single-file sites left untouched: `QueryHistoryDialog`, `QueryInbox`, `PreviousLevelRemarks`, `InboxDetailSheet`, `EvidenceUpload`, `OrgKpiFileUpload`.

## Scope guard
- Pure UI + event-payload change. No DB, no RLS, no policies, no hooks/logic changes.
- `openStorageFile` signature stays backward-compatible (third arg optional).
- Test `src/test/review/evidencePreview.test.ts` continues to pass — the dispatch shape is a superset.

## Risk
Low. Isolated to evidence preview UX. Rollback = revert the touched files.

## Not Applicable
DB migration, RLS, POLICY.md, backup — none affected.
