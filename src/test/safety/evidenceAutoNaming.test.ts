import { describe, it, expect } from 'vitest';
import {
  EVIDENCE_STAGE_DISPLAY_LABEL,
  buildEvidenceDisplayName,
  nextEvidenceSequence,
  safeEmployeeCode,
} from '@/lib/safetyEvidenceNaming';

describe('Safety Evidence — Auto Naming Convention', () => {
  it('uses the documented stage labels', () => {
    expect(EVIDENCE_STAGE_DISPLAY_LABEL.report).toBe('Reported');
    expect(EVIDENCE_STAGE_DISPLAY_LABEL.rca).toBe('RCA');
    expect(EVIDENCE_STAGE_DISPLAY_LABEL.capa).toBe('CAPA');
    expect(EVIDENCE_STAGE_DISPLAY_LABEL.verification).toBe('Verification');
  });

  it('builds names in the {Stage}_{EmpCode}_v{n} format', () => {
    expect(
      buildEvidenceDisplayName({ stage: 'rca', employeeCode: '101966', sequence: 1 }),
    ).toBe('RCA_101966_v1');
    expect(
      buildEvidenceDisplayName({ stage: 'report', employeeCode: '101966', sequence: 3 }),
    ).toBe('Reported_101966_v3');
  });

  it('starts at v1 when no prior rows match', () => {
    expect(
      nextEvidenceSequence({
        rows: [],
        stage: 'rca',
        uploadedBy: 'u1',
        employeeCode: '101966',
      }),
    ).toBe(1);
  });

  it('increments past the highest existing _v{n} for the same stage+user', () => {
    const rows = [
      { stage: 'rca' as const, uploaded_by: 'u1', file_name: 'RCA_101966_v1' },
      { stage: 'rca' as const, uploaded_by: 'u1', file_name: 'RCA_101966_v2' },
      // Different user — must not affect counter.
      { stage: 'rca' as const, uploaded_by: 'u2', file_name: 'RCA_999_v9' },
      // Different stage — must not affect counter.
      { stage: 'capa' as const, uploaded_by: 'u1', file_name: 'CAPA_101966_v5' },
      // Legacy non-conforming filename — must be ignored.
      { stage: 'rca' as const, uploaded_by: 'u1', file_name: 'IMG_1234.jpg' },
    ];
    expect(
      nextEvidenceSequence({ rows, stage: 'rca', uploadedBy: 'u1', employeeCode: '101966' }),
    ).toBe(3);
  });

  it('falls back to an opaque id slice when employee code is missing', () => {
    const code = safeEmployeeCode(null, '11112222-3333-4444-5555-666677778888');
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
  });

  it('sanitizes employee codes by stripping non-alphanumerics', () => {
    expect(safeEmployeeCode('EMP/101', 'u')).toBe('EMP101');
  });
});