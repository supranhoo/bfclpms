/**
 * ADR-252c — a qualified result-set is stamped with the range it was computed
 * for. The report must reject a stamp that does not match the active filter,
 * which is what let an August result-set contaminate an Apr–Jun report.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tniRangeKey } from '@/lib/tni/tniQualification';

describe('TNI range stamp', () => {
  it('produces a stable key for a range', () => {
    expect(tniRangeKey([
      { month: 'April', year: 2026 },
      { month: 'May', year: 2026 },
      { month: 'June', year: 2026 },
    ])).toBe('April|2026,May|2026,June|2026');
  });

  it('differs between a single-month and a multi-month range', () => {
    expect(tniRangeKey([{ month: 'August', year: 2026 }]))
      .not.toBe(tniRangeKey([{ month: 'April', year: 2026 }, { month: 'August', year: 2026 }]));
  });

  it('treats an empty range as an empty stamp', () => {
    expect(tniRangeKey([])).toBe('');
    expect(tniRangeKey(undefined)).toBe('');
  });

  it('TNI hooks opt out of the global placeholderData carry-over', () => {
    const root = process.cwd();
    const qual = fs.readFileSync(path.join(root, 'src/hooks/useTniQualification.ts'), 'utf8');
    const tni = fs.readFileSync(path.join(root, 'src/hooks/useTNI.ts'), 'utf8');
    expect(qual).toMatch(/placeholderData:\s*undefined/);
    expect(tni).toMatch(/placeholderData:\s*undefined/);
  });

  it('the report guards on the stamp before rendering the qualified index', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/pages/reports/TNIReport.tsx'), 'utf8');
    expect(src).toMatch(/qualifiedRaw\.rangeKey !== activeRangeKey/);
    expect(src).toMatch(/staleRange \? undefined : qualifiedRaw/);
  });
});
