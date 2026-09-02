import { describe, it, expect } from 'vitest';
import { resolveKpiDueState } from '@/lib/review/kpiDueForPeriod';
describe('derived multi-month anchors lock every non-terminal month', () => {
  it('bi-monthly Jul-Aug locks Sep', () => {
    const a = resolveKpiDueState(['Bi-Monthly'], ['Jul-Aug'], 'September', 2026);
    const b = resolveKpiDueState(['Bi-Monthly'], ['Jan-Feb','Jul-Aug'], 'September', 2026);
    console.log(JSON.stringify(a), JSON.stringify(b));
    expect(a.due).toBe(false);
    expect(b.due).toBe(false);
    expect(resolveKpiDueState(['Bi-Monthly'], ['Jul-Aug'], 'October', 2026).due).toBe(true);
    expect(resolveKpiDueState(['Quarterly'], ['Feb-Apr'], 'April', 2026).due).toBe(true);
    expect(resolveKpiDueState(['Quarterly'], ['Feb-Apr'], 'June', 2026).due).toBe(false);
  });
});
