import { useCallback, useEffect, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as svc from '@/services/annualReview/annualReviewService';
import { supabase } from '@/integrations/supabase/client';
import type {
  AnnualReviewerRole,
  AnnualReviewInstance,
  AnnualReviewResponse,
  EvidenceItem,
} from '@/types/annualReview';

export const annualReviewKeys = {
  all:        ['annualReview'] as const,
  cycles:     () => [...annualReviewKeys.all, 'cycles'] as const,
  activeCycle:() => [...annualReviewKeys.all, 'cycle', 'active'] as const,
  templates:  () => [...annualReviewKeys.all, 'templates'] as const,
  template:   (id: string) => [...annualReviewKeys.all, 'template', id] as const,
  rules:      (cycleId?: string) => [...annualReviewKeys.all, 'rules', cycleId ?? '*'] as const,
  cycleInstances:    (cycleId: string) => [...annualReviewKeys.all, 'instances', cycleId] as const,
  myInstance:        (employeeId: string, cycleId: string) => [...annualReviewKeys.all, 'instance', employeeId, cycleId] as const,
  reviewerInstances: (reviewerId: string, cycleId: string) => [...annualReviewKeys.all, 'reviewerInstances', reviewerId, cycleId] as const,
  responses:         (instanceId: string) => [...annualReviewKeys.all, 'responses', instanceId] as const,
};

export const useCycles = () => useQuery({ queryKey: annualReviewKeys.cycles(), queryFn: svc.listCycles });
export const useActiveCycle = () => useQuery({ queryKey: annualReviewKeys.activeCycle(), queryFn: svc.getActiveCycle });
export const useTemplates = () => useQuery({ queryKey: annualReviewKeys.templates(), queryFn: svc.listTemplates });
export const useTemplate = (id: string | undefined) =>
  useQuery({ queryKey: annualReviewKeys.template(id ?? ''), queryFn: () => svc.getTemplate(id!), enabled: !!id });
export const useRules = (cycleId?: string) =>
  useQuery({ queryKey: annualReviewKeys.rules(cycleId), queryFn: () => svc.listRules(cycleId), enabled: !!cycleId });
export const useCycleInstances = (cycleId?: string) =>
  useQuery({ queryKey: annualReviewKeys.cycleInstances(cycleId ?? ''), queryFn: () => svc.listInstancesForCycle(cycleId!), enabled: !!cycleId });

export const useAnnualReviewInstancesPaginated = (args: svc.ListInstancesPaginatedArgs | undefined) =>
  useQuery({
    queryKey: [...annualReviewKeys.all, 'instancesPaginated', args],
    queryFn: () => svc.listInstancesPaginated(args!),
    enabled: !!args?.cycleId,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

export const useCycleStatusCounts = (cycleId?: string) =>
  useQuery({
    queryKey: [...annualReviewKeys.all, 'statusCounts', cycleId ?? ''],
    queryFn: () => svc.getCycleStatusCounts(cycleId!),
    enabled: !!cycleId,
    staleTime: 30_000,
  });

/** Phase 4: recent stage-weight override audit feed for the Progress tab. */
export const useRecentStageWeightsOverrideAudits = (cycleId?: string, limit = 25) =>
  useQuery({
    queryKey: [...annualReviewKeys.all, 'stageWeightsOverrideAudits', cycleId ?? '', limit],
    queryFn: () => svc.listRecentStageWeightsOverrideAudits(cycleId, limit),
    enabled: !!cycleId,
    staleTime: 30_000,
  });
export const useMyInstance = (employeeId?: string, cycleId?: string) =>
  useQuery({
    queryKey: annualReviewKeys.myInstance(employeeId ?? '', cycleId ?? ''),
    queryFn: () => svc.getInstanceForEmployee(employeeId!, cycleId!),
    enabled: !!employeeId && !!cycleId,
  });
export const useReviewerInstances = (reviewerId?: string, cycleId?: string) =>
  useQuery({
    queryKey: annualReviewKeys.reviewerInstances(reviewerId ?? '', cycleId ?? ''),
    queryFn: () => svc.listInstancesForReviewer(reviewerId!, cycleId!),
    enabled: !!reviewerId && !!cycleId,
  });

/**
 * Paginated reviewer queue — replaces `useReviewerInstances` on the Team page.
 * Uses `keepPreviousData` so page changes don't flash an empty list.
 */
export const useReviewerInstancesPaginated = (
  reviewerId: string | undefined,
  cycleId: string | undefined,
  opts: { page: number; pageSize: number; search?: string; status?: svc.ListReviewerInstancesPaginatedArgs['status'] },
) =>
  useQuery({
    queryKey: [
      ...annualReviewKeys.all,
      'reviewerInstancesPaginated',
      reviewerId ?? '',
      cycleId ?? '',
      opts,
    ],
    queryFn: () =>
      svc.listInstancesForReviewerPaginated({
        reviewerId: reviewerId!,
        cycleId: cycleId!,
        page: opts.page,
        pageSize: opts.pageSize,
        search: opts.search,
        status: opts.status,
      }),
    enabled: !!reviewerId && !!cycleId,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

/**
 * Single-instance fetcher for the Team Annual Review detail page.
 * Cached separately so navigation between list and detail is instant when the
 * row was already loaded as part of the paged queue.
 */
export const useReviewInstance = (instanceId: string | undefined) =>
  useQuery({
    queryKey: [...annualReviewKeys.all, 'instanceById', instanceId ?? ''],
    queryFn: () => svc.getInstanceById(instanceId!),
    enabled: !!instanceId,
    staleTime: 15_000,
  });
export const useInstanceResponses = (instanceId?: string) =>
  useQuery({
    queryKey: annualReviewKeys.responses(instanceId ?? ''),
    queryFn: () => svc.listResponses(instanceId!),
    enabled: !!instanceId,
  });

/**
 * Per-stage weighted_score rollup for a set of instances (one batched .in()
 * query per 200 IDs). Used by the Progress grid to show per-reviewer scores
 * inline without N+1 loads. Skips empty arrays.
 */
export const useInstanceStageScores = (instanceIds: string[]) =>
  useQuery({
    queryKey: [...annualReviewKeys.all, 'stageScores', ...instanceIds].slice(0, 50),
    queryFn: () => svc.fetchInstanceStageScores(instanceIds),
    enabled: instanceIds.length > 0,
    staleTime: 30_000,
  });

/**
 * Master switch read for the Annual Review module — used by the sidebar to
 * gate the entry points. Evaluates `admin_feature_flags.annual_review_enabled`
 * server-side (admins bypass once the master switch is ON).
 */
export function useAnnualReviewFlag() {
  return useQuery({
    queryKey: ['admin_feature_flag', 'annual_review_enabled'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc(
        'is_feature_flag_enabled_for_me' as never,
        { p_key: 'annual_review_enabled' } as never,
      );
      if (error) return false;
      return data === true;
    },
  });
}

export function useAdvanceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { instanceId: string; role: AnnualReviewerRole }) => svc.advanceStatus(args.instanceId, args.role),
    onSuccess: () => qc.invalidateQueries({ queryKey: annualReviewKeys.all }),
  });
}

export function useSendBackStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { instanceId: string; role: AnnualReviewerRole; reason: string | null }) =>
      svc.sendBackStatus(args.instanceId, args.role, args.reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: annualReviewKeys.all }),
  });
}

