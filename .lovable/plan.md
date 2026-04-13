

## Revised Plan: Meaningful Evidence Download File Names (Long KPI Name Safe)

### Problem
Downloaded evidence files get cryptic names like `1718234567890.pdf`. Users cannot identify them later in their Downloads folder.

### Key Challenge: Long KPI Names
KPI names in this project often contain multi-line text with formulas, descriptions, and scoring criteria appended. Using the full KPI name would produce filenames like:
```text
Safety_Audit_Score_-_Formula:_Achieved_÷_Target_×_100_-_Rating:_5_if_>95%,_4_if_>85%..._Evidence.pdf
```
This is worse than the numeric name.

### Solution: Reuse ADR-039 Truncation Pattern

ADR-039 already established that KPI names must be truncated to their **first line only, capped at a safe length**. The same pattern applies here — but stricter for filenames:

1. **First line only** — `kpiName.split('\n')[0]`
2. **Truncate to 40 characters** (shorter than notifications — filenames need to be compact)
3. **Sanitize** — replace non-alphanumeric chars with underscores, collapse consecutive underscores
4. **Structured format** — `{KPI}_{Stage}_{Evidence_N}.{ext}` where stage and index are optional

**Example outputs:**
| KPI Name (raw) | Stage | Result |
|---|---|---|
| `Safety Audit Score\n- Formula: ...` | Self | `Safety_Audit_Score_Self_Evidence.pdf` |
| `Monthly Revenue Target Achievement\n- Rating: 5 if >95%...` | Manager | `Monthly_Revenue_Target_Achievement_Manager_Evidence_1.pdf` |
| `कार्य गुणवत्ता` (Hindi) | Self | `Evidence_Self_1.pdf` (non-Latin falls back to generic) |

### Changes

**1. `src/lib/storageDownload.ts`**
- Add `fileName?: string` optional parameter to `openStorageFile`
- Add `sanitizeForFilename(text: string, maxLen = 40)` helper: first line → strip non-alphanumeric → collapse underscores → truncate
- Add `buildEvidenceFileName(kpiName?: string, stage?: string, index?: number, total?: number, url?: string)` helper that assembles parts and preserves extension from URL

**2. Upload path improvement (`MultiFileUpload.tsx`, `EvidenceUpload.tsx`)**
- Include sanitized original filename in storage path: `${timestamp}_${sanitized}.${ext}`
- Only affects new uploads; existing files get nice names via the download-side fix

**3. Update call sites (13 components)**
- Pass KPI name and stage context to `openStorageFile` where available
- Each component already has KPI name in scope — no new data fetching needed
- Components: `ReviewTrailCard`, `ReviewTrailCardCompact`, `ReviewStageCard`, `SelfReviewSheet`, `DailySubmissionGrid`, `WeeklySubmissionTable`, `DailySubmissionSummary`, `OrgKpiFileUpload`, `OrgKpiAuditCard`, `ObservationReplyThread`, and others

**4. `DOCUMENTATION.md` / `POLICY.md`** — Version bump, changelog, ADR-039 cross-reference

### Sanitization Rules (the core safety logic)
```text
Input:  "Safety Audit Score\n- Formula: Achieved ÷ Target × 100\n- Rating: 5 if >95%"
Step 1: "Safety Audit Score"          (first line)
Step 2: "Safety_Audit_Score"          (replace non-alphanum with _)
Step 3: "Safety_Audit_Score"          (collapse __)
Step 4: "Safety_Audit_Score"          (truncate at 40 — fits)
Final:  "Safety_Audit_Score_Self_Evidence.pdf"
```

### Risk Assessment
- **Data impact**: None — no schema changes
- **Regression risk**: Low — `fileName` is optional, existing calls unchanged until updated
- **Edge cases handled**: Multi-line KPI names, special characters, Unicode/Hindi text (graceful fallback), very long names (hard truncate at 40 chars), missing KPI context (falls back to `Evidence.pdf`)

