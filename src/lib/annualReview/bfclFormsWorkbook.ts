import * as XLSX from 'xlsx';
import type { ScoringBand } from './criteriaBands';

/**
 * Parses the BFCL "Annual Review All Forms" workbook into a structured plan
 * ready for `bfclFormsImport.ts` to commit.
 *
 * Expected sheet naming: `<BU code> - (M|W) - <Dept name>`
 * Sheet layout blocks (col A markers): Eligibility / System / Type.
 * Rating description cell format:
 *   "5 - English text / हिंदी\n4 - …\n0 - …"
 */

export type GradeBucket = 'M' | 'W';

export interface ParsedCriterion {
  key: string;              // slug of label_en (dept-specific criteria get a dept suffix)
  label_en: string;
  label_hi: string | null;
  max_score: number;        // usually 5
  scoring_bands: ScoringBand[];
  is_common: boolean;       // true only for the 5 "Standard Questions" (W-grade shared)
}

export interface ParsedAssignment {
  criterionKey: string;
  buCode: string;             // e.g. CLU
  gradeBucket: GradeBucket;   // W / M
  deptName: string;           // e.g. E&I
  weight_pct: number;
}

export interface ParsedSystemKpiWeight {
  kpiKey: string;             // canonical KPI slug from the row label
  kpiLabel: string;           // original label from workbook (for display)
  kpiDescription: string;
  buCode: string;
  gradeBucket: GradeBucket;
  deptName: string;
  weight_pct: number;
}

export interface ParsedEligibilityGate {
  label: string;
}

export interface ParsedSelfReviewField {
  label: string;
}

export interface ParsedSheet {
  sheetName: string;
  buCode: string;
  gradeBucket: GradeBucket;
  deptName: string;
  criteriaWeightSum: number;
  systemWeightSum: number;
  warnings: string[];
}

export interface BfclParseResult {
  sheets: ParsedSheet[];
  criteria: ParsedCriterion[];              // deduplicated by key
  assignments: ParsedAssignment[];          // one per sheet × criterion
  systemWeights: ParsedSystemKpiWeight[];   // one per sheet × system KPI
  eligibility: ParsedEligibilityGate[];     // deduplicated
  selfReview: ParsedSelfReviewField[];      // deduplicated
  warnings: string[];                        // sheet-level parse issues
}

// ── helpers ──────────────────────────────────────────────────────

export function slugKey(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/** "Attendance & Punctuality / उपस्थिति और समय की पाबंदी" → {en, hi}. */
export function splitBilingual(raw: string): { en: string; hi: string | null } {
  if (!raw) return { en: '', hi: null };
  const m = raw.match(/\s\/\s/u);
  if (!m || m.index === undefined) return { en: raw.trim(), hi: null };
  return {
    en: raw.slice(0, m.index).trim(),
    hi: raw.slice(m.index + m[0].length).trim() || null,
  };
}

/** Parse a full band description block into ScoringBand[]. */
export function parseBandsBlock(text: string): ScoringBand[] {
  if (!text) return [];
  const bands: ScoringBand[] = [];
  // Excel often stores in-cell line breaks as LF, CRLF, CR-only, or the
  // escaped `_x000D_` marker. Split on any of those, then parse lines starting
  // with digit + hyphen/en-dash. Semicolons inside labels are normal text.
  const lines = text
    .replace(/_x000D_/gi, '\n')
    .split(/\r\n|\n|\r/g)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const m = line.match(/^(\d+)\s*[-–]\s*(.*)$/);
    if (!m) continue;
    const score = Number(m[1]);
    const { en, hi } = splitBilingual(m[2]);
    bands.push({ score, label_en: en, label_hi: hi });
  }
  return bands
    .filter((b) => b.label_en.length > 0)
    .sort((a, b) => b.score - a.score);
}

function sheetNameMatch(name: string): { buCode: string; gradeBucket: GradeBucket; deptName: string } | null {
  const m = name.match(/^\s*([A-Z]{2,6})\s*-\s*(M|W)\s*-\s*(.+?)\s*$/i);
  if (!m) return null;
  const bucket = m[2].toUpperCase() as GradeBucket;
  if (bucket !== 'M' && bucket !== 'W') return null;
  return { buCode: m[1].toUpperCase(), gradeBucket: bucket, deptName: m[3].trim() };
}

// ── main parser ──────────────────────────────────────────────────

