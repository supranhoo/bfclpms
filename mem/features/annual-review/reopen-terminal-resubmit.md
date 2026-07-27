---
name: Re-open requires terminal re-submit
description: Re-opened/sent-back annual reviews keep the terminal reviewer's scores as an unlocked draft; completion still needs an explicit re-submit
type: feature
---
POLICY §AR-REOPEN-REQUIRES-TERMINAL-RESUBMIT (ADR-185).

- Re-opening a completed review, or a send-back, unlocks the terminal response and clears instance aggregates but PRESERVES that reviewer's entered scores. Preserved scores = draft, not a submission.
- Never infer completion from the presence of stage scores. Completion = `is_locked` + `submitted_at` on every enabled stage.
- Classify/label this state only via `src/lib/annualReview/reopenTerminalSignoff.ts` (`resolveTerminalSignoffState`, `terminalSignoffLabel` → "Scored draft — awaiting re-submit").
- Admin finalisation from a preserved draft must derive aggregates with `annual_review_compute_final_summary`, lock the response with scores intact, and snapshot the before-state into a dated audit table (`performed_by = NULL`) for rollback.
- Scope bulk finalisation by explicit instance whitelist, never a status-only sweep.
- Applied 2026-07-27 to 100508 (51.00 Poor) and 101676 (58.20 Average); audit in `annual_review_bu_draft_finalise_2026_07`.
