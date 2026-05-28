## Goal

Let a user edit **their own** observation comments — both the top-level **Observation** body and each **Reply** — within **24 hours** of posting, exactly like Facebook / LinkedIn:

- Inline edit (textarea replaces the bubble in place)
- "Save" / "Cancel" buttons
- After save, an "(edited)" marker appears next to the timestamp
- After 24h, the Edit action disappears
- Author-only; other users never see Edit

## Assumptions

1. Scope = the author's **own** observation reply text and observation description (the two free-text comment fields visible in the screenshot). Attachments and mentions are **not** re-editable in v1 (keeps surface small; can extend later).
2. 24h window is measured from `created_at` and enforced both in UI and in DB (RLS / trigger). Hardcoding 24h is acceptable per spec; we keep the constant in one place (`OBSERVATION_EDIT_WINDOW_HOURS = 24`) for future config.
3. Admin override is **out of scope** — admins also follow the 24h rule (matches FB/LinkedIn parity, simplest correct).
4. No edit history table in v1 — only `edited_at` timestamp. (We can add `kpi_observation_reply_edits` later if audit needs it.)

## Risk & Impact

| Area | Impact |
|------|--------|
| Data | Additive: 2 nullable `edited_at` columns. Existing rows unaffected. No backfill. |
| Workflow | None — edits don't change status, scores, notifications, or @mentions. |
| UI | Pencil icon appears on the user's own bubble while within 24h; inline editor replaces bubble during edit. |
| Regression | Low — confined to ObservationReplyThread + ObservationCard. Read paths unchanged. |
| Security | RLS UPDATE policy restricts to `auth.uid() = author AND created_at > now() - interval '24 hours'`. Trigger forbids mutating any column other than `reply_text` / `description` / `edited_at`. |
| Scalability | Same query patterns; one extra column read. |
| Rollback | Drop the 2 columns + RLS UPDATE policies. Fully additive. |

## UI Plan (FB/LinkedIn-style)

### Reply bubble (per row in `ObservationReplyThread`)

Default state:
```
[avatar]  Shekhar Sharad  28 May 2026, 06:43  (edited)        [✏️] [🗑️]
          @Jaspal as per my understanding ...
          📎 Attachment 1
```
- `✏️` pencil shown only if `auth.uid() === reply.reply_by` AND `now - created_at < 24h`.
- `(edited)` shown only if `edited_at IS NOT NULL`, in muted 10px text right after the timestamp.

Edit state (in-place, replaces the text line):
```
[avatar]  Shekhar Sharad  28 May 2026, 06:43
          ┌────────────────────────────────────────┐
          │ @Jaspal as per my understanding ...    │  ← MentionTextarea (rows=3)
          └────────────────────────────────────────┘
          [Save]  [Cancel]    ⏱ 23h 12m left
```
- Reuses `MentionTextarea` so existing @ rendering keeps working (mentions remain visible, but **no new notifications** are sent on edit — pure text revision).
- `Save` disabled if empty or unchanged. Shows spinner while saving.
- Live countdown chip ("23h 12m left") updates every minute; when it hits 0, editor auto-closes with toast "Edit window expired."

### Observation top bubble (CONCERN block in screenshot)