export function parseBfclFormsWorkbook(buf: ArrayBuffer): BfclParseResult {
  const wb = XLSX.read(buf, { type: 'array' });
  const criteriaByKey = new Map<string, ParsedCriterion>();
  const assignments: ParsedAssignment[] = [];
  const systemWeights: ParsedSystemKpiWeight[] = [];
  const eligibilityLabels = new Set<string>();
  const selfReviewLabels = new Set<string>();
  const sheets: ParsedSheet[] = [];
  const warnings: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const ctx = sheetNameMatch(sheetName);
    if (!ctx) continue;
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(ws, {
      header: 1, defval: null, raw: true,
    });
    const sheetWarnings: string[] = [];
    let section: 'none' | 'elig' | 'system' | 'crit' = 'none';
    let critBlockLabel = ''; // "Standard Questions" / dept name / "M-Grade Metrics" / "Self Review Fields"
    let critSum = 0;
    let sysSum = 0;

    for (const row of rows) {
      if (!row) continue;
      const [a, b, c, d] = row;
      const aStr = (a ?? '').toString().trim();
      const bStr = (b ?? '').toString().trim();
      const cStr = (c ?? '').toString().trim();
      const wt = Number(d);
      // Section switches
      if (aStr === 'Eligibility') { section = 'elig'; }
      else if (aStr === 'System') { section = 'system'; }
      else if (aStr === 'Type') { section = 'crit'; critBlockLabel = ''; continue; }
      else if (aStr && section === 'crit') {
        critBlockLabel = aStr;
        // "Self Review Fields" rows have only col B populated (no weight, no bands)
        if (aStr === 'Self Review Fields') {
          if (bStr) selfReviewLabels.add(bStr);
          continue;
        }
      }

      if (section === 'elig') {
        // Eligibility rows use col C for the gate text.
        if (cStr) eligibilityLabels.add(cStr);
        continue;
      }

      if (section === 'system') {
        // Col B = KPI label; Col C = description with inline bands; Col D = weight
        if (!bStr || !Number.isFinite(wt)) continue;
        const kpiKey = slugKey(bStr);
        systemWeights.push({
          kpiKey,
          kpiLabel: bStr,
          kpiDescription: cStr,
          buCode: ctx.buCode,
          gradeBucket: ctx.gradeBucket,
          deptName: ctx.deptName,
          weight_pct: wt,
        });
        sysSum += wt;
        continue;
      }

      if (section === 'crit') {
        // Self-review handled above.
        if (critBlockLabel === 'Self Review Fields') {
          if (bStr) selfReviewLabels.add(bStr);
          continue;
        }
        if (!bStr || !Number.isFinite(wt)) continue;
        const bilingual = splitBilingual(bStr);
        const bands = parseBandsBlock(cStr);
        // Scoping key: shared "Standard Questions" reuse across depts, so key
        // is stable on label alone. Dept-specific criteria (E&I/QC/etc.) get a
        // dept suffix so different depts don't collide.
        const isShared = critBlockLabel === 'Standard Questions';
        const keyBase = slugKey(bilingual.en);
        const key = isShared
          ? keyBase
          : `${keyBase}__${slugKey(ctx.deptName)}_${ctx.gradeBucket.toLowerCase()}`;
        const existing = criteriaByKey.get(key);
        if (!existing) {
          criteriaByKey.set(key, {
            key,
            label_en: bilingual.en,
            label_hi: bilingual.hi,
            max_score: Math.max(5, ...bands.map((x) => x.score), 0),
            scoring_bands: bands,
            is_common: isShared,
          });
        } else if (bands.length && !existing.scoring_bands.length) {
          existing.scoring_bands = bands;
        }
        assignments.push({
          criterionKey: key,
          buCode: ctx.buCode,
          gradeBucket: ctx.gradeBucket,
          deptName: ctx.deptName,
          weight_pct: wt,
        });
        critSum += wt;
      }
    }

    if (Math.abs(critSum - 100) > 0.5) {
      sheetWarnings.push(`Criteria weight sum = ${critSum} (expected ~100)`);
    }
    sheets.push({
      sheetName,
      buCode: ctx.buCode,
      gradeBucket: ctx.gradeBucket,
      deptName: ctx.deptName,
      criteriaWeightSum: critSum,
      systemWeightSum: sysSum,
      warnings: sheetWarnings,
    });
    warnings.push(...sheetWarnings.map((w) => `[${sheetName}] ${w}`));
  }

  return {
    sheets,
    criteria: Array.from(criteriaByKey.values()),
    assignments,
    systemWeights,
    eligibility: Array.from(eligibilityLabels).map((label) => ({ label })),
    selfReview: Array.from(selfReviewLabels).map((label) => ({ label })),
    warnings,
  };
}