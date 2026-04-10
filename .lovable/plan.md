

## RCA + CAPA: "invalid input value for enum rating_level: '0'" — Bulk Zero-Score Failure

### 1. Root Cause

The `rating_level` column on `review_submissions` is a **Postgres enum** with valid values: `{red, yellow, green, blue}`. The bulk zero-score function sets all `*_rating` fields to `0` (a number), which is not a valid enum value.

**Failing lines (index.ts):**
```typescript
submissionData.self_rating = 0;      // ← invalid enum
submissionData.manager_rating = 0;   // ← invalid enum
submissionData.skip_level_rating = 0;
submissionData.hr_pms_rating = 0;
submissionData.auditor_rating = 0;
submissionData.management_rating = 0;
submissionData.final_rating = 0;     // ← invalid enum
```

All 7 rating fields are typed `rating_level` enum (`red | yellow | green | blue`). Writing `0` causes a Postgres type error on every upsert, resulting in **0 KPIs zeroed** and errors for all records.

### 2. Impact

- 100% of bulk zero-score execute operations fail for this employee (and likely all employees)
- The scan phase works fine; only the execute/upsert phase is broken
- No data corruption — writes are rejected, not silently mangled

### 3. Corrective Action

| File | Change |
|------|--------|
| `supabase/functions/bulk-zero-score-non-submitters/index.ts` | Replace all `*_rating = 0` assignments with `*_rating = 'red'` (the lowest rating in the enum, appropriate for a zero-score) |
| `DOCUMENTATION.md` | Log RCA v2.33.1 — enum type mismatch in bulk zero-score |
| `POLICY.md` | Sync version |

**Specific fix** — change all 7 rating assignments:
```typescript
// Before:
submissionData.self_rating = 0;
// After:
submissionData.self_rating = 'red';
```

Apply the same change for: `manager_rating`, `skip_level_rating`, `hr_pms_rating`, `auditor_rating`, `management_rating`, `final_rating`.

### 4. Preventive Action

- Add to the Edge Function Checklist: "Verify enum column types before assigning literal values — never use numeric literals for enum fields"
- The scoring engine elsewhere in the codebase correctly maps scores to rating levels; the bulk zero-score function bypassed this mapping

### 5. Risk Assessment

- **Data impact**: None — fix changes rejected writes to valid writes
- **Regression risk**: Zero — `'red'` is the correct semantic value for a zero score
- **Security**: No change

