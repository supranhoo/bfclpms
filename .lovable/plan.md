

## Implementation: Fix Auto-Advanced KPIs Showing "N/A" + Backfill Existing Data

### Changes

**1. `src/hooks/usePendingSelfReviews.ts` (lines 460-484)**
Add all intermediate stage scores to both the update and insert payloads:
- `manager_score: 0, manager_rating: 'red'`
- `auditor_score: 0, auditor_rating: 'red'`  
- `management_score: 0, management_rating: 'red'`

**2. `src/components/review/KpiJourneySection.tsx` (lines 534, 596)**
Add auto-advance detection and exclude from N/A logic:
```typescript
const isAutoAdvanced = !!(submission as any)?.auto_advance_reason;
const stageIsNA = !isAutoAdvanced && (
  (globalIsNA && data.score === null && status !== 'pending') 
  || (!globalIsNA && data.score === null && status !== 'pending' && status === 'completed')
);
```
For the previous-period section (line 596), same pattern using `prevSubmission`.

**3. Database migration — Backfill existing auto-advanced submissions**
```sql
UPDATE review_submissions
SET manager_score = 0, manager_rating = 'red',
    auditor_score = 0, auditor_rating = 'red',
    management_score = 0, management_rating = 'red'
WHERE auto_advance_reason IS NOT NULL
  AND manager_score IS NULL;
```

**4. `DOCUMENTATION.md`** — v2.15.45 entry
**5. `POLICY.md`** — Update auto-advance scoring policy

### Risk
- Low regression — only auto-advanced KPIs affected
- Backfill is safe: only touches rows with `auto_advance_reason IS NOT NULL` and null stage scores

