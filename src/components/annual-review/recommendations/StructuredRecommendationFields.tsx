/**
 * ADR-226 — Structured capture of an Overall Recommendation.
 *
 * Rendered inside `OverallRecommendationCard` for the reviewer who owns the
 * current stage (dept_head / bu_head / management). The narrative textarea stays
 * the SSOT for prose; this block adds the *structured* ask (type, amount,
 * proposed designation/grade, effective date) so it can be tracked and reported.
 *
 * All type metadata is master data — nothing about "promotion" or "hike" is
 * hardcoded here (POLICY §10 zero-hardcoding).
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { AnnualReviewerRole } from '@/types/annualReview';
import {
  useInstanceRecommendations,
  useRecommendationTypes,
  useSaveRecommendation,
} from '@/hooks/useAnnualReviewRecommendations';
import type { RecommendationAmountKind } from '@/services/annualReview/recommendations';

function useDesignations() {
  return useQuery({
    queryKey: ['designations-lite'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('designations').select('id,name').order('name');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });
}

function usePmsGrades() {
  return useQuery({
    queryKey: ['pms-grades-lite'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pms_grades').select('id,name').order('name');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });
}

const NONE = '__none__';

export function StructuredRecommendationFields({
  instanceId,
  role,
  narrative,
}: {
  instanceId: string;
  role: AnnualReviewerRole;
  /** Current textarea draft — persisted alongside the structured ask. */
  narrative: string;
}) {
  const { data: types = [], isLoading: typesLoading } = useRecommendationTypes();
  const { data: existing = [] } = useInstanceRecommendations(instanceId);
  const { data: designations = [] } = useDesignations();
  const { data: grades = [] } = usePmsGrades();
  const save = useSaveRecommendation();

  const mine = useMemo(
    () => existing.find((r) => r.reviewer_role === role),
    [existing, role],
  );

  const [selected, setSelected] = useState<string[]>([]);
  const [amountKind, setAmountKind] = useState<RecommendationAmountKind>('percent');
  const [amountValue, setAmountValue] = useState<string>('');
  const [designationId, setDesignationId] = useState<string>(NONE);
  const [gradeId, setGradeId] = useState<string>(NONE);
  const [effectiveFrom, setEffectiveFrom] = useState<string>('');

  // Hydrate from the saved record once it arrives (side-effects in useEffect only).
  useEffect(() => {
    if (!mine) return;
    setSelected(mine.type_keys ?? []);
    setAmountKind((mine.amount_kind ?? 'percent') as RecommendationAmountKind);
    setAmountValue(mine.amount_value != null ? String(mine.amount_value) : '');
    setDesignationId(mine.proposed_designation_id ?? NONE);
    setGradeId(mine.proposed_grade_id ?? NONE);
    setEffectiveFrom(mine.effective_from ?? '');
  }, [mine]);

  const activeTypes = types.filter((t) => t.is_active);
  const chosen = activeTypes.filter((t) => selected.includes(t.key));
  const needsAmount = chosen.some((t) => t.requires_amount);
  const needsTarget = chosen.some((t) => t.requires_target_role);

  const amountNum = amountValue.trim() === '' ? null : Number(amountValue);
  const amountInvalid =
    needsAmount && (amountNum == null || Number.isNaN(amountNum) || amountNum <= 0);
  const targetInvalid = needsTarget && designationId === NONE && gradeId === NONE;
  const canSave = selected.length > 0 && !amountInvalid && !targetInvalid;

  const toggle = (key: string) =>
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const onSave = () =>
    save.mutate({
      instanceId,
      reviewerRole: role,
      typeKeys: selected,
      amountKind: needsAmount ? amountKind : null,
      amountValue: needsAmount ? amountNum : null,
      designationId: designationId === NONE ? null : designationId,
      gradeId: gradeId === NONE ? null : gradeId,
      effectiveFrom: effectiveFrom || null,
      narrative,
    });

  return (
    <div className="rounded-md border p-3 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label className="text-sm font-medium">Structured recommendation</Label>
        {mine && (
          <Badge variant="secondary" className="text-xs">
            Saved · {mine.status.replace('_', ' ')}
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">What are you recommending?</Label>
        <div className="flex flex-wrap gap-2">
          {typesLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {activeTypes.map((t) => {
            const on = selected.includes(t.key);
            return (
              <Button
                key={t.key}
                type="button"
                size="sm"
                variant={on ? 'default' : 'outline'}
                aria-pressed={on}
                onClick={() => toggle(t.key)}
              >
                {t.label}
              </Button>
            );
          })}
        </div>
      </div>

      {needsAmount && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground" htmlFor="rec-amount-kind">Amount type</Label>
            <Select value={amountKind} onValueChange={(v) => setAmountKind(v as RecommendationAmountKind)}>
              <SelectTrigger id="rec-amount-kind"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percentage of CTC</SelectItem>
                <SelectItem value="absolute">Absolute amount (₹)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground" htmlFor="rec-amount-value">
              Amount {amountKind === 'percent' ? '(%)' : '(₹)'}
            </Label>
            <Input
              id="rec-amount-value"
              inputMode="decimal"
              value={amountValue}
              onChange={(e) => setAmountValue(e.target.value)}
              placeholder={amountKind === 'percent' ? 'e.g. 8' : 'e.g. 5000'}
              aria-invalid={amountInvalid}
            />
          </div>
        </div>
      )}

      {needsTarget && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground" htmlFor="rec-designation">Proposed designation</Label>
            <Select value={designationId} onValueChange={setDesignationId}>
              <SelectTrigger id="rec-designation"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={NONE}>Not specified</SelectItem>
                {designations.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground" htmlFor="rec-grade">Proposed grade / band</Label>
            <Select value={gradeId} onValueChange={setGradeId}>
              <SelectTrigger id="rec-grade"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={NONE}>Not specified</SelectItem>
                {grades.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {selected.length > 0 && (
        <div className="space-y-1.5 max-w-xs">
          <Label className="text-xs text-muted-foreground" htmlFor="rec-effective">Suggested effective from</Label>
          <Input
            id="rec-effective"
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">
          {targetInvalid
            ? 'Select a proposed designation or grade for this recommendation.'
            : amountInvalid
              ? 'Enter a valid amount greater than zero.'
              : 'HR / Management review every recommendation before it is actioned.'}
        </p>
        <Button type="button" size="sm" onClick={onSave} disabled={!canSave || save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save recommendation
        </Button>
      </div>
    </div>
  );
}