export function useUploadEvidence() {
  return useMutation({
    mutationFn: (args: { instanceId: string; reviewerId: string; role: AnnualReviewerRole; file: File }) =>
      svc.uploadEvidence(args),
  });
}

export function useFinalizeInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: svc.finalizeInstance,
    onSuccess: () => qc.invalidateQueries({ queryKey: annualReviewKeys.all }),
  });
}

export function useInstanceTimeline(instanceId: string | undefined) {
  return useQuery({
    queryKey: [...annualReviewKeys.all, 'timeline', instanceId ?? ''],
    queryFn: () => svc.listInstanceTimeline(instanceId!),
    enabled: !!instanceId,
    staleTime: 30_000,
  });
}

export function useCloseCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: svc.closeCycle,
    onSuccess: () => qc.invalidateQueries({ queryKey: annualReviewKeys.all }),
  });
}

export function useReopenCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { cycleId: string; reason: string }) => svc.reopenCycle(args.cycleId, args.reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: annualReviewKeys.all }),
  });
}

export function useReassignReviewer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: svc.reassignReviewer,
    onSuccess: () => qc.invalidateQueries({ queryKey: annualReviewKeys.all }),
  });
}

export function useOverrideRating() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { instanceId: string; newRating: string; reason: string }) =>
      svc.overrideRating(args.instanceId, args.newRating, args.reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: annualReviewKeys.all }),
  });
}

