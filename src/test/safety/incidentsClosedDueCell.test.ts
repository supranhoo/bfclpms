import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Locks the v2.66.21.1 fix: the Incidents table's Due / Remaining cell must
 * branch on `status` so closed / orphaned rows never render the live
 * formatDistanceToNowStrict("in N days" / "overdue by …") countdown.
 */
describe('SafetyIncidents — closed-row Due/Remaining suppression', () => {
  const src = readFileSync(
    path.resolve(__dirname, '../../pages/safety/SafetyIncidents.tsx'),
    'utf8',
  );

  it('branches the Due/Remaining cell on closed/orphaned status', () => {
    expect(src).toMatch(/i\.status === 'closed' \|\| i\.status === 'orphaned'/);
  });

  it('renders closed_at timestamp for terminal rows', () => {
    expect(src).toMatch(/Closed \{format\(new Date\(i\.closed_at\)/);
  });

  it('keeps the live countdown only in the non-terminal branch', () => {
    // The countdown line must appear AFTER the terminal-status branch so
    // closed rows never reach it.
    const terminalIdx = src.indexOf("i.status === 'closed'");
    const countdownIdx = src.indexOf('formatDistanceToNowStrict(new Date(i.sla_due_at))');
    expect(terminalIdx).toBeGreaterThan(-1);
    expect(countdownIdx).toBeGreaterThan(terminalIdx);
  });
});