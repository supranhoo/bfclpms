import * as XLSX from 'xlsx';
import type { CriterionRow } from '@/services/annualReview/criteriaLibrary';

/** Slugify an English label into a stable library key. */
export function slugifyCriterionKey(labelEn: string): string {
  return labelEn
    .toLowerCase()
    .replace(/\s*\/\s*[\u0900-\u097F].*$/u, '') // drop Hindi after " / "
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'criterion';
}

/** Parsed row from one sheet of the bilingual pack. */
export interface ParsedCriteriaSheetRow {
  label_en: string;        // English part of the "Criteria / क्रिटीरिया" cell
  label_hi: string | null; // Hindi part after " / "
  rating_desc: string;     // Full 5..0 rating description (bilingual, kept verbatim)
  weight_pct: number;      // "Wt%" column
}

export interface ParsedCriteriaSheet {
  name: string;
  rows: ParsedCriteriaSheetRow[];
}

/**
 * Parse an uploaded bilingual pack workbook (BFCL layout).
 *
 * Expected sheet shape (loose — we match by header text, not position):
 *   Header row somewhere near the top with columns "Criteria", a description
 *   column ("Rating - Discription" / "Discription"), and "Wt%".
 *   Data rows follow. "Type" / "Eligibility" / merged-cell rows are skipped.
 */
export function parseCriteriaPackWorkbook(file: ArrayBuffer): ParsedCriteriaSheet[] {
  const wb = XLSX.read(file, { type: 'array' });
  const out: ParsedCriteriaSheet[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][];
    // Find the header row: has a cell that equals "Criteria" (case-insensitive).
    const headerIdx = grid.findIndex((r) =>
      r.some((c) => typeof c === 'string' && c.trim().toLowerCase() === 'criteria'),
    );
    if (headerIdx < 0) continue;
    const header = grid[headerIdx].map((c) => String(c ?? '').trim().toLowerCase());
    const critCol = header.findIndex((h) => h === 'criteria');
    const descCol = header.findIndex((h) => h.includes('discription') || h.includes('description'));
    const wtCol = header.findIndex((h) => h.includes('wt'));
    if (critCol < 0) continue;

    const rows: ParsedCriteriaSheetRow[] = [];
    for (let i = headerIdx + 1; i < grid.length; i++) {
      const raw = grid[i];
      const critCell = String(raw[critCol] ?? '').trim();
      if (!critCell) continue;
      // Skip section labels like "Eligibility"
      if (critCell.toLowerCase() === 'eligibility') continue;
      const [enPart, hiPart] = critCell.split(/\s*\/\s*/, 2);
      const desc = descCol >= 0 ? String(raw[descCol] ?? '').trim() : '';
      const wtVal = wtCol >= 0 ? Number(raw[wtCol]) : 0;
      rows.push({
        label_en: enPart.trim(),
        label_hi: hiPart ? hiPart.trim() : null,
        rating_desc: desc,
        weight_pct: Number.isFinite(wtVal) ? wtVal : 0,
      });
    }
    if (rows.length > 0) out.push({ name, rows });
  }
  return out;
}

/** Bilingual export of the Criteria Library (labels + weights not included). */
export function downloadCriteriaLibraryWorkbook(rows: CriterionRow[]): void {
  const out = rows.map((r) => ({
    Key: r.key,
    'Label (EN)': r.label_en,
    'Label (HI)': r.label_hi ?? '',
    'Max Score': Number(r.max_score),
    'Is Common': r.is_common ? 'yes' : 'no',
    Active: r.is_active ? 'yes' : 'no',
    'Sort Order': r.sort_order,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out), 'Criteria');
  XLSX.writeFile(wb, `criteria-library-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
