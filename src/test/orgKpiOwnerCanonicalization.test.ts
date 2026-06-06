import { describe, it, expect } from 'vitest';

// Mirrors the inline helper in useAssignOrgKpiOwner.
const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim();

describe('Org KPI owner canonical-key matching', () => {
  const masterKra = 'Implement 5S practices';
  const masterKpi =
    'Measures the level of workplace organization and cleanliness based on periodic 5S audits, improving safety and efficiency.\n- Formula: Average score from monthly 5S audits.\n- Scoring Logic: (5 for =5, 4 for 4, 3 for 3)';

  it('matches when newlines are collapsed to " - "', () => {
    const submittedKpi = masterKpi.replace(/\n/g, ' - ');
    expect(norm(submittedKpi)).toBe(norm(masterKpi));
  });

  it('matches when \\r\\n is present', () => {
    const submittedKpi = masterKpi.replace(/\n/g, '\r\n');
    expect(norm(submittedKpi)).toBe(norm(masterKpi));
  });

  it('does not falsely match a different KPI', () => {
    expect(norm('Adherence to Budget')).not.toBe(norm(masterKra));
  });
});