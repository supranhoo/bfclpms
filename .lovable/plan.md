
# RCA Fix: N/A Score Sync + Auditor Fallback — IMPLEMENTED ✅

## Bugs Fixed

### Bug 1: N/A KPIs Missing final_score (313 records)
- **Root cause**: N/A approval path didn't sync `final_score`/`final_rating` to NULL
- **Code fix**: `UnifiedScorecard.tsx` — both reviewer-initiated N/A and N/A confirmation paths now explicitly set `final_score = null, final_rating = null` when moving to approved
- **Data repair**: Migration set all 313 approved N/A records to `final_score = NULL, final_rating = NULL`

### Bug 2: Auditor Score Defaulting to 0 (~30 records)
- **Root cause**: `AuditScorecard.tsx` line 387 didn't fall back to `existing?.achieved_value` when auditor hadn't entered their own value
- **Code fix**: Added `?? existing?.achieved_value` to the fallback chain
- **Data repair**: Migration recalculated `final_score` using 8-stage fallback chain for all affected approved non-NA KPIs

### Files Modified
| File | Change |
|------|--------|
| `src/components/review/AuditScorecard.tsx` | Added achieved_value fallback at line 387 |
| `src/components/review/UnifiedScorecard.tsx` | N/A approval paths now set final_score=null explicitly |
| Database migration | Repaired 313 N/A + ~30 non-NA records |

### Verification
- Post-migration: 0 approved N/A KPIs with non-null final_score
- Post-migration: 0 approved non-NA KPIs with final_score=0 and self_score>0
