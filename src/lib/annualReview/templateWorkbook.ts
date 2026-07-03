/**
 * Excel round-trip for a full AnnualReviewTemplate.
 *
 * The workbook IS the contract: one multi-sheet .xlsx file that documents
 * every supported field AND is the exact shape the parser expects back.
 *
 * schema_version bumps whenever sheet layout changes.
 */
import * as XLSX from 'xlsx';
import type {
  AnnualReviewTemplate,
  TemplateSections,
  TemplateCriterion,
  TemplateSystemScore,
  EligibilityCriterion,
  SelfReviewField,
  TemplateSettings,
  CriterionOption,
  AnnualReviewerRole,
  EligibilityOperator,
} from '@/types/annualReview';
import { STAGE_WEIGHT_KEYS, type StageWeightKey } from '@/lib/annualReview/finalScore';

export const TEMPLATE_WORKBOOK_SCHEMA_VERSION = 1;
export const TEMPLATE_WORKBOOK_MAX_BYTES = 512 * 1024;

const SHEETS = {
  README: 'README',
  TEMPLATE: 'Template',
  SETTINGS: 'Settings',
  CRITERIA: 'Criteria',
  OPTIONS: 'Criterion Options',
  SYSTEM: 'System Scores',
  ELIG: 'Eligibility Criteria',
  SELF: 'Self Review Fields',
  WEIGHTS: 'Stage Weights',
  TRANS: 'Translations',
} as const;

const REVIEWER_STAGES: AnnualReviewerRole[] = ['self', 'manager', 'skip_manager', 'dept_head', 'bu_head', 'hr'];
const ELIG_TYPES = ['number', 'boolean', 'string'] as const;
const ELIG_OPS: EligibilityOperator[] = ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte'];
const DISPLAY_MODES = ['bilingual', 'english_only', 'translated_only'] as const;

export type ImportIssue = { sheet: string; row?: number; message: string };

export interface ParsedTemplateWorkbook {
  template: Omit<AnnualReviewTemplate, 'id' | 'created_at' | 'updated_at' | 'created_by'>;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  counts: {
    criteria: number; options: number; system: number; eligibility: number;
    selfFields: number; languages: number; translations: number;
  };
}

// ---------- helpers ----------

const yn = (v: unknown) => (v === true || String(v ?? '').trim().toLowerCase().startsWith('y') ? 'Y' : 'N');
const parseYN = (v: unknown, dflt = false): boolean => {
  if (v === undefined || v === null || v === '') return dflt;
  const s = String(v).trim().toLowerCase();
  if (['y', 'yes', 'true', '1'].includes(s)) return true;
  if (['n', 'no', 'false', '0'].includes(s)) return false;
  return dflt;
};
const numOrNull = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const strOrEmpty = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());

