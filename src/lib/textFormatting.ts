/**
 * Text Formatting Utilities
 * Central location for text normalization and display formatting
 */

/**
 * Normalize structured KPI text by ensuring newlines before section markers.
 * This handles both "clean" new data and "messy" existing data.
 * 
 * Pattern: Finds markers like "- Description:", "- Formula:", "- Scoring Logic:"
 * without a preceding newline and inserts one.
 * 
 * @param text - Raw text from database
 * @returns Normalized text with proper line breaks
 */
export function normalizeKpiText(text: string | null | undefined): string {
  if (!text) return '';
  
  // Regex pattern: Match section markers NOT preceded by a newline
  // Standard: "- Description:", "-Description:", "- Formula:" etc.
  // Non-standard: "Formula -", "Scoring :-" (only when NOT inside parentheses)
  const sectionMarkerPattern = /(?<!\n)(\s*)(-\s*(?:Description|Formula|Scoring Logic|Scoring|Criteria|Measurement|Target|Notes?)s?\s*:|(?<!\()(?:Description|Formula|Scoring Logic|Scoring|Criteria|Measurement|Target|Notes?)s?\s*(?::-|:\s*-|\s+-\s*))/gi;
  
  return text.replace(sectionMarkerPattern, '\n$2');
}

/**
 * CSS class utility for pre-wrap text display
 */
export const preWrapClass = 'whitespace-pre-wrap';

/**
 * Return KPI text up to (but not including) the first "Formula" keyword.
 * If "Formula" is absent, truncate before "Logic".
 * If neither is found, return the full normalized text.
 * Used on dashboard/table views where full detail is available via "View KPI Details".
 */
export function getKpiSummaryText(text: string | null | undefined): string {
  if (!text) return '';
  const normalized = normalizeKpiText(text);
  const formulaIdx = normalized.search(/formula/i);
  if (formulaIdx > 0) return normalized.slice(0, formulaIdx).trim();
  const logicIdx = normalized.search(/logic/i);
  if (logicIdx > 0) return normalized.slice(0, logicIdx).trim();
  return normalized;
}

/**
 * Section marker pattern used for bold rendering.
 * Matches standard markers like "- Description:", "- Formula:", "- Scoring Logic:", "- Scoring:"
 * Also matches non-standard variants: "Formula -", "Scoring :-", "Formula :", "-Description:" etc.
 */
export const BOLD_MARKER_PATTERN = /(-\s*(?:Description|Formula|Scoring Logic|Scoring|Criteria|Measurement|Target|Notes?)s?\s*:|(?<!\()(?:Description|Formula|Scoring Logic|Scoring|Criteria|Measurement|Target|Notes?)s?\s*(?::-|:\s*-|\s+-\s*))/gi;

/**
 * Split normalized KPI text into segments, marking which ones are bold section markers.
 * Returns an array of { text, bold } objects for rendering.
 *
 * @param text - Raw text from database
 * @returns Array of segments with bold flag
 */
export function splitKpiTextSegments(text: string | null | undefined): Array<{ text: string; bold: boolean }> {
  const normalized = normalizeKpiText(text);
  if (!normalized) return [{ text: '', bold: false }];

  const segments: Array<{ text: string; bold: boolean }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const regex = new RegExp(BOLD_MARKER_PATTERN.source, 'gi');

  while ((match = regex.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: normalized.slice(lastIndex, match.index), bold: false });
    }
    segments.push({ text: match[1], bold: true });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < normalized.length) {
    segments.push({ text: normalized.slice(lastIndex), bold: false });
  }

  return segments.length > 0 ? segments : [{ text: '', bold: false }];
}
