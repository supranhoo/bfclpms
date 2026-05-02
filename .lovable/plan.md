## Problem

The fuzzy scanner correctly groups all "Total Recordable Injury" variants together — but in this case the group actually contains **two distinct KPIs**: LTI (Lost Time Injury) and STI (Short Term Injury). Today the UI forces a single canonical for the whole group, so the admin can either:

- merge LTI + STI into one (wrong), or
- skip the whole group (loses both fixes).

What's missing: a way to **split** the group into sub-clusters before approval, so LTI variants become one canonical and STI variants become another in a single workflow.

## Plan

Add per-group **bucketing** to the Build Registry card. Each variant gets a small bucket selector (`A`, `B`, `C`, …); admins drop similar variants into the same bucket and approve all buckets in one click.

### 1. UI — `BuildRegistryTab.tsx`

- Replace the single `RadioGroup` with a per-variant **Bucket selector** (segmented control: `A` / `B` / `C` / `Skip`). Default = all variants in bucket `A` (preserves today's single-canonical behaviour).
- When 2+ buckets are in use, the card switches to **multi-canonical mode**:
  - One **canonical editor** per active bucket, each pre-filled with the longest variant in that bucket.
  - A small "Suggest split" button uses a quick client-side keyword check (e.g. presence of `LTI` vs `STI`, `(PM10)` vs `(PM10/AQI)`) to auto-assign buckets — admin can override.
  - Variants marked `Skip` are excluded from approval (left for the next scan or for `Don't merge`).
- The single **Approve as Canonical** button becomes **Approve N canonicals** when multi-bucket. Disabled until every active bucket has a non-empty canonical KRA + KPI and at least one variant.
- Keep the existing **Don't merge** and **Edit canonical** affordances unchanged.

### 2. Hook — `useBuildRegistry.ts`

- Add `createMultipleDefinitionsWithAliases(buckets)` that loops the existing idempotent `createDefinitionWithAliases` per bucket inside a single try block, aggregates the result, and emits one summary toast (`"3 canonical entries created, 11 aliases linked"`). Any per-bucket failure surfaces inline; successful buckets stay applied (idempotent re-approval is safe on retry).
- The single-bucket path keeps calling the original function — zero behaviour change for existing users.

### 3. State + processing

- `processedGroups` is marked only after **all** buckets succeed, so the card stays visible if a partial failure happens.
- After approval, the card collapses with a green check showing "`N` canonicals created from this group" (mirroring today's done-card pattern).

### 4. No DB changes

- This is purely a client-side partitioning of an already-fetched group. The DB scanner, alias schema, skip list, history/undo, and idempotent `createDefinitionWithAliases` are untouched.

### 5. Tests + docs

- New tests in `src/lib/scanGroupBuckets.test.ts` (new helper) covering: default-single-bucket, multi-bucket partitioning, "Skip" exclusion, longest-variant canonical defaulting per bucket, and the keyword-based auto-suggest (`LTI` / `STI` / `PM10` / `PM10/AQI`).
- Update `POLICY.md` §88I clause 13 with a note that fuzzy groups MAY be split into sub-clusters in the UI — the DB contract is unchanged.
- Update `mem/features/admin/kpi-standardization-registry` "Fuzzy scanner" section.

### Risk & Impact

| Area | Impact | Mitigation |
|---|---|---|
| Data | None — no DB writes change shape; each bucket calls the existing idempotent insert. | Re-running the same partition is a no-op. |
| Workflow | Admins gain a more powerful action; default behaviour (single bucket) matches today exactly. | Single bucket = old UX; multi-bucket only activates when admin assigns ≥2 buckets. |
| UI/UX | Adds a row of small bucket pills per variant + N canonical editors when split. Fits the 1295×770 viewport. | Reuses existing `Badge` + `Input` / `Textarea` primitives; collapses cleanly when only one bucket is in use. |
| Regression risk | Hook gains a sibling function; existing single-canonical path is unchanged. | New unit tests + the existing `useScannerSkips` / dedup tests keep the rest locked. |

### Files

- `src/components/admin/kpi-standardization/BuildRegistryTab.tsx` (bucket selector, multi-canonical editor, approve-N flow)
- `src/hooks/useKpiRegistry.ts` (`createMultipleDefinitionsWithAliases` helper)
- `src/lib/scanGroupBuckets.ts` + `.test.ts` (new pure helpers: bucket assignment, auto-suggest, validation)
- `POLICY.md`, `mem/features/admin/kpi-standardization-registry`

Approve to implement.