function sheetToRows(wb: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

function readCellByLabel(wb: XLSX.WorkBook, sheetName: string, labelCol: string, valueCol: string, label: string): unknown {
  const rows = sheetToRows(wb, sheetName);
  const hit = rows.find((r) => strOrEmpty(r[labelCol]).toLowerCase() === label.toLowerCase());
  return hit ? hit[valueCol] : undefined;
}

// ---------- BUILD (empty format + filled export) ----------

function readmeRows(): string[][] {
  return [
    [`Annual Review Template — schema_version = ${TEMPLATE_WORKBOOK_SCHEMA_VERSION}`],
    [''],
    ['DO NOT rename the sheets or column headers. Do not delete the header row.'],
    ['Fields marked with * in the header are required.'],
    [''],
    ['Sheet guide:'],
    ['  Template            — one row: template name, description, active flag, display mode.'],
    ['  Settings            — key/value: default_language, additional_languages (comma-separated),'],
    ['                        enable_multilingual, enable_audio, hide_scores_from_employee, require_evidence.'],
    ['  Criteria            — one row per performance criterion. "Criterion ID" is any stable string YOU choose;'],
    ['                        it is used to link options and translations. Weights should sum to 100.'],
    ['  Criterion Options   — 0..5 score options per criterion. Multiple rows per Criterion ID.'],
    ['  System Scores       — system-driven inputs (safety, HR, etc.).'],
    ['  Eligibility Criteria — pass/fail gates. Type = number | boolean | string. Operator = equals/gt/gte/lt/lte/not_equals.'],
    ['  Self Review Fields  — free-form self-review questions.'],
    [`  Stage Weights       — final-score blend. Rows: ${STAGE_WEIGHT_KEYS.join(', ')}. Values must sum to 100 if provided.`],
    ['  Translations        — i18n strings keyed by Language Code + Target Type + Target ID (matches an ID from another sheet).'],
    [''],
    ['Target Type values (Translations sheet):'],
    ['  criterion_name, criterion_desc, option_label, self_field_label, self_field_placeholder,'],
    ['  eligibility_name, eligibility_desc, system_score_name, system_score_desc'],
    [''],
    ['Reviewer Stages (Criteria sheet "Reviewer Stages" column — comma separated):'],
    [`  ${REVIEWER_STAGES.join(', ')}`],
  ];
}

function buildTemplateSheet(t?: AnnualReviewTemplate): XLSX.WorkSheet {
  const rows = [{
    'Name*': t?.name ?? '',
    'Description': t?.description ?? '',
    'Is Active (Y/N)': t ? yn(t.is_active) : 'N',
    'Display Mode': t?.sections?.display_mode ?? 'bilingual',
  }];
  return XLSX.utils.json_to_sheet(rows, {
    header: ['Name*', 'Description', 'Is Active (Y/N)', 'Display Mode'],
  });
}

function buildSettingsSheet(s?: TemplateSettings): XLSX.WorkSheet {
  const rows = [
    { Setting: 'default_language', Value: s?.default_language ?? 'en' },
    { Setting: 'additional_languages', Value: (s?.available_languages ?? []).filter((l) => l !== (s?.default_language ?? 'en')).join(', ') },
    { Setting: 'enable_multilingual', Value: yn(s?.enable_multilingual) },
    { Setting: 'enable_audio', Value: yn(s?.enable_audio) },
  ];
  return XLSX.utils.json_to_sheet(rows, { header: ['Setting', 'Value'] });
}

function buildCriteriaSheet(cs?: TemplateCriterion[]): XLSX.WorkSheet {
  const rows = (cs ?? []).map((c, idx) => ({
    'Criterion ID*': c.id || `c${idx + 1}`,
    'Name*': c.name,
    'Description': c.description ?? '',
    'Weight (%)*': c.weight,
    'Reviewer Stages': (c.reviewer_stages ?? []).join(', '),
    'Enable Remarks (Y/N)': yn(c.enable_remarks),
    'Enable Evidence (Y/N)': yn(c.enable_evidence),
    'Evidence Required (Y/N)': yn(c.evidence_required),
  }));
  return XLSX.utils.json_to_sheet(rows.length ? rows : [{
    'Criterion ID*': '', 'Name*': '', 'Description': '', 'Weight (%)*': '',
    'Reviewer Stages': '', 'Enable Remarks (Y/N)': '', 'Enable Evidence (Y/N)': '', 'Evidence Required (Y/N)': '',
  }], {
    header: ['Criterion ID*', 'Name*', 'Description', 'Weight (%)*', 'Reviewer Stages', 'Enable Remarks (Y/N)', 'Enable Evidence (Y/N)', 'Evidence Required (Y/N)'],
  });
}

function buildOptionsSheet(cs?: TemplateCriterion[]): XLSX.WorkSheet {
  const rows: Record<string, unknown>[] = [];
  (cs ?? []).forEach((c, ci) => {
    (c.options ?? []).forEach((o, oi) => {
      rows.push({
        'Criterion ID*': c.id || `c${ci + 1}`,
        'Option ID*': o.id || `o${ci + 1}_${oi + 1}`,
        'Option Label*': o.label,
        'Score (0-5)*': o.score,
      });
    });
  });
  return XLSX.utils.json_to_sheet(rows.length ? rows : [{
    'Criterion ID*': '', 'Option ID*': '', 'Option Label*': '', 'Score (0-5)*': '',
  }], { header: ['Criterion ID*', 'Option ID*', 'Option Label*', 'Score (0-5)*'] });
}

function buildSystemSheet(ss?: TemplateSystemScore[]): XLSX.WorkSheet {
  const rows = (ss ?? []).map((s, i) => ({
    'System Score ID*': s.id || `s${i + 1}`,
    'Name*': s.name,
    'Description': s.description ?? '',
    'Weight (%)*': s.weight,
    'Source': s.source ?? 'manual',
  }));
  return XLSX.utils.json_to_sheet(rows.length ? rows : [{
    'System Score ID*': '', 'Name*': '', 'Description': '', 'Weight (%)*': '', 'Source': '',
  }], { header: ['System Score ID*', 'Name*', 'Description', 'Weight (%)*', 'Source'] });
}

function buildEligSheet(es?: EligibilityCriterion[]): XLSX.WorkSheet {
  const rows = (es ?? []).map((e, i) => ({
    'Eligibility ID*': e.id || `e${i + 1}`,
    'Name*': e.name,
    'Type*': e.type,
    'Operator*': e.operator,
    'Expected Value*': typeof e.expected_value === 'boolean' ? yn(e.expected_value) : e.expected_value,
    'Description': e.description ?? '',
  }));
  return XLSX.utils.json_to_sheet(rows.length ? rows : [{
    'Eligibility ID*': '', 'Name*': '', 'Type*': '', 'Operator*': '', 'Expected Value*': '', 'Description': '',
  }], { header: ['Eligibility ID*', 'Name*', 'Type*', 'Operator*', 'Expected Value*', 'Description'] });
}

function buildSelfSheet(fs?: SelfReviewField[]): XLSX.WorkSheet {
  const rows = (fs ?? []).map((f, i) => ({
    'Field ID*': f.id || `f${i + 1}`,
    'Label*': f.label,
    'Placeholder': f.placeholder ?? '',
    'Required (Y/N)': yn(f.required),
  }));
  return XLSX.utils.json_to_sheet(rows.length ? rows : [{
    'Field ID*': '', 'Label*': '', 'Placeholder': '', 'Required (Y/N)': '',
  }], { header: ['Field ID*', 'Label*', 'Placeholder', 'Required (Y/N)'] });
}

function buildWeightsSheet(sections?: TemplateSections): XLSX.WorkSheet {
  const w = sections?.stage_weights ?? {};
  const rows = STAGE_WEIGHT_KEYS.map((k) => ({ Stage: k, 'Weight (%)': w[k] ?? '' }));
  return XLSX.utils.json_to_sheet(rows, { header: ['Stage', 'Weight (%)'] });
}

function buildTranslationsSheet(sections?: TemplateSections): XLSX.WorkSheet {
  const rows: Record<string, unknown>[] = [];
  const tr = sections?.translations ?? {};
  for (const [lang, dict] of Object.entries(tr)) {
    for (const [key, val] of Object.entries(dict)) {
      // key convention used by translations map: `${targetType}:${targetId}`
      const [targetType, ...rest] = key.split(':');
      const targetId = rest.join(':');
      rows.push({
        'Language Code*': lang,
        'Target Type*': targetType,
        'Target ID*': targetId,
        'Translated Text*': val,
      });
    }
  }
  return XLSX.utils.json_to_sheet(rows.length ? rows : [{
    'Language Code*': '', 'Target Type*': '', 'Target ID*': '', 'Translated Text*': '',
  }], { header: ['Language Code*', 'Target Type*', 'Target ID*', 'Translated Text*'] });
}

function assembleWorkbook(t?: AnnualReviewTemplate): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readmeRows()), SHEETS.README);
  XLSX.utils.book_append_sheet(wb, buildTemplateSheet(t), SHEETS.TEMPLATE);
  XLSX.utils.book_append_sheet(wb, buildSettingsSheet(t?.sections?.settings), SHEETS.SETTINGS);
  XLSX.utils.book_append_sheet(wb, buildCriteriaSheet(t?.sections?.criteria), SHEETS.CRITERIA);
  XLSX.utils.book_append_sheet(wb, buildOptionsSheet(t?.sections?.criteria), SHEETS.OPTIONS);
  XLSX.utils.book_append_sheet(wb, buildSystemSheet(t?.sections?.system_scores), SHEETS.SYSTEM);
  XLSX.utils.book_append_sheet(wb, buildEligSheet(t?.sections?.eligibility_criteria), SHEETS.ELIG);
  XLSX.utils.book_append_sheet(wb, buildSelfSheet(t?.sections?.self_review_fields), SHEETS.SELF);
  XLSX.utils.book_append_sheet(wb, buildWeightsSheet(t?.sections), SHEETS.WEIGHTS);
  XLSX.utils.book_append_sheet(wb, buildTranslationsSheet(t?.sections), SHEETS.TRANS);
  return wb;
}

