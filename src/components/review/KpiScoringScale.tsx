/**
 * ADR-271 — one presentational component for a KPI's scoring model.
 * Renders numeric thresholds, binary options or tiered options, and is explicit
 * when nothing is configured instead of showing empty 0–5 boxes.
 */
import { Badge } from '@/components/ui/badge';
import {
  KPI_TYPE_LABELS,
  resolveKpiScoringModel,
  type KpiScoringInput,
} from '@/lib/kpiScoringModel';
import { scoreToRatingLevel } from '@/lib/qualitativeUom';

const levelClass: Record<string, string> = {
  blue: 'text-blue-600 dark:text-blue-400',
  green: 'text-green-600 dark:text-green-400',
  yellow: 'text-yellow-600 dark:text-yellow-400',
  red: 'text-destructive',
};

interface Props {
  kpi: KpiScoringInput | null | undefined;
  /** Show the "Value based / Yes-No / Tiered" chip above the scale. */
  showTypeBadge?: boolean;
  className?: string;
}

export function KpiTypeBadge({ kpi }: { kpi: KpiScoringInput | null | undefined }) {
  const model = resolveKpiScoringModel(kpi);
  return (
    <Badge variant="outline" className="text-[11px] font-normal">
      {KPI_TYPE_LABELS[model.uomType]}
    </Badge>
  );
}

export function KpiScoringScale({ kpi, showTypeBadge = true, className = '' }: Props) {
  const model = resolveKpiScoringModel(kpi);

  return (
    <div className={className}>
      {showTypeBadge && (
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-semibold">Scoring scale</span>
          <KpiTypeBadge kpi={kpi} />
        </div>
      )}

      {model.type === 'unconfigured' && (
        <p className="text-xs text-muted-foreground">
          No scoring logic configured for this {KPI_TYPE_LABELS[model.uomType].toLowerCase()} KPI.
        </p>
      )}

      {model.type === 'numeric' && (
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          {model.thresholds.map(t => (
            <div key={t.key} className="rounded-md border p-2">
              <p className={`font-medium ${levelClass[scoreToRatingLevel(Number(t.label.slice(1)))]}`}>
                {t.label}
              </p>
              <p className="text-muted-foreground">{t.value}</p>
            </div>
          ))}
        </div>
      )}

      {(model.type === 'binary' || model.type === 'tiered') && (
        <ul className="space-y-1 text-xs">
          {model.options.map(o => (
            <li key={o.label} className="flex items-start justify-between gap-3 rounded-md border p-2">
              <div>
                <p className="font-medium">{o.label}</p>
                {o.definition && <p className="text-muted-foreground">{o.definition}</p>}
              </div>
              <span className={`shrink-0 font-semibold ${levelClass[scoreToRatingLevel(o.rating)]}`}>
                R{o.rating}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
