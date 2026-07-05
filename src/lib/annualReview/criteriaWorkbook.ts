import * as XLSX from 'xlsx';
import type { CriterionRow } from '@/services/annualReview/criteriaLibrary';
import { parseBandsBlock, splitBilingual } from './bfclFormsWorkbook';

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

/** Parsed System-block row from one sheet of the bilingual pack. */
export interface ParsedSystemSheetRow {
  label_en: string;
  label_hi: string | null;
  description: string;
  weight_pct: number;
}

export interface ParsedCriteriaSheet {
  name: string;
  rows: ParsedCriteriaSheetRow[];
  systemRows?: ParsedSystemSheetRow[];
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
    const systemRows: ParsedSystemSheetRow[] = [];
    // Section-awareness: BFCL workbooks stack `Eligibility` / `System` / `Type`
    // blocks in col A. Only rows in the `Type` (criteria) block are real
    // criteria — the earlier blocks are System KPIs / eligibility gates and
    // must not land in the criteria library. Additionally, `Self Review
    // Fields` sub-blocks are free-text prompts, not scored criteria.
    // Simple criteria packs, however, contain only:
    //   Criteria | Rating - Discription
    // In that shape every data row after the header is a scored criterion.
    const hasSectionMarkers = grid.slice(headerIdx + 1).some((r) => {
      const v = String(r[0] ?? '').trim().toLowerCase();
      return v === 'eligibility' || v === 'system' || v === 'type';
    });
    let section: 'none' | 'elig' | 'system' | 'crit' = 'none';
    let critBlockLabel = '';
    for (let i = headerIdx + 1; i < grid.length; i++) {
      const raw = grid[i];
      const aCell = String(raw[0] ?? '').trim();
      const aLower = aCell.toLowerCase();
      if (hasSectionMarkers && aLower === 'eligibility') { section = 'elig'; continue; }
      if (hasSectionMarkers && aLower === 'system') { section = 'system'; }
      if (hasSectionMarkers && aLower === 'type') { section = 'crit'; critBlockLabel = ''; continue; }
      if (hasSectionMarkers && section === 'system') {
        const sysCell = String(raw[critCol] ?? '').trim();
        if (!sysCell || sysCell.toLowerCase() === 'criteria') continue;
        const { en: enPart, hi: hiPart } = splitBilingual(sysCell);
        const desc = descCol >= 0 ? String(raw[descCol] ?? '').trim() : '';
        const wtVal = wtCol >= 0 ? Number(raw[wtCol]) : 0;
        systemRows.push({
          label_en: enPart.trim(),
          label_hi: hiPart,
          description: desc,
          weight_pct: Number.isFinite(wtVal) ? wtVal : 0,
        });
        continue;
      }
      // Sub-block label inside the Type section (e.g. "Standard Questions",
      // "Self Review Fields", "Generic Blue-Collar Questions").
      if (hasSectionMarkers && section === 'crit' && aCell) critBlockLabel = aCell;
      if (hasSectionMarkers && section !== 'crit') continue;
      if (critBlockLabel === 'Self Review Fields') continue;
      const critCell = String(raw[critCol] ?? '').trim();
      if (!critCell) continue;
      // Defensive: never write the header row itself as a criterion.
      if (critCell.toLowerCase() === 'criteria') continue;
      const { en: enPart, hi: hiPart } = splitBilingual(critCell);
      const desc = descCol >= 0 ? String(raw[descCol] ?? '').trim() : '';
      // Real criteria have a bilingual rating ladder ("5 - EN / HI\n4 - …").
      // Without parseable "<digit> - " lines we cannot render bands, and
      // silently defaulting to the English ladder is the bug we're fixing.
      if (parseBandsBlock(desc).length === 0) continue;
      const wtVal = wtCol >= 0 ? Number(raw[wtCol]) : 0;
      rows.push({
        label_en: enPart.trim(),
        label_hi: hiPart,
        rating_desc: desc,
        weight_pct: Number.isFinite(wtVal) ? wtVal : 0,
      });
    }
    if (rows.length > 0 || systemRows.length > 0) out.push({ name, rows, systemRows });
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
