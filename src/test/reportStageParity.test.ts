/**
 * ADR-194 Phase 2 / POLICY §RPT-STAGE-COLUMN-PARITY
 * Drift guard: every reporting surface that enumerates workflow stages must
 * cover the Functional Manager (F1) stage. Fails if a future edit drops it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CANONICAL_WORKFLOW_STAGES } from '@/lib/reviewConstants';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const SURFACES: Array<{ file: string; token: string }> = [
  { file: 'src/pages/reports/KpiDetailReport.tsx',        token: 'functional_manager' },
  { file: 'src/pages/reports/MonthlyScorecardReport.tsx', token: 'functional_manager_score' },
  { file: 'src/pages/reports/CompletionReport.tsx',       token: 'functionalManagerReviewed' },
  { file: 'src/pages/reports/DepartmentReport.tsx',       token: 'functional_manager_check' },
  { file: 'src/pages/reports/KRAIssuance.tsx',            token: 'functional_manager_check' },
  { file: 'src/pages/reports/KpiJourneyReport.tsx',       token: 'functional_manager_at' },
  { file: 'src/pages/reports/PerformanceReport.tsx',      token: 'functional_manager_score' },
  { file: 'src/lib/reportFieldRegistry.ts',               token: 'functional_manager_score' },
  { file: 'src/lib/reports/catalog.ts',                   token: 'functional_manager' },
  { file: 'src/lib/carriedScoreResolver.ts',              token: 'functional_manager_score' },
  { file: 'src/hooks/useKpis.ts',                         token: 'functional_manager_score' },
  { file: 'src/hooks/useKpiJourneyReport.ts',             token: 'functionalManagerAt' },
  { file: 'src/components/review/UnifiedScorecard.tsx',   token: 'functional_manager_score' },
  { file: 'src/lib/pdfExport.ts',                         token: 'avgFunctionalManagerScore' },
];

describe('ADR-194 §RPT-STAGE-COLUMN-PARITY', () => {
  it('keeps functional_manager_check in the canonical stage SSOT, after manager_check', () => {
    const stages = CANONICAL_WORKFLOW_STAGES as readonly string[];
    expect(stages).toContain('functional_manager_check');
    expect(stages.indexOf('functional_manager_check')).toBe(stages.indexOf('manager_check') + 1);
    expect(stages.indexOf('functional_manager_check')).toBeLessThan(stages.indexOf('skip_level_check'));
  });

  it.each(SURFACES)('$file references the Functional Manager stage', ({ file, token }) => {
    expect(read(file)).toContain(token);
  });
});