export function buildTemplateFormatWorkbook(): XLSX.WorkBook {
  return assembleWorkbook(undefined);
}

export function buildFilledTemplateWorkbook(t: AnnualReviewTemplate): XLSX.WorkBook {
  return assembleWorkbook(t);
}

export function downloadTemplateFormatWorkbook() {
  XLSX.writeFile(buildTemplateFormatWorkbook(), 'annual-review-template-format.xlsx');
}

export function downloadFilledTemplateWorkbook(t: AnnualReviewTemplate) {
  const slug = (t.name || 'template').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'template';
  XLSX.writeFile(buildFilledTemplateWorkbook(t), `annual-review-template-${slug}.xlsx`);
}

// ---------- PARSE ----------

function newId(): string {
  // Prefer crypto.randomUUID when available; fall back for older runtimes.
  const c: Crypto | undefined = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function parseTemplateWorkbook(buf: ArrayBuffer): ParsedTemplateWorkbook {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: 'array' });
  } catch (e) {
    throw new Error(`Not a valid .xlsx file: ${(e as Error).message}`);
  }

  const required = [SHEETS.TEMPLATE, SHEETS.CRITERIA];
  for (const name of required) {
    if (!wb.Sheets[name]) errors.push({ sheet: name, message: `Missing required sheet "${name}"` });
  }

  // ---- Template row ----
  const tplRows = sheetToRows(wb, SHEETS.TEMPLATE);
  const tplRow = tplRows[0] ?? {};
  const name = strOrEmpty(tplRow['Name*']);
  if (!name) errors.push({ sheet: SHEETS.TEMPLATE, row: 2, message: 'Name is required' });
  const description = strOrEmpty(tplRow['Description']) || null;
  const isActive = parseYN(tplRow['Is Active (Y/N)'], false);
  const displayModeRaw = strOrEmpty(tplRow['Display Mode']).toLowerCase() || 'bilingual';
  if (!DISPLAY_MODES.includes(displayModeRaw as typeof DISPLAY_MODES[number])) {
    errors.push({ sheet: SHEETS.TEMPLATE, row: 2, message: `Display Mode must be one of ${DISPLAY_MODES.join(', ')}` });
  }

  // ---- Settings ----
  const defaultLang = strOrEmpty(readCellByLabel(wb, SHEETS.SETTINGS, 'Setting', 'Value', 'default_language')) || 'en';
  const addLangs = strOrEmpty(readCellByLabel(wb, SHEETS.SETTINGS, 'Setting', 'Value', 'additional_languages'))
    .split(',').map((s) => s.trim()).filter(Boolean);
  const enableMultilingual = parseYN(readCellByLabel(wb, SHEETS.SETTINGS, 'Setting', 'Value', 'enable_multilingual'), false);
  const enableAudio = parseYN(readCellByLabel(wb, SHEETS.SETTINGS, 'Setting', 'Value', 'enable_audio'), false);

  const settings: TemplateSettings = {
    default_language: defaultLang,
    available_languages: Array.from(new Set([defaultLang, ...addLangs])),
    enable_multilingual: enableMultilingual,
    enable_audio: enableAudio,
  };

  // ---- Criteria + Options ----
  const criteriaRaw = sheetToRows(wb, SHEETS.CRITERIA);
  const optionRows = sheetToRows(wb, SHEETS.OPTIONS);

  const authorToNewCritId = new Map<string, string>();
  const authorToNewOptionId = new Map<string, string>(); // key: `${critAuthorId}::${optAuthorId}`
  const criteria: TemplateCriterion[] = [];

  criteriaRaw.forEach((r, i) => {
    const row = i + 2;
    const authorId = strOrEmpty(r['Criterion ID*']);
    const cname = strOrEmpty(r['Name*']);
    const weight = numOrNull(r['Weight (%)*']);
    if (!authorId) errors.push({ sheet: SHEETS.CRITERIA, row, message: 'Criterion ID is required' });
    if (!cname) errors.push({ sheet: SHEETS.CRITERIA, row, message: 'Name is required' });
    if (weight === null) errors.push({ sheet: SHEETS.CRITERIA, row, message: 'Weight is required and must be numeric' });
    if (authorId && authorToNewCritId.has(authorId)) {
      errors.push({ sheet: SHEETS.CRITERIA, row, message: `Duplicate Criterion ID "${authorId}"` });
    }
    const stages = strOrEmpty(r['Reviewer Stages']).split(',').map((s) => s.trim()).filter(Boolean) as AnnualReviewerRole[];
    for (const s of stages) {
      if (!REVIEWER_STAGES.includes(s)) {
        errors.push({ sheet: SHEETS.CRITERIA, row, message: `Unknown reviewer stage "${s}"` });
      }
    }
    const newId_ = newId();
    if (authorId) authorToNewCritId.set(authorId, newId_);

    criteria.push({
      id: newId_,
      name: cname,
      description: strOrEmpty(r['Description']) || undefined,
      weight: weight ?? 0,
      reviewer_stages: stages.length ? stages : ['self', 'manager'],
      enable_remarks: parseYN(r['Enable Remarks (Y/N)'], false),
      enable_evidence: parseYN(r['Enable Evidence (Y/N)'], false),
      evidence_required: parseYN(r['Evidence Required (Y/N)'], false),
      options: [],
    });
  });

  // Weight sum check → warning, not error
  const sumW = criteria.reduce((a, c) => a + (Number(c.weight) || 0), 0);
  if (criteria.length && Math.abs(sumW - 100) > 0.01) {
    warnings.push({ sheet: SHEETS.CRITERIA, message: `Criteria weights sum to ${sumW}, not 100` });
  }

  optionRows.forEach((r, i) => {
    const row = i + 2;
    const critAuthorId = strOrEmpty(r['Criterion ID*']);
    const optAuthorId = strOrEmpty(r['Option ID*']);
    const label = strOrEmpty(r['Option Label*']);
    const score = numOrNull(r['Score (0-5)*']);
    const newCritId = authorToNewCritId.get(critAuthorId);
    if (!newCritId) {
      errors.push({ sheet: SHEETS.OPTIONS, row, message: `Criterion ID "${critAuthorId}" not found in Criteria sheet` });
      return;
    }
    if (!label) errors.push({ sheet: SHEETS.OPTIONS, row, message: 'Option Label is required' });
    if (score === null || score < 0 || score > 5) {
      errors.push({ sheet: SHEETS.OPTIONS, row, message: 'Score must be a number between 0 and 5' });
    }
    const opt: CriterionOption = { id: newId(), label, score: score ?? 0 };
    if (optAuthorId) authorToNewOptionId.set(`${critAuthorId}::${optAuthorId}`, opt.id);
    const target = criteria.find((c) => c.id === newCritId);
    if (target) (target.options ??= []).push(opt);
  });

  // ---- System Scores ----
  const authorToNewSystemId = new Map<string, string>();
  const system_scores: TemplateSystemScore[] = sheetToRows(wb, SHEETS.SYSTEM).map((r, i) => {
    const row = i + 2;
    const authorId = strOrEmpty(r['System Score ID*']);
    const sname = strOrEmpty(r['Name*']);
    const weight = numOrNull(r['Weight (%)*']);
    if (!authorId) errors.push({ sheet: SHEETS.SYSTEM, row, message: 'System Score ID is required' });
    if (!sname) errors.push({ sheet: SHEETS.SYSTEM, row, message: 'Name is required' });
    if (weight === null) errors.push({ sheet: SHEETS.SYSTEM, row, message: 'Weight is required and numeric' });
    if (authorId && authorToNewSystemId.has(authorId)) {
      errors.push({ sheet: SHEETS.SYSTEM, row, message: `Duplicate System Score ID "${authorId}"` });
    }
    const newId_ = newId();
    if (authorId) authorToNewSystemId.set(authorId, newId_);
    return {
      id: newId_,
      name: sname,
      description: strOrEmpty(r['Description']) || undefined,
      weight: weight ?? 0,
      source: strOrEmpty(r['Source']) || 'manual',
    };
  });

  // ---- Eligibility ----
  const authorToNewEligId = new Map<string, string>();
  const eligibility_criteria: EligibilityCriterion[] = sheetToRows(wb, SHEETS.ELIG).map((r, i) => {
    const row = i + 2;
    const authorId = strOrEmpty(r['Eligibility ID*']);
    const ename = strOrEmpty(r['Name*']);
    const type = strOrEmpty(r['Type*']).toLowerCase() as (typeof ELIG_TYPES)[number];
    const op = strOrEmpty(r['Operator*']).toLowerCase() as EligibilityOperator;
    if (!authorId) errors.push({ sheet: SHEETS.ELIG, row, message: 'Eligibility ID is required' });
    if (!ename) errors.push({ sheet: SHEETS.ELIG, row, message: 'Name is required' });
    if (!ELIG_TYPES.includes(type)) errors.push({ sheet: SHEETS.ELIG, row, message: `Type must be one of ${ELIG_TYPES.join(', ')}` });
    if (!ELIG_OPS.includes(op)) errors.push({ sheet: SHEETS.ELIG, row, message: `Operator must be one of ${ELIG_OPS.join(', ')}` });
    let expected: string | number | boolean = strOrEmpty(r['Expected Value*']);
    if (type === 'number') expected = numOrNull(r['Expected Value*']) ?? 0;
    else if (type === 'boolean') expected = parseYN(r['Expected Value*'], false);
    const newId_ = newId();
    if (authorId) authorToNewEligId.set(authorId, newId_);
    return {
      id: newId_,
      name: ename,
      type: (ELIG_TYPES.includes(type) ? type : 'string'),
      operator: (ELIG_OPS.includes(op) ? op : 'equals'),
      expected_value: expected,
      description: strOrEmpty(r['Description']) || undefined,
    };
  });

  // ---- Self Review Fields ----
  const authorToNewSelfId = new Map<string, string>();
  const self_review_fields: SelfReviewField[] = sheetToRows(wb, SHEETS.SELF).map((r, i) => {
    const row = i + 2;
    const authorId = strOrEmpty(r['Field ID*']);
    const label = strOrEmpty(r['Label*']);
    if (!authorId) errors.push({ sheet: SHEETS.SELF, row, message: 'Field ID is required' });
    if (!label) errors.push({ sheet: SHEETS.SELF, row, message: 'Label is required' });
    const newId_ = newId();
    if (authorId) authorToNewSelfId.set(authorId, newId_);
    return {
      id: newId_,
      label,
      placeholder: strOrEmpty(r['Placeholder']) || undefined,
      required: parseYN(r['Required (Y/N)'], false),
    };
  });

  // ---- Stage Weights ----
  const weightRows = sheetToRows(wb, SHEETS.WEIGHTS);
  const stage_weights: TemplateSections['stage_weights'] = {};
  let anyWeight = false;
  for (const r of weightRows) {
    const key = strOrEmpty(r['Stage']).toLowerCase() as StageWeightKey;
    if (!STAGE_WEIGHT_KEYS.includes(key)) continue;
    const w = numOrNull(r['Weight (%)']);
    if (w !== null) { (stage_weights as Record<string, number>)[key] = w; anyWeight = true; }
  }
  if (anyWeight) {
    const total = Object.values(stage_weights ?? {}).reduce((a, v) => a + (Number(v) || 0), 0);
    if (Math.abs(total - 100) > 0.01) {
      errors.push({ sheet: SHEETS.WEIGHTS, message: `Stage Weights sum to ${total}, must be 100 when provided` });
    }
  }

  // ---- Translations ----
  const translations: Record<string, Record<string, string>> = {};
  const trRows = sheetToRows(wb, SHEETS.TRANS);
  let trCount = 0;
  trRows.forEach((r, i) => {
    const row = i + 2;
    const lang = strOrEmpty(r['Language Code*']);
    const type = strOrEmpty(r['Target Type*']);
    const authorTargetId = strOrEmpty(r['Target ID*']);
    const text = strOrEmpty(r['Translated Text*']);
    if (!lang || !type || !authorTargetId || !text) return;

    let newTargetId: string | undefined;
    switch (type) {
      case 'criterion_name':
      case 'criterion_desc':
        newTargetId = authorToNewCritId.get(authorTargetId);
        break;
      case 'option_label': {
        // Author id can be "critId::optId" or just "optId" (search all).
        if (authorTargetId.includes('::')) {
          newTargetId = authorToNewOptionId.get(authorTargetId);
        } else {
          for (const [k, v] of authorToNewOptionId) {
            if (k.endsWith(`::${authorTargetId}`)) { newTargetId = v; break; }
          }
        }
        break;
      }
      case 'self_field_label':
      case 'self_field_placeholder':
        newTargetId = authorToNewSelfId.get(authorTargetId);
        break;
      case 'eligibility_name':
      case 'eligibility_desc':
        newTargetId = authorToNewEligId.get(authorTargetId);
        break;
      case 'system_score_name':
      case 'system_score_desc':
        newTargetId = authorToNewSystemId.get(authorTargetId);
        break;
      default:
        errors.push({ sheet: SHEETS.TRANS, row, message: `Unknown Target Type "${type}"` });
        return;
    }
    if (!newTargetId) {
      warnings.push({ sheet: SHEETS.TRANS, row, message: `Target ID "${authorTargetId}" not found for type "${type}" — skipped` });
      return;
    }
    const key = `${type}:${newTargetId}`;
    (translations[lang] ??= {})[key] = text;
    trCount++;
  });

  const sections: TemplateSections = {
    display_mode: (DISPLAY_MODES.includes(displayModeRaw as typeof DISPLAY_MODES[number]) ? displayModeRaw : 'bilingual') as TemplateSections['display_mode'],
    settings,
    criteria,
    system_scores,
    eligibility_criteria,
    self_review_fields,
    translations,
    ...(anyWeight ? { stage_weights } : {}),
  };

  return {
    template: { name, description, is_active: isActive, sections },
    errors,
    warnings,
    counts: {
      criteria: criteria.length,
      options: criteria.reduce((a, c) => a + (c.options?.length ?? 0), 0),
      system: system_scores.length,
      eligibility: eligibility_criteria.length,
      selfFields: self_review_fields.length,
      languages: Object.keys(translations).length,
      translations: trCount,
    },
  };
}

export async function parseTemplateFile(file: File): Promise<ParsedTemplateWorkbook> {
  if (file.size > TEMPLATE_WORKBOOK_MAX_BYTES) {
    throw new Error(`File too large (${Math.round(file.size / 1024)} KB). Max ${Math.round(TEMPLATE_WORKBOOK_MAX_BYTES / 1024)} KB.`);
  }
  const buf = await file.arrayBuffer();
  return parseTemplateWorkbook(buf);
}