import { describe, it, expect, vi } from 'vitest';

/**
 * Locks the contract of the edit branch in AddReviewNoteSheet:
 *  - subject_employee_id is NEVER part of the patch (immutable post-creation)
 *  - applicable_from is normalised to first-of-month before write
 *  - only the user-editable fields are passed through
 */

import {
  normaliseToFirstOfMonth,
  updateReviewNote,
} from '@/services/reviewNotes/reviewNotesService';

vi.mock('@/integrations/supabase/client', () => {
  const single = vi.fn().mockResolvedValue({ data: { id: 'n1' }, error: null });
  const select = vi.fn(() => ({ single }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { supabase: { from }, __mocks: { from, update, eq, select, single } };
});

describe('review note edit patch shape', () => {
  it('snaps applicable_from to first-of-month', () => {
    expect(normaliseToFirstOfMonth('2026-05-17')).toBe('2026-05-01');
    expect(normaliseToFirstOfMonth(null)).toBeNull();
    expect(normaliseToFirstOfMonth('')).toBeNull();
  });

  it('updateReviewNote forwards only the patched fields and snaps the month', async () => {
    const mod: any = await import('@/integrations/supabase/client');
    const { __mocks } = mod;
    await updateReviewNote('n1', {
      title: '  edited title  ',
      details: '  more context  ',
      category: 'new_kpi',
      priority: 'high',
      applicable_from: '2026-07-22',
    } as any);
    const patchArg = __mocks.update.mock.calls[0][0];
    // Subject is intentionally locked — never appears in a UI-driven edit patch.
    expect(patchArg).not.toHaveProperty('subject_employee_id');
    expect(patchArg.applicable_from).toBe('2026-07-01');
    expect(patchArg.category).toBe('new_kpi');
    expect(patchArg.priority).toBe('high');
  });

  it('passes through null applicable_from cleanly', async () => {
    const mod: any = await import('@/integrations/supabase/client');
    const { __mocks } = mod;
    __mocks.update.mockClear();
    await updateReviewNote('n1', { applicable_from: null } as any);
    expect(__mocks.update.mock.calls[0][0].applicable_from).toBeNull();
  });
});
