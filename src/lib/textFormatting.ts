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
  // Uses negative lookbehind (?<!\n) to ensure we don't double-insert
  // Matches: " - Description:", "- Formula:", etc.
  // Does NOT match: "\n- Description:" (already has newline)
  const sectionMarkerPattern = /(?<!\n)(\s*)(-\s*(?:Description|Formula|Scoring Logic|Criteria|Measurement|Target|Notes?)s?:)/gi;
  
  return text.replace(sectionMarkerPattern, '\n$2');
}

/**
 * CSS class utility for pre-wrap text display
 */
export const preWrapClass = 'whitespace-pre-wrap';
