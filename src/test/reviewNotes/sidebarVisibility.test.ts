import { describe, it, expect } from 'vitest';
import { DEFAULT_REVIEW_NOTE_ACCESS, parseAccessConfig } from '@/hooks/useReviewNoteAccess';
import type { AppRole } from '@/lib/roles';

/**
 * Pure replication of the AppSidebar `gateReviewNotes` decision so the rule
 * can be regression-tested without rendering the whole sidebar.
 *
 * Allowed iff:
 *   - role is in `view`  (full Review Notes access), OR
 *   - role is in `view_own_subject` (employee-style restricted access)
 */
function isReviewNotesAllowed(role: AppRole | null, cfg = DEFAULT_REVIEW_NOTE_ACCESS) {
  if (!role) return false;
  if (cfg.view.includes(role)) return true;
  if (cfg.view_own_subject.includes(role)) return true;
  return false;
}

describe('Sidebar Review Notes visibility gate', () => {
  const cfg = parseAccessConfig({
    view: ['admin', 'hr_pms', 'manager', 'skip_level', 'management', 'auditor'],
    create: ['admin', 'hr_pms'],
    edit: ['admin', 'hr_pms'],
    delete: ['admin', 'hr_pms'],
    view_own_subject: ['employee'],
  });

  it('hides Review Notes when role is not in view and not in view_own_subject', () => {
    const cfgNoEmployee = { ...cfg, view_own_subject: [] as AppRole[] };
    expect(isReviewNotesAllowed('employee', cfgNoEmployee)).toBe(false);
  });

  it('shows Review Notes for roles in the view list', () => {
    expect(isReviewNotesAllowed('hr_pms', cfg)).toBe(true);
    expect(isReviewNotesAllowed('manager', cfg)).toBe(true);
    expect(isReviewNotesAllowed('admin', cfg)).toBe(true);
  });

  it('shows Review Notes for roles only in view_own_subject', () => {
    expect(isReviewNotesAllowed('employee', cfg)).toBe(true);
  });

  it('hides Review Notes when no role is resolved (logged out / loading)', () => {
    expect(isReviewNotesAllowed(null, cfg)).toBe(false);
  });

  it('honours admin-edited DB config that drops a role', () => {
    const tighter = parseAccessConfig({
      ...cfg,
      view: ['admin', 'hr_pms'],
      view_own_subject: [],
    });
    expect(isReviewNotesAllowed('manager', tighter)).toBe(false);
    expect(isReviewNotesAllowed('employee', tighter)).toBe(false);
    expect(isReviewNotesAllowed('hr_pms', tighter)).toBe(true);
    expect(isReviewNotesAllowed('admin', tighter)).toBe(true);
  });
});