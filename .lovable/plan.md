

## Fix: KPI Text Unreadable Due to Truncation in Bundle Editor

### Problem
Both the **collapsed row** and **right-panel browser card** truncate the KPI title and subtitle (`truncate` CSS class), rendering long names like "Asset Availability & Reliability" as "Asset Availabilit..." — users cannot understand what the KPI is without expanding.

### Fix — 1 file: `src/pages/admin/BundleEditor.tsx`

#### 1. Remove `truncate` from title/subtitle in both components
- **`SelectedTemplateRow`** (line 523-525): Replace `truncate` with `line-clamp-2` on the title and remove truncate from subtitle, allowing text to wrap naturally across up to 2 lines
- **`BrowserTemplateCard`** (line 619-622): Same treatment — `line-clamp-2` on title, remove truncate from subtitle

#### 2. Show full KPI name in the collapsed state
- Title: use `line-clamp-2` so long names wrap to a second line instead of being cut off
- Subtitle (KRA → KPI): use `line-clamp-2` as well, so the full mapping is visible
- This means users can read the full KPI name **without needing to expand**

#### 3. Ensure layout doesn't break
- Keep `min-w-0` on the text container to prevent overflow
- The row height will grow slightly for long names (acceptable trade-off for readability)
- Badge and weightage remain flex-shrink-0, so they stay visible

### Technical Detail
```css
/* Before */
.truncate → text-overflow: ellipsis; white-space: nowrap; overflow: hidden;

/* After */
.line-clamp-2 → display: -webkit-box; -webkit-line-clamp: 2; overflow: hidden;
```

### Risk Assessment
- **No risk**: Pure CSS change, no logic or data changes
- Rows will be slightly taller for long KPI names — improves readability with minimal layout impact

