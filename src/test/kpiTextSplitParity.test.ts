/**
 * ADR-269 — parity fixtures: each case is a real FY 2026-27 KPI string whose
 * expected split was captured from the PL/pgSQL splitter (public.kpi_split_text).
 * The TypeScript parser must produce identical parts, or preview and applied
 * data would disagree.
 */
import { describe, expect, it } from 'vitest';
import { splitKpiText } from '@/lib/kpiTextSplit';

const CASES = [
  {
    raw: `Adherence to JIADA land allotment, possession and lease deed execution as per approved timeline, measured by days delayed
- Formula: (Actual completion date – Approved deadline date) in days
- Scoring Logic: Rating 5: No delay, Rating 0: Any delay`,
    expected: {
      title: 'Adherence to JIADA land allotment, possession and lease deed execution as per approved timeline, measured by days delayed',
      description: null,
      formula: '(Actual completion date – Approved deadline date) in days',
      scoring_logic: 'Rating 5: No delay, Rating 0: Any delay',
      confidence: 'review',
    },
  },
  {
    raw: `- Description: Measures the effectiveness of the employee confirmation process.  
- Formula: Number of missed assessments and confirmations.
- Scoring Logic: (Scoring: 5 for zero missouts, 0 for 1 or more missouts)`,
    expected: {
      title: null,
      description: 'Measures the effectiveness of the employee confirmation process.',
      formula: 'Number of missed assessments and confirmations.',
      scoring_logic: '(Scoring: 5 for zero missouts, 0 for 1 or more missouts)',
      confidence: 'review',
    },
  },
  {
    raw: `Cost control
Description: Keep spend within the approved budget
Formula: Actual cost / Budget
Scoring Logic: 5 = <=100%, 0 = >110%`,
    expected: {
      title: 'Cost control',
      description: 'Keep spend within the approved budget',
      formula: 'Actual cost / Budget',
      scoring_logic: '5 = <=100%, 0 = >110%',
      confidence: 'high',
    },
  },
  {
    raw: 'Daily production report shared with HOD',
    expected: {
      title: 'Daily production report shared with HOD',
      description: null,
      formula: null,
      scoring_logic: null,
      confidence: 'unparsed',
    },
  },
  {
    raw: '   ',
    expected: { title: null, description: null, formula: null, scoring_logic: null, confidence: 'empty' },
  },
];

describe('kpi text split — SQL/TS parity fixtures', () => {
  it.each(CASES.map((c, i) => [i, c] as const))('case %i matches the SQL splitter', (_i, c) => {
    const parts = splitKpiText(c.raw);
    expect(parts.title).toBe(c.expected.title);
    expect(parts.description).toBe(c.expected.description);
    expect(parts.formula).toBe(c.expected.formula);
    expect(parts.scoring_logic).toBe(c.expected.scoring_logic);
    expect(parts.confidence).toBe(c.expected.confidence);
  });
});
