import { describe, it, expect } from 'vitest';
import { findCanonicalKpiSignature, normalizeKpiKey } from '@/lib/orgKpiKey';

// Mirrors the inline helper in useAssignOrgKpiOwner.
const norm = (s: string) => (s || '').replace(/\s+/g, ' ').trim();

describe('Org KPI owner canonical-key matching', () => {
  const masterKra = 'Implement 5S practices';
  const masterKpi =
    'Measures the level of workplace organization and cleanliness based on periodic 5S audits, improving safety and efficiency.\n- Formula: Average score from monthly 5S audits.\n- Scoring Logic: (5 for =5, 4 for 4, 3 for 3)';

  it('matches when newlines are collapsed to whitespace', () => {
    const submittedKpi = masterKpi.replace(/\n/g, ' ');
    expect(norm(submittedKpi)).toBe(norm(masterKpi));
  });

  it('matches when \\r\\n is present', () => {
    const submittedKpi = masterKpi.replace(/\n/g, '\r\n');
    expect(norm(submittedKpi)).toBe(norm(masterKpi));
  });

  it('does not falsely match a different KPI', () => {
    expect(norm('Adherence to Budget')).not.toBe(norm(masterKra));
  });

  it('returns the canonical database signature before owner insert/read', () => {
    const submittedKpi = masterKpi.replace(/\n/g, ' ');
    expect(findCanonicalKpiSignature([{ kra_name: masterKra, kpi_name: masterKpi }], masterKra, submittedKpi)).toEqual({
      kraName: masterKra,
      kpiName: masterKpi,
    });
  });

  it('uses normalized lookup keys so existing owners are not shown as missing', () => {
    const ownerRowKey = normalizeKpiKey('cat-1', masterKra, masterKpi);
    const dialogKey = normalizeKpiKey('cat-1', masterKra, masterKpi.replace(/\n/g, ' '));
    expect(dialogKey).toBe(ownerRowKey);
  });
});