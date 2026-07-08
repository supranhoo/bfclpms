## Why the shadow warning is misleading here

Two real defects in `AudienceBuilder` (`src/pages/annual-review/AnnualReviewFormMapping.tsx`) produce false / misattributed "shadowed by higher-priority rule" alerts:

### Defect 1 — New rule can tie with an existing rule and lose

In `commit.mutationFn`:

```
priority = rules.length === 0 ? 100 : Math.max(1, minExisting - 10)
```

Once the smallest existing priority is already `1` (or ≤ 10), every new rule is clamped to `1` — the *same* priority as an existing broad rule. The resolver then sorts by `priority` only:

```
rules.filter(r => r.is_active).sort((a, b) => a.priority - b.priority)
```

There is no deterministic tie‑breaker, so the pre-existing rule (loaded first from the DB) wins, and the new "specific" rule resolves to 0 employees. That is the exact case in the screenshot: the new rule and `CPP - W - QC DMP(v15)` are both priority `1`, and the older one wins by insertion order.

### Defect 2 — Wrong rule is named as the shadower

`shadowingRule` doesn't check whether the accused rule actually covers the new rule's audience. It just picks *any* rule (other than the saved template's own) that has at least one resolved employee anywhere in the org:

```
const shadow = sorted.find(
  r => r.template_id !== lastSavedTemplateId && (counts.get(r.template_id) ?? 0) > 0
);
```

So even when the true reason for `covered === 0` is unrelated (e.g. audience is empty, or a completely different rule is masking one employee), the banner still names the highest-priority rule with any coverage — which is often not the culprit.

### Fix plan (surgical, UI + save-priority only — no schema change)

1. **`AnnualReviewFormMapping.tsx` → `commit.mutationFn`**
   - Compute `priority = rules.length === 0 ? 100 : minExisting - 1` and *do not* clamp to 1. Allow zero/negative priorities so a new rule strictly outranks every existing one. (DB column is `int`; verify no CHECK constraint before finalizing — if one exists, fall back to reassigning: bump every existing rule's priority by +1 and set the new rule to the previous `minExisting`.)
   - Add a short comment explaining the strict-precedence invariant.

2. **`AnnualReviewFormMapping.tsx` → `shadowingRule` memo**
   - Restrict the shadow search to rules that actually cover the *new rule's audience*. Cross-reference `report.rows` with the preview employees returned by `previewAudience(filters)` (already cached in `previewQ.data.sample` + a new `ids` field, or re-query the ids for the saved filter set), and only consider a rule as "shadowing" if it resolved at least one of those employees to a different template.
   - If no rule in that restricted set matches, show a different, accurate message: "Rule saved, but no employees resolved to it. The audience filters may no longer match anyone — open the Rules tab to review."

3. **Service tweak — `previewAudience`**
   - Ensure it can return the full matched employee id list (already fetches ids; expose them via the returned shape or add a small `previewAudienceIds(filters)` helper) so the shadow check has an exact audience to compare against without a second full profile scan.

4. **`resolveTemplateForProfile` (defense in depth)**
   - Add a deterministic tie-breaker to the sort: `(a.priority - b.priority) || a.id.localeCompare(b.id)` (accept `id` in the `Pick<>`), so equal-priority races are stable and testable. Purely defensive — the priority fix above should make ties impossible for newly saved rules.

5. **Tests (`src/services/annualReview/formMapping.test.ts`, plus a new `AudienceBuilder` unit test)**
   - Resolver: two rules with equal priority resolve deterministically by id.
   - Priority calc: saving a new rule when `minExisting = 1` produces a strictly smaller priority than every existing rule.
   - Shadow detection: banner is suppressed when the "other" covering rule has no overlap with the new audience; banner is shown (and names the correct rule) when overlap exists.

### Not in scope

- No changes to the Rules-tab priority editor, DB schema, or the seeder.
- No behavior change for existing saved rules — only the priority assigned to *new* rules and the accuracy of the post-save banner.

### Risk & rollback

- Data impact: none — only affects the `priority` value written for newly-saved rules.
- Regression risk: low; the priority change makes new rules more, not less, specific. The banner change is UI-only.
- Rollback: revert the file changes; no migration.

Confirm you want me to proceed with this fix (especially point 1 — allowing priorities to go below 1) and I'll switch to build mode and implement it with the tests.