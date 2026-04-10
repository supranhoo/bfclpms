

## RCA + CAPA: "kpiErr is not defined" — Propagation Failure

### 1. Root Cause

**Line 169** of `supabase/functions/bulk-zero-score-non-submitters/index.ts` contains a stale reference:

```typescript
if (kpiErr) throw kpiErr;  // ← kpiErr does NOT exist in this scope
```

When the code was refactored from a single query to batched fetching (using `bErr` inside the while loop), this old error-check line was left behind. Since `kpiErr` is undefined, JavaScript throws a `ReferenceError` at runtime, returning a 500 to the client.

Note: `kpiErr` IS correctly defined later in the file (line 573, execute mode) — but line 169 is in the scan mode block where it was never declared.

**This is NOT a propagation logic bug** — the scan phase crashes before it can return results, so the admin never reaches the execute/propagate step.

### 2. Evidence

- Runtime error: `{"error":"kpiErr is not defined"}` — classic ReferenceError
- Line 169 sits after the batched fetch loop (lines 147-162) which uses `bErr`, not `kpiErr`
- The error check is redundant anyway — each batch already throws on `bErr` (line 157)

### 3. Impact

- 100% of scan attempts fail with 500
- Admin cannot scan for non-submitters, blocking the entire bulk zero-score workflow
- The screenshot from Biswajit shows data stuck at "Entered" / not propagated — consistent with the tool being unusable

### 4. Corrective Action

**Delete line 169** — it is a dead reference. Error handling is already covered by `if (bErr) throw bErr` on line 157 inside the fetch loop.

| File | Change |
|------|--------|
| `supabase/functions/bulk-zero-score-non-submitters/index.ts` | Remove line 169 (`if (kpiErr) throw kpiErr;`) |
| `DOCUMENTATION.md` | Log RCA v2.31.5 — stale variable reference after batch refactor |
| `POLICY.md` | Sync version |

### 5. Preventive Action

- Add to the Edge Function Checklist in DOCUMENTATION.md: "After refactoring queries, search for all prior variable references to ensure none are orphaned"

### 6. Risk Assessment

- **Data impact**: None — removing a dead line
- **Regression risk**: Zero — the line only ever crashes; removing it restores correct flow
- **Security**: No change

