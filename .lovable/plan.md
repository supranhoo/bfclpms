# Raise Bucket Cap in KPI Standardization (A–H → A–Z)

## Problem
On `/admin/kpi-standardization` → **Build Registry**, the per-group bucket pills are capped at `A`–`H` (8 buckets). Fuzzy groups like the screenshot's "13 variants" cluster cannot be cleanly partitioned because admins run out of buckets even though `Suggest split` / manual partition would benefit from more.

## Root Cause
`src/lib/scanGroupBuckets.ts` line 17:
```ts
const LETTERS = ['A','B','C','D','E','F','G','H'];
```
`nextAvailableBucket()` iterates this array and falls back to `'H'` once exhausted. Everything downstream (`summarizeBuckets`, UI pill rendering in `BuildRegistryTab.tsx`, sort, validation) is alphabet-agnostic and works for any single uppercase letter.

## Change (1 file, 1 line of substance)
**`src/lib/scanGroupBuckets.ts`**
- Replace the hardcoded 8-letter array with the full A–Z alphabet generated from char codes:
  ```ts
  const LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
  ```
- New cap: 26 buckets per group. `nextAvailableBucket` fallback becomes `'Z'`.
- No change to `BucketId` type (already `string`), `SKIP_BUCKET`, `SPLIT_TOKENS`, `summarizeBuckets`, `validateBuckets`, or `defaultCanonicalForBucket`.

No UI changes required — `BuildRegistryTab.tsx` already renders `sharedBucketOptions` dynamically (only shows letters actually used + the next free one), so users still see `A` plus the next free letter by default and grow the bucket strip incrementally. A 13-variant group could grow up to `M` if every variant goes to its own bucket.

## Tests
**`src/lib/scanGroupBuckets.test.ts`** — add cases:
1. `nextAvailableBucket` returns `'I'` when A–H are taken.
2. `nextAvailableBucket` returns `'Z'` when A–Y are taken (cap edge).
3. `nextAvailableBucket` still returns `'Z'` when A–Z all taken (graceful fallback, matches existing semantics).
4. `summarizeBuckets` correctly groups variants placed in `'M'` and sorts buckets A < M < Z.

## Risk & Impact Report
- **Data Impact:** None. Bucket ids are transient client state used only at approval time; DB only stores resulting canonical definitions and aliases.
- **Workflow Impact:** Strict superset — existing groups using ≤8 buckets behave identically.
- **UI Impact:** Pill strip can grow horizontally if admin adds many buckets. Existing layout (`flex gap-1`) wraps within the row container; no overflow concerns at 1424px viewport for typical 5–10 buckets. The pills only appear up to the next free letter, so default UX is unchanged for the 99% case (1–3 buckets).
- **Regression Risk:** Very low — single constant, alphabet-agnostic downstream code.
- **Mitigation:** New unit tests above + existing `scanGroupBuckets.test.ts` suite continues to pass.

## Out of Scope
- No DB migration, no RLS change, no edge function change.
- `SPLIT_TOKENS` heuristic stays at A/B (it's a suggestion seed; admins manually grow further buckets when needed).
- POLICY/DOCUMENTATION update: note the new cap in the "KPI Standardization Registry" memory under the Group splitting section ("up to 26 buckets per group").
