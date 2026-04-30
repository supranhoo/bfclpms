/**
 * React Query bindings for the IAC service layer.
 * UI components must use these hooks — never call iacService directly
 * inside a component if a hook exists, so caching stays consistent.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as iac from '@/services/iac/iacService';
import type { IacBulkAssignmentRow, IacScopeType, IacMatrixDiff } from '@/services/iac/types';

const KEY = ['iac'] as const;

export const useIacCapabilities = () =>
  useQuery({ queryKey: [...KEY, 'capabilities'], queryFn: iac.listCapabilities, staleTime: 5 * 60_000 });

export const useIacRoles = () =>
  useQuery({ queryKey: [...KEY, 'roles'], queryFn: iac.listRolesWithCapabilities, staleTime: 60_000 });

export const useIacAssignments = () =>
  useQuery({ queryKey: [...KEY, 'assignments'], queryFn: iac.listAssignments, staleTime: 30_000 });

export const useIacAudit = (limit = 200) =>
  useQuery({ queryKey: [...KEY, 'audit', limit], queryFn: () => iac.listAudit(limit), staleTime: 15_000 });

export const useIacPeople = (term: string) =>
  useQuery({
    queryKey: [...KEY, 'people', term],
    queryFn: () => iac.searchPeople(term),
    staleTime: 30_000,
  });

export function useGrantRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: iac.grantRole,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'assignments'] });
      qc.invalidateQueries({ queryKey: [...KEY, 'audit'] });
    },
  });
}

export function useRevokeAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: iac.revokeAssignment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'assignments'] });
      qc.invalidateQueries({ queryKey: [...KEY, 'audit'] });
    },
  });
}

export function useSetRoleCapabilities() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, caps }: { roleId: string; caps: string[] }) =>
      iac.setRoleCapabilities(roleId, caps),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'roles'] });
      qc.invalidateQueries({ queryKey: [...KEY, 'audit'] });
    },
  });
}

export function useApplyBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: IacBulkAssignmentRow[]) => iac.applyBulk(rows),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, 'assignments'] });
      qc.invalidateQueries({ queryKey: [...KEY, 'audit'] });
    },
  });
}

export function usePreviewBulk() {
  return useMutation({ mutationFn: (rows: IacBulkAssignmentRow[]) => iac.previewBulk(rows) });
}

export function useExportAssignments() {
  return useMutation({ mutationFn: () => iac.exportAssignments() });
}

export function useExportRoleMatrix() {
  return useMutation({ mutationFn: () => iac.exportRoleMatrix() });
}

export function useLoadMatrixLookups() {
  return useMutation({ mutationFn: () => iac.loadMatrixLookups() });
}

export function useApplyMatrixDiff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ diff, fileName }: { diff: IacMatrixDiff; fileName?: string }) =>
      iac.applyMatrixDiff(diff, fileName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['iac', 'assignments'] });
      qc.invalidateQueries({ queryKey: ['iac', 'audit'] });
    },
  });
}

export type { IacScopeType };