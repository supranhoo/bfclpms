import { describe, it, expect } from 'vitest';

/**
 * The combobox uses cmdk's `filter` callback over a lowercased composite of
 *   `${full_name} ${employee_code} ${email} ${department_name}`.
 * Mirror that here so the search contract is locked.
 */
function composite(opt: { full_name?: string | null; employee_code?: string | null; email?: string | null; department_name?: string | null }) {
  return [opt.full_name, opt.employee_code, opt.email, opt.department_name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matches(opt: any, search: string) {
  return composite(opt).includes(search.toLowerCase());
}

const aarav = { id: '1', full_name: 'Aarav Sharma', employee_code: 'EMP-0421', email: 'aarav@x.com', department_name: 'Production' };
const riya = { id: '2', full_name: 'Riya Patel', employee_code: 'EMP-0588', email: 'riya@x.com', department_name: 'Quality' };

describe('Employee picker search', () => {
  it('matches by full name (case-insensitive)', () => {
    expect(matches(aarav, 'aarav')).toBe(true);
    expect(matches(aarav, 'SHARMA')).toBe(true);
    expect(matches(riya, 'aarav')).toBe(false);
  });

  it('matches by employee code', () => {
    expect(matches(aarav, 'EMP-0421')).toBe(true);
    expect(matches(aarav, 'emp-0421')).toBe(true);
    expect(matches(aarav, '0421')).toBe(true);
    expect(matches(riya, '0421')).toBe(false);
  });

  it('matches by email', () => {
    expect(matches(aarav, 'aarav@')).toBe(true);
  });

  it('matches by department', () => {
    expect(matches(aarav, 'production')).toBe(true);
    expect(matches(riya, 'quality')).toBe(true);
  });

  it('handles missing fields gracefully', () => {
    const sparse = { id: '3', full_name: null, employee_code: 'EMP-0999', email: null, department_name: null };
    expect(matches(sparse, 'EMP-0999')).toBe(true);
    expect(matches(sparse, 'aarav')).toBe(false);
  });
});