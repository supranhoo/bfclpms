## Why Edit / Delete look "non-functional"

The buttons in the screenshot belong to `RulesTab` in `src/pages/annual-review/AnnualReviewAdmin.tsx` (lines 1979–2098). They do fire — but their side effects are invisible from where the user is standing:

### Edit — no visible change
Clicking Edit calls `setDraft({...r})`, which populates the **"Edit rule" card that lives ABOVE the table** (line 2033). By the time a user is looking at the rules list, that card is scrolled far off screen (past all six Audience Filter blocks). No scroll, no highlight, no dialog — so the click looks like a no-op.

### Delete — silent + destructive
`del.mutate(r.id)` runs `svc.deleteRule` immediately with:
- No `AlertDialog` confirmation (violates the BFCL UI destructive-actions standard).
- No `onError` handler on the mutation — a failing RLS / FK constraint (rules can be referenced by seeded instances) is swallowed with zero feedback.
- No visible optimistic removal — user may not realise the row went away after `refetch()`.

## Fix plan (surgical, RulesTab only)

1. **`AnnualReviewAdmin.tsx` → `RulesTab`**
   - **Edit:** after `setDraft(...)`, scroll the "Edit rule" card into view and briefly highlight it (`scrollIntoView({ behavior: 'smooth', block: 'start' })` on a ref attached to the Card). Change the button style to `variant="outline"` with a `Pencil` icon so the affordance reads as active. Rename the CardTitle to `Editing "<rule name>"` when a draft id is present so context is obvious.
   - **Delete:** wrap the button in `AlertDialog` (shadcn) with a destructive confirm ("Delete rule '<name>'? Employees currently resolved to this rule will fall through to the next matching one."), use `variant="ghost"` trigger with a `Trash2` icon + `text-destructive`, and add `onError: (e) => toast.error(e.message)` to `del`.
   - Add `aria-label` to icon-only buttons per BFCL a11y standard.

2. **Empty / no-cycle affordance**
   - When no cycle is picked, the whole rules card is hidden — leaving the audience filters looking like the whole page. Add a small inline hint ("Pick a cycle above to load its rules.") so users don't think the buttons are what's broken.

3. **Tests**
   - New unit test `src/test/annualReview/rulesTabActions.test.tsx`: renders `RulesTab` with a mocked cycle+rules, clicks Edit → asserts draft form is populated + scrollIntoView called; clicks Delete → asserts confirm dialog appears and `deleteRule` is only called after confirm; asserts toast fires on mutation error.

## Not in scope

- No changes to the DB, RLS, or the delete/upsert services.
- No refactor of the rest of `AnnualReviewAdmin.tsx` (large file, out of scope).

## Risk & rollback

- Data impact: none — behaviour of the two mutations is unchanged; only the UX around them is fixed.
- Regression risk: low; changes are UI-local to `RulesTab`.
- Rollback: revert the two edited files.

Approve to proceed.