import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { KPI } from '@/hooks/useKpis';
import { Target, Scale, Percent, TrendingUp } from 'lucide-react';
import { renderBoldKpiText } from '@/components/ui/FormattedText';

interface ReviewDetailsCardCompactProps {
  kpi: KPI;
}

export function ReviewDetailsCardCompact({ kpi }: ReviewDetailsCardCompactProps) {
  return (
    <div className="space-y-3">
      {/* KPI Header - Inline */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className="flex items-center gap-1.5 flex-shrink-0"
              style={{ borderColor: kpi.kra_categories?.color }}
            >
              <div 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: kpi.kra_categories?.color }} 
              />
              {kpi.kra_categories?.name}
            </Badge>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-sm font-medium whitespace-pre-wrap">{renderBoldKpiText(kpi.kra_name)}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{renderBoldKpiText(kpi.kpi_name)}</p>
        </div>
      </div>

      {/* Key Metrics - Horizontal */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Target:</span>
          <span className="font-medium">{kpi.target_value} {kpi.uom}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Scale className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Criteria:</span>
          <span className="font-medium">{kpi.criteria || 'Higher is Better'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Percent className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Weightage:</span>
          <span className="font-medium">{kpi.weightage}%</span>
        </div>
      </div>

      {/* Rating Scale - Compact Inline */}
      {(kpi.r5 || kpi.r4 || kpi.r3) && (
        <div className="flex flex-wrap items-center gap-3 text-xs pt-2 border-t">
          <span className="text-muted-foreground font-medium flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Rating Scale:
          </span>
          {kpi.r5 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span className="text-blue-600 font-medium">R5:</span>
              <span className="text-muted-foreground">{kpi.r5}</span>
            </span>
          )}
          {kpi.r4 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <span className="text-green-600 font-medium">R4:</span>
              <span className="text-muted-foreground">{kpi.r4}</span>
            </span>
          )}
          {kpi.r3 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
              <span className="text-yellow-600 font-medium">R3:</span>
              <span className="text-muted-foreground">{kpi.r3}</span>
            </span>
          )}
          {kpi.r2 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-orange-500"></span>
              <span className="text-orange-600 font-medium">R2:</span>
              <span className="text-muted-foreground">{kpi.r2}</span>
            </span>
          )}
          {kpi.r1 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
              <span className="text-red-600 font-medium">R1:</span>
              <span className="text-muted-foreground">{kpi.r1}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
