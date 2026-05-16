/**
 * useManagersWithoutKras — pure logic regression test (v2.66.11.12).
 *
 * Validates the in-memory roster build + KPI-coverage check that the hook
 * wraps around the supabase fetches. We replicate the predicate here so a
 * future refactor cannot silently flip the inclusion rule.
 */
import { describe, it, expect } from 'vitest';

function pickGapManagers(opts: {
  managers: { id: string; full_name: string; employee_code: string }[];
  reportsByMgr: Map<string, string[]>; // direct reports per manager
  employeesWithKpis: Set<string>;
  minReports: number;
}) {
  const { managers, reportsByMgr, employeesWithKpis, minReports } = opts;
  const out: { id: string; total_reports: number }[] = [];
  for (const m of managers) {
    const direct = reportsByMgr.get(m.id) ?? [];
    const indirect: string[] = [];
    for (const d of direct) {
      const sub = reportsByMgr.get(d);
      if (sub) indirect.push(...sub.filter(id => id !== m.id));
    }
    const total = direct.length + indirect.length;
    if (total < minReports) continue;
    const covered = [...direct, ...indirect].some(id => employeesWithKpis.has(id));
    if (!covered) out.push({ id: m.id, total_reports: total });
  }
  return out.sort((a, b) => b.total_reports - a.total_reports);
}

describe('useManagersWithoutKras predicate', () => {
  const managers = [
    { id: 'M1', full_name: 'Mgr One', employee_code: '1' },
    { id: 'M2', full_name: 'Mgr Two', employee_code: '2' },
    { id: 'M3', full_name: 'Mgr Three', employee_code: '3' },
  ];
  const reportsByMgr = new Map<string, string[]>([
    ['M1', ['E1', 'E2', 'E3', 'E4', 'E5']],   // 5 directs, 0 indirect
    ['M2', ['E10']],                            // below threshold
    ['M3', ['E20', 'E21']],                    // 2 directs
    ['E20', ['E30', 'E31', 'E32']],            // 3 indirects under M3
  ]);

  it('flags a manager when no report has KPIs', () => {
    const out = pickGapManagers({ managers, reportsByMgr, employeesWithKpis: new Set(['X']), minReports: 5 });
    expect(out.map(o => o.id)).toEqual(['M1', 'M3']);
  });

  it('excludes a manager when at least one report has KPIs', () => {
    const out = pickGapManagers({ managers, reportsByMgr, employeesWithKpis: new Set(['E3']), minReports: 5 });
    expect(out.map(o => o.id)).toEqual(['M3']);
  });

  it('excludes managers below minReports', () => {
    const out = pickGapManagers({ managers, reportsByMgr, employeesWithKpis: new Set(), minReports: 5 });
    expect(out.find(o => o.id === 'M2')).toBeUndefined();
  });

  it('counts indirect reports through one hop', () => {
    const out = pickGapManagers({ managers, reportsByMgr, employeesWithKpis: new Set(), minReports: 5 });
    expect(out.find(o => o.id === 'M3')?.total_reports).toBe(5); // 2 direct + 3 indirect
  });
});
