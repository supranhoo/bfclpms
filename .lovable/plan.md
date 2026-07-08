## Idea in one line

Add **Template** as a filter dimension inside the existing Phased Rollout card, so an admin can say "roll out to everyone mapped to *Generic W with env (Functional)* and *CPP - W - Operation*" and add all 1,904 matching employees to the current phase in one click — using the mapping we already computed on the Form Mapping page.

Today the rollout audience is built from Grade / Level / BU / Department / Has-KRA filters against `profiles`. The mapping between employee ↔ template already lives in `annual_review_instances (cycle_id, employee_id, template_id, template_override_id)`. We're not using it as a rollout selector, even though it's the most business-meaningful axis we have.

---

## Brainstorm

### Will this be useful? (Yes — high value)
- **Real-world rollout language is template-first.** Managers say "let's launch the Functional workers first" or "start with CPP Operations", not "start with grade M4 + BU=CPP + dept=Ops".
- **Zero re-work.** Form Mapping already did the hard part (2,579 employees mapped to 21 templates). Rollout should ride on top of that SSOT instead of re-deriving cohorts from raw attributes and drifting.
- **Phased launches match how templates are validated.** QA usually happens template-by-template. If "Generic W with env" is signed off but "CPP - W - QC DMP(v15)" is not, admin can enable the first without touching flag JSON.
- **Cleaner audit story.** "Phase 2 added: Template = Generic M Support Function (47 users)" is a much better changelog entry than a filter combo.

### Should we build it? (Yes, but small — extend, don't fork)
The current `PhasedRolloutCard` is already an SSOT-preserving UI over `admin_feature_flags.target_user_ids`. Adding a **Template multi-select** to the existing filter bar is a ~1-file change; no new tables, no new writers, no policy shift. Reuse everything: preview table, Assigned Form column, confirm-before-large-add dialog, remove flow.

We should **not** build a separate "Rollout by Template" page — that would fragment the mental model and duplicate the flag write path.

### Pros
- Aligns rollout with the way work is planned (per template / per form family).
- Eliminates manual cohort-building for the common case ("everyone on this form").
- Composable with existing filters: e.g. Template = Generic W with env **AND** BU = CPP → progressive narrowing for a canary phase.
- No schema change. No new RLS. No new write path — same `target_user_ids` array.
- The Assigned Form column already exists in the preview, so the filter is visually self-explanatory (users see the form they filtered by).
- Naturally handles overrides: filter matches whichever template is currently *effective* (`COALESCE(template_override_id, template_id)`), same rule the resolver uses.

### Cons / risks
- **Cycle-scoped, not global.** Template mapping only exists once instances are seeded for a cycle. Filter must be disabled (with a hint) when the selected cycle has 0 seeded instances. Mitigation: show `Seeded: N / Total: M` next to the cycle selector; disable the template filter when Seeded = 0.
- **"Will seed on start: N" gap.** From the screenshot, 249 employees are mapped by a rule but not yet seeded. They *have* a resolvable template but no row in `annual_review_instances` yet. Decision needed (see Q1) — either exclude them or resolve on the fly via the same rules the admin page uses.
- **Bulk size.** A single template can cover 1,793 employees. The existing >25-item confirm dialog handles this, but we should surface count prominently and keep the "select all shown" scoped to the preview.
- **Template renames.** If admin renames a template mid-rollout, the label in `target_user_ids` audit trail is stale. Mitigation: we only store user IDs (not template IDs) in the flag, so audience stays correct — only the label in phase notes drifts. Acceptable.
- **Not a substitute for template-level gating.** If leadership wants "Template X users get the module but only when they open form X", that's a different feature (per-template feature flag). Out of scope here.

### What it will be (definitely in)
1. **Template multi-select** in the Phased Rollout filter bar, populated from `annual_review_templates` filtered to those actually in use in the selected cycle (matches "Templates in use" list on Form Mapping).
2. **Preview** shows the same table it does today, with the Assigned Form column already answering "why is this person here".
3. **"Add all N matched"** primary action + "Add selected" secondary — reuses existing `requestAdd` + confirm dialog.
4. **Count chips per template** in the multi-select dropdown (e.g. `Generic W with env (Functional) · 1,793`) so admin picks with eyes open.
5. **Cycle-awareness**: filter is disabled with tooltip when no cycle is selected or the cycle has zero seeded instances.
6. **Reverse operation**: "Remove all users mapped to Template X from current phase" — same UX symmetry as today's per-row remove, but bulk.

### What it will *not* be (explicit non-goals)
- No new DB tables, no new flag key, no per-template flag.
- No writing to `annual_review_instances` (this card stays read-only against the mapping).
- No cross-cycle rollout (Phase = one cycle at a time; multi-cycle is a different conversation).
- No auto-progression ("when template X hits 90% approved, add template Y") — future idea, out of scope.

---

## How it will be achieved (technical)

**Files touched (1 new query, 1 UI change, 1 test):**

1. `src/components/annual-review/PilotAccessCard.tsx`
   - Add `template_ids: string[]` to the `Filters` type and `EMPTY_FILTERS`.
   - New `useCycleTemplatesInUse(cycleId)` query: `SELECT template_id (COALESCE override), COUNT(*), template.name FROM annual_review_instances WHERE cycle_id = ? GROUP BY template_id` — returns `{ id, name, count }[]` for the multi-select.
   - Extend `runPreview(f)` — after fetching `profiles`, if `f.template_ids.length > 0`, intersect with `annual_review_instances` for the selected cycle where `COALESCE(template_override_id, template_id) IN (template_ids)`. This keeps the preview single-source with the resolver rule.
   - Render a new `MultiSelectPopover` above (or beside) the existing filters, labelled **Assigned Template (from Form Mapping)**, options = cycle templates in use with count chips, disabled state + tooltip when cycle has no seeded instances.
   - No changes to `writeAudience` — still writes `target_user_ids`.

2. `src/services/annualReview/formMapping.ts`
   - Export a small helper `listTemplatesInUse(cycleId): Promise<{ template_id, name, employees_count }[]>` so the same aggregation can be reused by the Form Mapping page's "Templates in use" panel and the rollout dropdown. (Removes duplication.)

3. `src/test/annualReview/pilotAccessCard.templateFilter.test.ts`
   - Unit tests for the intersection logic (`profiles ∩ instances by template`), override resolution precedence, empty-template-list = no-op behavior, and disabled-when-no-cycle state.

**Data flow**
```text
Cycle selector ──► useCycleTemplatesInUse ──► Template multi-select
                                                    │
Grade/Level/BU/Dept/HasKra + Template ──► runPreview ──► preview table
                                                    │
                              "Add all N matched" ──► requestAdd ──► admin_feature_flags.target_user_ids
```

**Rollback:** revert `PilotAccessCard.tsx`, drop `listTemplatesInUse`, delete the test — flag JSON is unchanged either way, so no data migration risk.

---

## Open questions before build

1. **Unseeded but rule-matched employees** (the "Will seed on start: N" bucket). For rollout preview, should the template filter show only *already-seeded* employees (safe, matches on-screen data) or also resolve unseeded ones via the assignment-rules resolver (aggressive, but matches admin intent when they say "everyone on Template X")?
2. **Composition semantics** — when admin picks Template = A **and** Grade = M4, should the result be `A ∩ M4` (recommended, matches how the current filters compose) or `A ∪ M4`?
3. Should the Template dropdown show only templates with `count > 0`, or also show empty templates (helpful to notice a template no one's mapped to)?
4. Do we want a **"Remove template X's users from the current phase"** bulk action in v1, or start read-only-plus-add and add removal in a follow-up?
