/**
 * ADR-320 — one picker for the question every grouped scope asks: which one?
 *
 * Reads its options and its live reach from the server (`kpi_scope_options`,
 * `kpi_scope_population_summary`), so no surface hardcodes how a scope resolves
 * to people. Shows the reach before anything is saved, so an empty or mis-set
 * target is visible immediately (POLICY §KPI-SCOPE-SINGLE-VOCABULARY).
 */
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, Users, AlertTriangle } from 'lucide-react';
import { KPI_SCOPE_COPY, kpiScopeLabel, scopeNeedsTarget, type KpiScope } from '@/lib/review/kpiScope';
import { useKpiScopeOptions, useKpiScopePopulation } from '@/hooks/useKpiScopeTargets';

export interface ScopeTargetPickerProps {
  scope: KpiScope | string;
  value: string | null;
  onChange: (targetId: string | null) => void;
  /** Rendered as the field id so labels stay unique on a page with two pickers. */
  id?: string;
  disabled?: boolean;
}

export function ScopeTargetPicker({
  scope, value, onChange, id = 'scope-target', disabled,
}: ScopeTargetPickerProps) {
  const needsTarget = scopeNeedsTarget(scope);
  const { data: options, isLoading } = useKpiScopeOptions(needsTarget ? scope : null);
  const { data: population } = useKpiScopePopulation(scope, value);

  if (!needsTarget) return null;

  const prompt =
    (KPI_SCOPE_COPY as Record<string, { targetPrompt?: string }>)[scope]?.targetPrompt
    ?? `Which ${kpiScopeLabel(scope).toLowerCase()}?`;

  const reach = population?.employees ?? 0;
  const missing = population?.missing_key_employees ?? 0;

  return (
    <div className="space-y-1.5 min-w-0">
      <Label htmlFor={id}>{prompt}</Label>
      <Select
        value={value ?? ''}
        onValueChange={(v) => onChange(v || null)}
        disabled={disabled || isLoading}
      >
        <SelectTrigger id={id} className="h-10">
          <SelectValue placeholder={isLoading ? 'Loading…' : `Select a ${kpiScopeLabel(scope).toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {(options ?? []).map((o) => (
            <SelectItem key={o.target_id} value={o.target_id}>
              <span className="break-words">
                {o.label}
                {o.code ? ` (${o.code})` : ''}
                {' · '}
                <span className="text-muted-foreground">{o.employee_count} people</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading targets…
        </p>
      )}

      {!!value && (
        reach > 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            Applies to {reach} active employee{reach === 1 ? '' : 's'}.
            {missing > 0 && (
              <span className="text-amber-600 dark:text-amber-500">
                {' '}{missing} employee{missing === 1 ? ' has' : 's have'} no{' '}
                {kpiScopeLabel(scope).toLowerCase()} on record and are skipped.
              </span>
            )}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="h-3 w-3" />
            This {kpiScopeLabel(scope).toLowerCase()} has no active employees — the KPI would
            reach nobody.
          </p>
        )
      )}
    </div>
  );
}
