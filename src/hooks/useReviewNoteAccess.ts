import { useMemo } from 'react';
import { useSystemSetting } from '@/hooks/useSystemSettings';
import { useAuth } from '@/contexts/AuthContext';
import type { AppRole } from '@/lib/roles';

export interface ReviewNoteAccessConfig {
  view: AppRole[];
  create: AppRole[];
  edit: AppRole[];
  delete: AppRole[];
  view_own_subject: AppRole[];
}

export const DEFAULT_REVIEW_NOTE_ACCESS: ReviewNoteAccessConfig = {
  view: ['admin', 'hr_pms', 'manager', 'skip_level', 'management', 'auditor'],
  create: ['admin', 'hr_pms', 'manager', 'skip_level'],
  edit: ['admin', 'hr_pms'],
  delete: ['admin', 'hr_pms'],
  view_own_subject: ['employee'],
};

export function parseAccessConfig(raw: unknown): ReviewNoteAccessConfig {
  let value: any = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return DEFAULT_REVIEW_NOTE_ACCESS; }
  }
  if (!value || typeof value !== 'object') return DEFAULT_REVIEW_NOTE_ACCESS;
  const arr = (k: string, fallback: AppRole[]): AppRole[] =>
    Array.isArray(value[k]) ? (value[k].filter((r: unknown) => typeof r === 'string') as AppRole[]) : fallback;
  const cfg: ReviewNoteAccessConfig = {
    view: arr('view', DEFAULT_REVIEW_NOTE_ACCESS.view),
    create: arr('create', DEFAULT_REVIEW_NOTE_ACCESS.create),
    edit: arr('edit', DEFAULT_REVIEW_NOTE_ACCESS.edit),
    delete: arr('delete', DEFAULT_REVIEW_NOTE_ACCESS.delete),
    view_own_subject: arr('view_own_subject', DEFAULT_REVIEW_NOTE_ACCESS.view_own_subject),
  };
  // Defensive: admin is always included
  (['view', 'create', 'edit', 'delete'] as const).forEach((k) => {
    if (!cfg[k].includes('admin')) cfg[k] = ['admin', ...cfg[k]];
  });
  return cfg;
}

export interface ReviewNoteAccess {
  config: ReviewNoteAccessConfig;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** Whether the user can view a note about a specific subject employee. */
  canViewSubject: (subjectEmployeeId: string | null | undefined) => boolean;
  isLoading: boolean;
}

export function useReviewNoteAccess(): ReviewNoteAccess {
  const { effectiveRole, user } = useAuth();
  const { data, isLoading } = useSystemSetting('review_action_notes_visibility');

  return useMemo(() => {
    const config = parseAccessConfig(data?.setting_value);
    const role = effectiveRole;
    const has = (list: AppRole[]) => !!role && list.includes(role);
    const canView = has(config.view);
    const canViewOwn = has(config.view_own_subject);

    return {
      config,
      canView,
      canCreate: has(config.create),
      canEdit: has(config.edit),
      canDelete: has(config.delete),
      canViewSubject: (subjectEmployeeId) => {
        if (canView) return true;
        if (canViewOwn && subjectEmployeeId && user?.id === subjectEmployeeId) return true;
        return false;
      },
      isLoading,
    };
  }, [data, effectiveRole, user?.id, isLoading]);
}