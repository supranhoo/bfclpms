import * as XLSX from 'xlsx';
import type { SystemKpiRow } from '@/services/annualReview/systemKpiLibrary';
import { parseScoringRules } from '@/services/annualReview/systemKpiLibrary';
import type { ArchetypeRow } from '@/services/annualReview/templateArchetypes';
import { parseCriteria, parseStringArray, parseStageWeights } from '@/services/annualReview/templateArchetypes';

function download(wb: XLSX.WorkBook, filename: string): void {
  XLSX.writeFile(wb, filename);
}

/** Bilingual (EN + HI) export of the System KPI library and scoring bands. */
export function downloadSystemKpiLibraryWorkbook(kpis: SystemKpiRow[]): void {
  const kpiRows = kpis.map((k) => ({
    Key: k.key,
    'Name (EN)': k.name_en,
    'Name (HI)': k.name_hi ?? '',
    'Description (EN)': k.description_en ?? '',
    'Description (HI)': k.description_hi ?? '',
    'UOM Type': k.uom_type,
    Direction: parseScoringRules(k.scoring_rules).direction,
    Active: k.is_active ? 'yes' : 'no',
    'Sort Order': k.sort_order,
  }));
  const bandRows: Array<Record<string, string | number>> = [];
  for (const k of kpis) {
    const rules = parseScoringRules(k.scoring_rules);
    for (const b of rules.bands) {
      bandRows.push({
        Key: k.key,
        'Name (EN)': k.name_en,
        Direction: rules.direction,
        Score: b.score,
        Threshold: b.threshold,
      });
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kpiRows), 'System KPIs');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bandRows), 'Scoring Bands');
  download(wb, `system-kpi-library-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** Bilingual export of the 4 Template Archetypes with their criteria + stage weights. */
export function downloadArchetypesWorkbook(rows: ArchetypeRow[]): void {
  const summary = rows.map((r) => {
    const w = parseStageWeights(r.default_stage_weights);
    return {
      Code: r.code,
      'Name (EN)': r.name_en,
      'Name (HI)': r.name_hi ?? '',
      'Description (EN)': r.description_en ?? '',
      'Description (HI)': r.description_hi ?? '',
      'Grade Buckets': parseStringArray(r.applies_to_grade_buckets).join(', '),
      'Display Mode': r.display_mode,
      'Self %': w.self,
      'Dept Head %': w.dept_head,
      'BU Head %': w.bu_head,
      Active: r.is_active ? 'yes' : 'no',
    };
  });
  const criteriaRows: Array<Record<string, string | number>> = [];
  for (const r of rows) {
    for (const c of parseCriteria(r.default_criteria)) {
      criteriaRows.push({
        'Archetype Code': r.code,
        'Criterion Key': c.key,
        'Label (EN)': c.label_en,
        'Label (HI)': c.label_hi ?? '',
        'Max Score': c.max_score,
      });
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Archetypes');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(criteriaRows), 'Criteria');
  download(wb, `template-archetypes-${new Date().toISOString().slice(0, 10)}.xlsx`);
}