Same pattern applied to the observation's **description** text (`"PF does not apply to retention allowance."`):
- Pencil already exists in the header (top-right ✏️). Today it likely opens a full edit dialog — we keep that for owner edits within 24h, and add the same `(edited)` marker after the timestamp.
- Outside the 24h window, hide the pencil for the author (admins also hidden, per assumption #3).

### Responsive

- Pencil & trash icons collapse into a `⋯` overflow menu below `sm` breakpoint to avoid crowding the timestamp row (matches existing trash button placement).

### Visual tokens

All colors via existing semantic tokens (`text-muted-foreground`, `text-primary`, `border-border`). No new colors.

## Implementation

### 1. DB migration (additive)

```sql
ALTER TABLE public.kpi_observation_replies
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

ALTER TABLE public.kpi_observations
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- Reply: author may UPDATE within 24h
CREATE POLICY "Authors can edit own reply within 24h"
  ON public.kpi_observation_replies
  FOR UPDATE TO authenticated
  USING (auth.uid() = reply_by AND created_at > now() - interval '24 hours')
  WITH CHECK (auth.uid() = reply_by AND created_at > now() - interval '24 hours');

-- Observation: author may UPDATE description within 24h
CREATE POLICY "Authors can edit own observation within 24h"
  ON public.kpi_observations
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by AND created_at > now() - interval '24 hours')
  WITH CHECK (auth.uid() = created_by AND created_at > now() - interval '24 hours');

-- Guard trigger: only reply_text/description + edited_at may change via this policy
CREATE OR REPLACE FUNCTION public.guard_observation_reply_edit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.observation_id <> OLD.observation_id
     OR NEW.reply_by <> OLD.reply_by
     OR NEW.created_at <> OLD.created_at
     OR COALESCE(NEW.evidence_urls::text,'') <> COALESCE(OLD.evidence_urls::text,'') THEN
    RAISE EXCEPTION 'Only reply_text may be edited';
  END IF;
  NEW.edited_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_guard_observation_reply_edit
  BEFORE UPDATE ON public.kpi_observation_replies
  FOR EACH ROW EXECUTE FUNCTION public.guard_observation_reply_edit();
```
(Mirror trigger for `kpi_observations` restricting writable cols to `description`, `evidence_urls` excluded.)

### 2. Hook — `src/hooks/useObservationReplies.ts`

Add `useUpdateObservationReply({ id, replyText })` mutation: UPDATE row, invalidate `['observation-replies', observationId]`.

Add `useUpdateObservation` similar for observation description.

### 3. Component — `src/components/review/ObservationReplyThread.tsx`

- Add `editingReplyId` local state and `editingText`.
- Render pencil button only when `user?.id === reply.reply_by && isWithinEditWindow(reply.created_at)`.
- When editing, swap `<p>` for `<MentionTextarea>` + Save/Cancel + countdown chip.
- Append `<span className="text-[10px] text-muted-foreground italic">(edited)</span>` when `reply.edited_at` set.

### 4. Component — Observation card (locate during build, e.g. `ObservationCard.tsx` / wherever the top bubble is rendered)

Same pattern applied to `description`.

### 5. Util — `src/lib/editWindow.ts`

```ts
export const OBSERVATION_EDIT_WINDOW_HOURS = 24;
export function isWithinEditWindow(createdAt: string): boolean { … }
export function remainingEditMinutes(createdAt: string): number { … }
```

## Tests

- `src/test/editWindow.test.ts` — pure unit tests: in-window, exactly at boundary, expired, invalid date.
- Component test (vitest) for `ObservationReplyThread`: pencil visible only for author within 24h; hidden after; `(edited)` rendered when `edited_at` set; Save calls mutation with trimmed text.

## Docs

- `DOCUMENTATION.md` → new section "Comment editing — observations & replies" with 24h rule, RLS, `edited_at` semantics.
- `POLICY.md` → policy entry: "Authors may edit their own observation/reply text within 24 hours of posting. After 24h the text is immutable. Edits do not re-trigger notifications. An `(edited)` marker is shown publicly."
- Memory file `mem://features/review/observation-comment-edit-window` and add to `mem/index.md`.

## Out of scope (explicit)

- Editing attachments / mentions
- Edit history / diff viewer
- Admin override
- Editing acknowledgement, status, resolution notes, or workflow fields

## Verification

1. As author, within 24h: pencil visible → edit → "(edited)" appears, content updated.
2. As author, after 24h (simulate via SQL backdate): pencil hidden, RLS blocks direct UPDATE.
3. As another user: pencil never visible, direct UPDATE blocked by RLS.
4. Trigger blocks attempts to change `evidence_urls` / `reply_by`.
5. Notifications table unchanged after an edit (no new rows).
