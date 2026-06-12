import { describe, it, expect } from 'vitest';
import {
  INCIDENT_EXPORT_COLUMNS,
  MAX_INCIDENT_EXPORT_ROWS,
  rowToRecord,
} from '@/lib/safetyIncidentExcelExport';

describe('Safety Incident Excel Export — Phase 4', () => {
  it('locks the exact column order per spec', () => {
    expect([...INCIDENT_EXPORT_COLUMNS]).toEqual([
      'Incident ID',
      'Type',
      'Severity',
      'Business Unit',
      'Created By',
      'Reported By',
      'Actual Reporter',
      'Assigned User',
      'Status',
      'SLA Status',
      'Created Date',
      'Closed Date',
      'Closure Remarks',
    ]);
  });

  it('caps at MAX_INCIDENT_EXPORT_ROWS = 50,000 to protect the client', () => {
    expect(MAX_INCIDENT_EXPORT_ROWS).toBe(50_000);
  });

  it('maps a raw row into the locked record shape with hydrated lookups', () => {
    const buMap = new Map([['bu-1', { name: 'Plant A', code: 'PA' }]]);
    const profMap = new Map([
      ['u-rep', { full_name: 'Alice', employee_code: 'E001' }],
      ['u-act', { full_name: 'Bob', employee_code: 'E002' }],
      ['u-asg', { full_name: 'Carol', employee_code: null }],
    ]);
    const rec = rowToRecord(
      {
        id: 'i1',
        incident_number: 'INC-001',
        type_label_snapshot: 'Near Miss',
        severity_label_snapshot: 'Low',
        business_unit_id: 'bu-1',
        reporter_id: 'u-rep',
        actual_reporter_id: 'u-act',
        assigned_to: 'u-asg',
        status: 'investigation',
        sla_status: 'on_track',
        created_at: '2026-06-12T07:30:00Z',
        closed_at: null,
        verification_notes: null,
      },
      buMap,
      profMap,
    );
    expect(rec['Incident ID']).toBe('INC-001');
    expect(rec['Type']).toBe('Near Miss');
    expect(rec['Severity']).toBe('Low');
    expect(rec['Business Unit']).toBe('Plant A (PA)');
    expect(rec['Reported By']).toBe('Alice (E001)');
    expect(rec['Actual Reporter']).toBe('Bob (E002)');
    expect(rec['Assigned User']).toBe('Carol');
    expect(rec['Status']).toBe('investigation');
    expect(rec['Closed Date']).toBe('');
    expect(rec['Closure Remarks']).toBe('');
  });

  it('handles missing lookups and empty optional fields gracefully', () => {
    const rec = rowToRecord(
      { id: 'i2', status: 'reported' },
      new Map(),
      new Map(),
    );
    expect(rec['Incident ID']).toBe('i2');
    expect(rec['Business Unit']).toBe('');
    expect(rec['Reported By']).toBe('');
    expect(rec['Actual Reporter']).toBe('');
    expect(rec['Created Date']).toBe('');
  });
});