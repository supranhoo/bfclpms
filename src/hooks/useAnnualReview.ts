import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as svc from '@/services/annualReview/annualReviewService';
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
export const useInstanceResponses = (instanceId?: string) =>
  useQuery({
    queryKey: annualReviewKeys.responses(instanceId ?? ''),
    queryFn: () => svc.listResponses(instanceId!),
    enabled: !!instanceId,
  });

export function useAdvanceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { instanceId: string; role: AnnualReviewerRole }) => svc.advanceStatus(args.instanceId, args.role),
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
  const delay = opts.delayMs ?? 2000;
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
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(persist, delay);
  };

  // Flush on unmount / route-away.
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const flush = async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    await persist();
  };

  return { draft, setDraft, flush, status };
}

export type { AnnualReviewInstance };