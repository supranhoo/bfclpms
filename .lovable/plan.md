
Fix the Review Timeline PDF layout so long audit-log text wraps and expands the card height instead of overflowing outside the box.

1. Update `src/lib/pdfExport.ts` review-timeline rendering
- Replace the fixed audit-log row height calculation (`16 + details.length * 4`) with dynamic height based on wrapped text lines.
- Use `doc.splitTextToSize(...)` for:
  - action label if needed
  - performer line if needed
  - each detail bullet line
- Compute row height from the total wrapped lines plus padding.

2. Render wrapped text line-by-line inside each audit row
- Keep the bordered card layout, but draw:
  - header row: action label on left, date on right
  - performer line below
  - detail bullets below that, wrapping across multiple lines
- Indent continuation lines so wrapped bullet text stays aligned and readable.

3. Improve page-break logic
- Before drawing each audit row, compare its fully calculated height against remaining page space.
- If it won’t fit, move the entire row to the next page instead of letting text continue past the border.
- Keep section title handling intact so rows are never split mid-entry.

4. Make the stage section pagination safer
- Adjust the stage-card loop so page-break checks happen before calculating/drawing positions for a new row of cards.
- Recompute row origin after `addPage()` so stage cards don’t inherit stale Y coordinates.

5. Keep the data source unchanged
- No backend changes needed.
- `KpiJourneySection.tsx` already passes the correct audit-log data; the issue is purely PDF layout/rendering in `pdfExport.ts`.

Technical note
Root cause: the PDF currently uses fixed row heights and `truncateText(...)` for audit details, while real detail strings can span multiple visual lines. That makes text extend beyond the allocated box and appear “broken.” The fix is to switch from character-count assumptions to width-based text wrapping with height measured from the wrapped output.
