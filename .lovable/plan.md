## Confirmation — this is already the intended behaviour

The requested rule is already what the system implements end-to-end. I verified against the live DB and the badge/label SSOT.

### Live-data check — Anup Kumar Jha (101708)

Instance `c293ebc0…` after the ADR-137 repair now shows:

| Field | Value |
|---|---|
| `overall_status` | `pending_bu` |
| `enabled_stages` | `[self, bu_head]` |
| `dept_head_id` | `NULL` |
| `bu_head_id` | Sindhu Raj Singh (101089) |

So the review is correctly routed to the BU Head, and Dept Head has been dropped from the workflow.

### Badge/label SSOT — `src/lib/annualReview/constants.ts`

```
pending_dept: 'Dept Head Review Pending'
pending_bu:   'BU Head Review Pending'
```

Because the underlying status is `pending_bu`, every consumer (queue tile, header badge, stepper) already renders **"BU Head Review Pending"**. The stepper also renders "1 stage auto-skipped: Dept Head (same reviewer at a higher stage)" — proof the collapse is applied.

### Why the screenshot still shows "Dept Head Review Pending"

The screenshot in your message was captured before the ADR-137 migration finished normalising the row. The page is displaying a cached React Query snapshot from that pre-migration read. A hard refresh (or letting the queue's periodic refetch run) will replace the badge with "BU Head Review Pending" — no code change required.

### Verification steps for you

1. Open Anup's review from your queue and click the browser refresh once.
2. Header badge should read **"BU Head Review Pending"**.
3. Stepper should show only two nodes: 1 · Self Review — 2 · BU Head, with the "Dept Head auto-skipped" note above.

If any admin/queue view still shows the old label after a refresh, share that specific screen and I'll trace the stale cache key — but there's no logic gap to build against right now.

## Plan

**No changes needed.** This is a verification-only response. If after your refresh you still see the old label anywhere, I'll investigate that specific surface's cache invalidation.
