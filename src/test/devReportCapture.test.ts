import { describe, it, expect } from 'vitest';
import {
  buildDevReportRows,
  captureKey,
  newestCaptureDate,
  DEV_REPORT_FLOOR,
} from '@/lib/devReport/capture';
import { chunk, isDevReportStale, daysBetween } from '@/hooks/useSyncDevReport';

const MIGRATION = {
  file: '20260710093000_add_safety_capa.sql',
  body: `-- ADR-246 Safety CAPA table
CREATE TABLE public.safety_capa (id uuid primary key);
CREATE POLICY "admins" ON public.safety_capa FOR SELECT USING (true);
CREATE OR REPLACE FUNCTION public.safety_capa_touch() RETURNS trigger AS $$ BEGIN RETURN NEW; END $$;`,
};

const ADR = {
  file: 'ADR-246.md',
  body: `# ADR-246 — Development Report auto-capture\n\n## Date\n2026-08-05\n\n## Context\nThe report stalled because capture was manual.\n\n## Decision\nCapture artefacts at build time and sync via the ingest function.\n\n## Consequences\n- Admins click "Sync from repo" to refresh the report.\n`,
};

const CHANGELOG = `# Changelog

## 2026-08-04 — Fix calibration visibility regression (ADR-244)
- **What:** cycle-scoped calibration fetch.
- **Why:** long URLs silently truncated the calibration query.
- **How:** reviewers see calibrated ratings in the Annual Review Report.

## 2026-01-05 — Legacy pre-floor entry
- Should be excluded.
`;

describe('Development Report capture (ADR-246)', () => {
  const rows = buildDevReportRows({ migrations: [MIGRATION], adrs: [ADR], changelog: CHANGELOG });

  it('captures a timeline row per migration with a traceable linked_commit', () => {
    const tl = rows.find((r) => r.linked_commit === MIGRATION.file);
    expect(tl).toBeTruthy();
    expect(tl!.entry_type).toBe('timeline');
    expect(tl!.entry_date).toBe('2026-07-10');
    expect(tl!.description).toContain('safety_capa');
    expect(tl!.adr_refs).toContain('ADR-246');
  });

  it('captures new tables as feature rows', () => {
    const feat = rows.find((r) => r.title === 'New table: safety_capa');
    expect(feat?.entry_type).toBe('feature');
    expect(feat?.status).toBe('Shipped');
  });

  it('captures ADRs with their Date section', () => {
    const adr = rows.find((r) => r.linked_commit === 'ADR-246');
    expect(adr?.entry_date).toBe('2026-08-05');
    expect(adr?.timeline_type).toBe('adr');
  });

  it('classifies changelog fix entries as bugs', () => {
    const bug = rows.find((r) => r.linked_commit === 'CHANGELOG_2026.md#2026-08-04');
    expect(bug?.entry_type).toBe('bug');
  });

  it('drops artefacts before the Feb 2026 floor', () => {
    expect(rows.every((r) => r.entry_date >= DEV_REPORT_FLOOR)).toBe(true);
    expect(rows.some((r) => r.entry_date === '2026-01-05')).toBe(false);
  });

  it('is idempotent — no duplicate ingest keys', () => {
    const keys = rows.map(captureKey);
    expect(new Set(keys).size).toBe(keys.length);
    const again = buildDevReportRows({ migrations: [MIGRATION], adrs: [ADR], changelog: CHANGELOG });
    expect(again.map(captureKey)).toEqual(keys);
  });

  it('reports the newest captured date', () => {
    expect(newestCaptureDate(rows)).toBe('2026-08-05');
  });

  it('captures Why / How from ADR Context and Consequences (ADR-249)', () => {
    const adr = rows.find((r) => r.linked_commit === 'ADR-246');
    expect(adr?.rationale).toContain('stalled');
    expect(adr?.usage_notes).toContain('Sync from repo');
  });

  it('captures Why / How from labelled changelog bullets (ADR-249)', () => {
    const bug = rows.find((r) => r.linked_commit === 'CHANGELOG_2026.md#2026-08-04');
    expect(bug?.rationale).toContain('truncated');
    expect(bug?.usage_notes).toContain('Annual Review Report');
  });

  it('derives Why / How for migrations from the header comment and objects', () => {
    const tl = rows.find((r) => r.linked_commit === MIGRATION.file);
    expect(tl?.rationale).toContain('ADR-246');
    expect(tl?.usage_notes).toContain('public.safety_capa');
  });

  it('returns nothing for empty sources', () => {
    expect(buildDevReportRows({})).toEqual([]);
  });
});

describe('Development Report sync helpers', () => {
  it('chunks payloads for bounded requests', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 10)).toEqual([]);
  });

  it('computes day gaps', () => {
    expect(daysBetween('2026-06-15', '2026-08-05')).toBe(51);
  });

  it('flags staleness only past the threshold', () => {
    expect(isDevReportStale('2026-06-15', '2026-08-05')).toBe(true);
    expect(isDevReportStale('2026-08-01', '2026-08-05')).toBe(false);
    expect(isDevReportStale(null, '2026-08-05')).toBe(true);
    expect(isDevReportStale('2026-06-15', null)).toBe(false);
  });
});