import { describe, it } from 'vitest';
import { resolveKpiDueState } from '@/lib/review/kpiDueForPeriod';
describe('d', () => { it('x', () => {
  console.log('A', JSON.stringify(resolveKpiDueState(['Bi-Monthly'], ['Jul-Aug'], 'September', 2026)));
  console.log('B', JSON.stringify(resolveKpiDueState(['Bi-Monthly'], ['Jan-Feb','Jul-Aug'], 'September', 2026)));
});});
