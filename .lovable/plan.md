## Root cause

The "Refresh coverage" button works — it re-runs `checkMappingCoverage(cycle.id)` which refetches profiles, rules, and instances fresh from the DB (no client cache).

What's actually happening in the screenshot:
- A broad rule ("Generic W with env (Functional)") already covers **2330** employees.
- The new "CPP – W – E&I" rule was saved with `priority = (rulesCount + 1) * 10`, giving it a **higher** priority number.
- `resolveTemplateForProfile` sorts rules ascending by priority and returns the **first** match, so the broad rule always wins and the new rule resolves to **0 employees** — even though refresh ran correctly.

The UI never surfaces this: the user sees "coverage refreshed, but my new rule shows 0", and reasonably concludes refresh is broken.

## Fix (surgical, UI + one service tweak)

1. **Assign new rules the *highest* precedence, not the lowest**
   `src/pages/annual-review/AnnualReviewFormMapping.tsx` — in the `commit` mutation, compute:
   ```ts
   const minExisting = rules.reduce((m, r) => Math.min(m, r.priority ?? 100), 100);
   const priority = Math.max(1, minExisting - 10);
   ```
   Rationale: the audience builder is used to add specific overrides on top of broad defaults, so newly-created rules should win by default. Existing rules keep their priorities untouched (additive change, safe rollback = revert the two lines).
   Pass `rules` (not just `rulesCount`) into `AudienceBuilder`.

2. **Bust the in-memory KRAs cache on refresh** (defensive)
   `src/services/annualReview/formMapping.ts` — export the reset helper's use: call `_resetKrasCacheForTests()` at the top of `checkMappingCoverage` (rename to `_resetKrasCache` — drop the `ForTests` suffix to reflect its new production role). Guarantees that toggling the "Has KRAs in last N months" filter and pressing Refresh recomputes against fresh KRAs, not a memoised set from the previous render.

3. **Show why a new rule matched 0 employees**
   In `AudienceBuilder`'s post-save state, when `previewQ.data.total > 0` but the freshly-saved rule's `report.rows` count for its `template_id` is 0, show an inline hint:
   > "Saved, but a higher-priority rule (‹name›) already covers these employees. Reorder rules or narrow the earlier rule."
   Requires reading `coverageQ.data` in the builder — pass it down from the parent alongside the existing `onCommitted` prop.

4. **Explicit toast copy**
   Change `toast.success('Rule saved. Coverage will refresh.')` → `toast.success('Rule saved. Recalculating coverage…')` and, once `coverageQ.refetch()` resolves, `toast.success('Coverage updated.')` (chain in `onCommitted`).

## Risk & impact

- **Data**: none. No schema change, no migration, no RLS change. Priorities on existing rules are untouched.
- **Workflow**: newly-created rules will now take precedence over older broad rules — this is the *intended* behaviour of the audience builder ("map this template to this audience"). Admins who relied on the old ordering can still adjust priority manually via the rules table.
- **UI**: only the audience builder card changes (priority calc + inline hint + toast). Coverage banner, templates-in-use panel, and unmapped table are untouched.
- **Regression**: minimal. Covered by a new unit test.

## Tests

`src/services/annualReview/formMapping.test.ts` — add cases:
- "newly-added higher-priority rule wins over older broad rule" — mocks two rules and asserts `resolveTemplateForProfile` returns the new one.
- "checkMappingCoverage refetches KRAs after cache reset" — asserts the cache is cleared between two calls.

`src/pages/annual-review/AnnualReviewFormMapping.test.tsx` (new, minimal) — assert that on `commit.mutate` success the computed `priority` is `min(existingPriorities) − 10`.

## Documentation / policy

- `DOCUMENTATION.md` → Form Mapping section: document the "new rules win" precedence rule and the inline hint.
- `POLICY.md` → Annual Review > Form Mapping: add "Rule precedence: newly-created audience rules take the highest precedence; admins may reorder existing rules manually."
- `.lovable/plan.md` → append a changelog entry.

## Files touched

- `src/pages/annual-review/AnnualReviewFormMapping.tsx`
- `src/services/annualReview/formMapping.ts`
- `src/services/annualReview/formMapping.test.ts`
- `src/pages/annual-review/AnnualReviewFormMapping.test.tsx` (new)
- `DOCUMENTATION.md`, `POLICY.md`, `.lovable/plan.md`

## Rollback

Revert the priority-calc lines and the cache-reset call. No data migration to undo.