

## RCA + CAPA: Persistent "kpiErr is not defined" — Stale Deployment

### 1. Root Cause

The code fix (removing the orphaned `kpiErr` reference) was applied to the codebase in the previous iteration, but the **edge function was never redeployed**. The Supabase runtime is still executing the old compiled version with `kpiErr` on line 154.

**Evidence:**
- `index.ts` line 169 in the repo is now blank — fix is present in source
- Edge function logs show errors at **compiled line 154** referencing the old code
- All 5 recent error entries (timestamps 13:40–13:44 today) show the identical stale `ReferenceError`

### 2. Impact

- 100% of scan attempts continue to fail with 500
- The previous code fix is invisible to users because the deployed artifact is stale

### 3. Corrective Action

**Force-redeploy** the edge function by adding a deployment timestamp comment to the file. This triggers the Lovable deployment pipeline to push the updated code to the Supabase runtime.

| File | Change |
|------|--------|
| `supabase/functions/bulk-zero-score-non-submitters/index.ts` | Add/update deployment sync comment (e.g., `// deploy-sync: 2026-04-10T19:15`) to force fresh deployment |
| `DOCUMENTATION.md` | Log RCA v2.31.6 — stale deployment after code fix |
| `POLICY.md` | Sync version |

### 4. Preventive Action

- After every edge function code fix, **verify deployment** by checking edge function logs for the new code path — never assume saving the file triggers a deploy
- Add to the Edge Function Checklist: "Confirm deployment via log inspection after every fix"

### 5. Risk Assessment

- **Data impact**: None — no logic change, just triggering deployment of already-fixed code
- **Regression risk**: Zero
- **Security**: No change

