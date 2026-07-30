import { describe, it, expect } from 'vitest';
import {
  assistedRowsToCsv, evidenceLabel, ASSISTED_PAGE_SIZE,
  type AssistedSubmissionRow,
} from '@/services/annualReview/assistedSubmissions';

const base: AssistedSubmissionRow = {
  id: 'a1', instance_id: 'i1', cycle_id: 'c1',
  employee_id: 'e1', employee_name: 'Anup Kumar', employee_code: '101381',
  department_id: 'd1', department_name: 'DRI',
  business_unit_id: 'b1', business_unit_name: 'Steel',
  proxy_user_id: 'p1', proxy_name: 'Twinkle Kumar', proxy_code: '200679', proxy_role: 'manager',
  captured_at: '2026-07-01T10:00:00Z',
  selfie_path: 'selfies/a.jpg', photo_upload_path: 'photos/a.jpg',
  has_selfie: true, has_photo: true,
  declaration_text: 'I confirm, on behalf of the employee, that the scores are accurate.',
  user_agent: 'Chrome', ip: '10.0.0.1', overall_status: 'completed', total_count: 1,
};

describe('ADR-203 assisted submissions', () => {
  it('pages server-side in bounded chunks', () => {
    expect(ASSISTED_PAGE_SIZE).toBe(25);
  });

  it('labels complete evidence', () => {
    expect(evidenceLabel(base)).toBe('Selfie + photo');
  });

  it('flags each missing-evidence permutation distinctly', () => {
    expect(evidenceLabel({ ...base, has_photo: false })).toBe('Selfie only');
    expect(evidenceLabel({ ...base, has_selfie: false })).toBe('Photo only');
    expect(evidenceLabel({ ...base, has_selfie: false, has_photo: false })).toBe('None');
  });

  it('exports a header plus one row per record', () => {
    const csv = assistedRowsToCsv([base]);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Employee Code');
    expect(lines[1]).toContain('101381');
    expect(lines[1]).toContain('Twinkle Kumar');
  });

  it('quotes fields containing commas so columns do not shift', () => {
    const csv = assistedRowsToCsv([{ ...base, department_name: 'DRI, SMS' }]);
    expect(csv).toContain('"DRI, SMS"');
  });

  it('never leaks storage object paths or declaration text into the export', () => {
    const csv = assistedRowsToCsv([base]);
    expect(csv).not.toContain('selfies/a.jpg');
    expect(csv).not.toContain('photos/a.jpg');
    expect(csv).not.toContain('I confirm');
    expect(csv).toContain('Yes,Yes,Selfie + photo');
  });

  it('renders empty export as header only', () => {
    expect(assistedRowsToCsv([]).trim().split('\n')).toHaveLength(1);
  });
});