export function useAcknowledgeInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { instanceId: string; rebuttal?: string | null }) =>
      svc.acknowledgeInstance(args.instanceId, args.rebuttal ?? null),
    onSuccess: () => qc.invalidateQueries({ queryKey: annualReviewKeys.all }),
  });
}

export function useCloneTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { sourceId: string; newName?: string | null }) =>
      svc.cloneTemplate(args.sourceId, args.newName ?? null),
    onSuccess: () => qc.invalidateQueries({ queryKey: annualReviewKeys.templates() }),
  });
}

export function useCloneCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: svc.cloneCycle,
    onSuccess: () => qc.invalidateQueries({ queryKey: annualReviewKeys.all }),
  });
}

/**
 * Debounced auto-save for a single (instance, reviewer_role) response.
 *
 * Holds the latest draft state in a ref; flushes 2s after the last `setDraft` call.
 * Returns `{ draft, setDraft, flush, status }` where `status` is the UI indicator.
 */
export type DraftPayload = {
  criteria_scores?: Record<string, number>;
  qualitative_responses?: Record<string, string>;
  evidence?: EvidenceItem[];
  weighted_score?: number | null;
  notes?: string | null;
};

export function useDebouncedResponseDraft(opts: {
  instanceId: string;
  reviewerId: string;
  role: AnnualReviewerRole;
  initial?: AnnualReviewResponse | null;
  delayMs?: number;
  enabled?: boolean;
}) {
  const qc = useQueryClient();
  const [draft, setDraftState] = useState<DraftPayload>({
    criteria_scores: opts.initial?.criteria_scores ?? {},
    qualitative_responses: opts.initial?.qualitative_responses ?? {},
    evidence: opts.initial?.evidence ?? [],
    weighted_score: opts.initial?.weighted_score ?? null,
    notes: opts.initial?.notes ?? null,
  });
  const [status, setStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<DraftPayload>(draft);
  draftRef.current = draft;

  const persist = useCallback(async () => {
      if (opts.enabled === false) return;
      setStatus('saving');
      try {
        await svc.upsertResponseDraft({
          instance_id: opts.instanceId,
          reviewer_id: opts.reviewerId,
          reviewer_role: opts.role,
          ...draftRef.current,
        });
        setStatus('saved');
        qc.invalidateQueries({ queryKey: annualReviewKeys.responses(opts.instanceId) });
      } catch {
        setStatus('error');
      }
  }, [opts.enabled, opts.instanceId, opts.reviewerId, opts.role, qc]);

  const setDraft = (next: DraftPayload | ((prev: DraftPayload) => DraftPayload)) => {
    setDraftState((prev) => (typeof next === 'function' ? (next as (p: DraftPayload) => DraftPayload)(prev) : next));
    setStatus('pending');
  };

  // Flush on unmount / route-away: persist any pending edits so a scroll-away
  // or navigation doesn't drop the user's last change (ADR-105).
  const statusRef = useRef(status);
  statusRef.current = status;
  useEffect(() => () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (statusRef.current === 'pending') { void persist(); }
  }, [persist]);

  // beforeunload guard while there are unsaved edits (ADR-105).
  useUnsavedChanges(status === 'pending');

  const flush = async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    await persist();
  };

  return { draft, setDraft, flush, status };
}

export type { AnnualReviewInstance };