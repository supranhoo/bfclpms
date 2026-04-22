import { describe, it, expect } from 'vitest';
import { fetchAllPaged } from '@/lib/fetchAll';

/**
 * Regression coverage for the "employee beyond row 1000 is invisible to picker"
 * bug class. See POLICY.md §94 (Profiles Query Policy).
 *
 * Scenario: simulate a >1000-row profiles dataset, ensure `fetchAllPaged`
 * walks all pages, and confirm an employee placed at index 1150 (well beyond
 * the PostgREST 1000-row default cap) is returned and discoverable through
 * the same client-side filter shape the EmployeeCombobox uses.
 */

type Profile = {
  id: string;
  full_name: string;
  employee_code: string;
  department: string;
};

function buildRoster(size: number, target: { index: number; profile: Profile }): Profile[] {
  const roster: Profile[] = [];
  for (let i = 0; i < size; i++) {
    if (i === target.index) {
      roster.push(target.profile);
    } else {
      roster.push({
        id: `id-${i}`,
        full_name: `Employee ${i.toString().padStart(5, '0')}`,
        employee_code: `EMP${i.toString().padStart(6, '0')}`,
        department: 'Operations',
      });
    }
  }
  return roster;
}

/**
 * Mirror of EmployeeCombobox's in-memory filter. Kept local so the test
 * doesn't pull in React/JSX rendering machinery — the bug is in the data
 * pipeline, not in the popover UX.
 */
function comboboxFilter(employees: Profile[], query: string, excludeIds: string[] = []) {
  const excludeSet = new Set(excludeIds);
  const q = query.toLowerCase();
  return employees.filter(e => {
    if (excludeSet.has(e.id)) return false;
    if (!q) return true;
    return (
      e.full_name.toLowerCase().includes(q) ||
      e.employee_code.toLowerCase().includes(q) ||
      e.department.toLowerCase().includes(q)
    );
  });
}

describe('Profiles Query Policy — picker paging regression', () => {
  const TARGET: Profile = {
    id: 'vivek-uuid',
    full_name: 'Vivek Kumar Dansena',
    employee_code: '101784',
    department: 'Production',
  };
  const ROSTER = buildRoster(2533, { index: 1150, profile: TARGET });

  it('fetchAllPaged returns all rows past the 1000-row PostgREST cap', async () => {
    const PAGE_SIZE = 1000;
    const fetchPage = async (from: number, to: number) => {
      const slice = ROSTER.slice(from, to + 1);
      return { data: slice, error: null };
    };
    const all = await fetchAllPaged<Profile>(fetchPage, PAGE_SIZE);
    expect(all).toHaveLength(ROSTER.length);
    expect(all.find(p => p.employee_code === '101784')).toBeDefined();
  });

  it('a single unpaged 1000-row fetch would silently hide the target employee', async () => {
    // Demonstrates the bug class — first 1000 rows do NOT contain row 1150.
    const cappedSlice = ROSTER.slice(0, 1000);
    expect(cappedSlice.find(p => p.employee_code === '101784')).toBeUndefined();
  });

  it('combobox filter finds the target employee by code when fed a fully-paged dataset', async () => {
    const all = await fetchAllPaged<Profile>(
      async (from, to) => ({ data: ROSTER.slice(from, to + 1), error: null }),
      1000,
    );
    expect(comboboxFilter(all, '101784')).toHaveLength(1);
    expect(comboboxFilter(all, 'Vivek')[0]?.id).toBe('vivek-uuid');
    expect(comboboxFilter(all, 'Production').some(p => p.id === 'vivek-uuid')).toBe(true);
  });

  it('combobox filter respects excludeIds (source/target picker contract)', async () => {
    const all = await fetchAllPaged<Profile>(
      async (from, to) => ({ data: ROSTER.slice(from, to + 1), error: null }),
      1000,
    );
    const filtered = comboboxFilter(all, 'Vivek', ['vivek-uuid']);
    expect(filtered).toHaveLength(0);
  });

  it('multi-select toggle preserves selection state across additions and removals', () => {
    let selected: string[] = [];
    const toggle = (id: string) => {
      const set = new Set(selected);
      if (set.has(id)) set.delete(id); else set.add(id);
      selected = [...set];
    };
    toggle('vivek-uuid');
    toggle('id-5');
    expect(selected).toEqual(['vivek-uuid', 'id-5']);
    toggle('vivek-uuid');
    expect(selected).toEqual(['id-5']);
  });
});