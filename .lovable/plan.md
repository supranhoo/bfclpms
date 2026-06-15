## Goal

When the employee clicks **Submit** on the annual self-review, replace the small text-only confirmation with a **scrollable summary modal** that displays everything about to be locked in, so the user can verify before final commit.

## UI Mockup (Summary Dialog)

```text
┌────────────────────────────────────────────────────────────────────────┐
│  Review your self-assessment before submitting               [ X ]    │
│  Once submitted, your responses are locked and forwarded to your       │
│  manager. You cannot edit them afterwards.                             │
├────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │  Total Score                                  18.40 / 25.00    │   │
│  │  Weighted achievement                                  73.6 %  │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  CRITERIA (5)                                                          │
│  ┌──────────────────────────┬────────┬────────┬────────┬──────────┐   │
│  │ Criterion                │ Weight │ Score  │ Total  │ Remark   │   │
│  ├──────────────────────────┼────────┼────────┼────────┼──────────┤   │
│  │ Attendance               │   20%  │ 5      │  1.00  │ —        │   │
│  │ उपस्थिति                  │        │ Always │        │          │   │
│  │                          │        │ on time│        │          │   │
│  ├──────────────────────────┼────────┼────────┼────────┼──────────┤   │
│  │ Quality of Work          │   30%  │ 4      │  1.20  │ "Improved│   │
│  │                          │        │        │        │  defect …│   │
│  └──────────────────────────┴────────┴────────┴────────┴──────────┘   │
│                                                                        │
│  QUALITATIVE RESPONSES (5)                                             │
│  • Best work this year                                                 │
│    "Led the new mill commissioning ahead of schedule."                 │
│  • Problem in daily work                  ⚠ Required — empty           │
│    —                                                                   │
│  • Tools / training needed                                             │
│    "Need advanced PLC training."                                       │
│  …                                                                     │
│                                                                        │
│  EVIDENCE (3 files)                                                    │
│  • Attendance → muster_dec.pdf                                         │
│  • Quality    → quality_chart.png, audit_report.pdf                    │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│                              [ Cancel ]   [ Confirm & Submit ]  ⏳    │
│                                            (disabled if ⚠ exists)     │
└────────────────────────────────────────────────────────────────────────┘
```

- Score banner uses `bg-muted` card.
- Criterion rows show the **translated name** (per `display_mode`) under the English when bilingual, and the selected option label when criteria use option cards.
- Empty required qualitative fields render in red with a `⚠ Required — empty` chip and disable the **Confirm & Submit** button.
- Modal is `max-w-3xl`, `max-h-[85vh]`, content area scrollable; sticky footer.
- Mobile (<640 px): table collapses to stacked rows (Criterion / Weight × Score = Total label + value pairs); modal becomes full-screen.

## Current Behavior
`EmployeeAnnualReview.tsx` shows a tiny `AlertDialog` with just one body line. User has no chance to review entries before they're locked.

## Plan

### 1. New component — `src/components/annual-review/SelfReviewSummaryDialog.tsx`
A shadcn `Dialog` rendered in place of the current `AlertDialog`. Props: `template`, `draft`, `summary`, `evidenceByCriterion`, `open`, `onOpenChange`, `onConfirm`, `submitting`. Sections in render order: Header → Score banner → Criteria table → Qualitative Responses → Evidence → Footer. All text resolved through the existing `useAnnualReviewI18n()` (`t` / `tTemplate` / `tTemplateBilingual`) so the summary follows the active language and the per-template `display_mode`.

### 2. Wire-up — `src/pages/annual-review/EmployeeAnnualReview.tsx`
- Remove the current `AlertDialog` block.
- Mount `<SelfReviewSummaryDialog>` controlled by the existing `confirmOpen` state.
- Pass `submitting={advance.isPending}` and `onConfirm={handleSubmit}`.
- Call `flush()` once when opening the dialog so the summary reflects the latest unsaved edits.

### 3. Lightweight validation
If a `self_review_fields` row is `required` and the response is empty, surface the warning chip in the summary and disable **Confirm & Submit**.

### 4. Tests — `src/test/annualReview/selfReviewSummaryDialog.test.tsx`
- Renders translated criterion names + option labels under `bilingual` and `english_only` modes.
- Disables `Confirm & Submit` when a required qualitative field is empty.
- Calls `onConfirm` exactly once on confirm click.

### 5. Docs / Policy
- `src/modules/annual-review/DOCUMENTATION.md` — add a "Submit confirmation" section.
- `src/modules/annual-review/POLICY.md` — note: required qualitative fields block self-submit; values shown in the summary are the values persisted (no transformation).

## Out of Scope
- No backend / RPC change.
- No edits to manager / skip / HR review dialogs.
- No change to the post-submission `EmployeeResultsView`.

## Risk & Impact
- **Data:** none — read-only display from the same `draft` used today.
- **Workflow:** Submit gating tightens slightly (required-empty fields now blocked at confirm step instead of silently submitting `""`).
- **UI:** New modal on Submit click; everything else unchanged. Responsive down to 360 px.
- **Regression:** Low — local to one page + one new component.
- **Scalability:** Renders only the current employee's draft (≤ ~20 criteria + ≤ ~10 fields).
