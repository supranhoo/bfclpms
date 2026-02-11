import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { KPI } from '@/hooks/useKpis';
import { renderBoldKpiText } from '@/components/ui/FormattedText';

interface ReviewDetailsCardProps {
  kpi: KPI;
}

export function ReviewDetailsCard({ kpi }: ReviewDetailsCardProps) {
  return (
    <Card className="bg-muted/50">
      <CardContent className="pt-4 space-y-4">
        {/* KPI Info Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">KRA</p>
            <p className="font-semibold text-primary whitespace-pre-wrap">{renderBoldKpiText(kpi.kra_name)}</p>
          </div>
          <Badge 
            variant="outline" 
            className="flex items-center gap-1.5"
            style={{ borderColor: kpi.kra_categories?.color }}
          >
            <div 
              className="w-2 h-2 rounded-full" 
              style={{ backgroundColor: kpi.kra_categories?.color }} 
            />
            {kpi.kra_categories?.name}
          </Badge>
        </div>
        
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">KPI</p>
          <p className="text-sm whitespace-pre-wrap">{renderBoldKpiText(kpi.kpi_name)}</p>
        </div>

        {/* Target, Criteria, Weightage */}
        <div className="grid grid-cols-3 gap-4 pt-2 border-t">
          <div>
            <Label className="text-xs text-muted-foreground">Target</Label>
            <p className="font-medium">{kpi.target_value} {kpi.uom}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Criteria</Label>
            <p className="font-medium text-sm">{kpi.criteria || 'Higher is Better'}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Weightage</Label>
            <p className="font-medium">{kpi.weightage}%</p>
          </div>
        </div>

        {/* Rating Scale Reference */}
        {(kpi.r5 || kpi.r4 || kpi.r3) && (
          <div className="pt-2 border-t space-y-2">
            <Label className="text-xs text-muted-foreground">Rating Scale</Label>
            <div className="grid gap-1 text-xs">
              {kpi.r5 && (
                <div className="flex justify-between">
                  <span className="text-blue-600 font-medium">R5 (Outstanding):</span>
                  <span className="text-muted-foreground">{kpi.r5}</span>
                </div>
              )}
              {kpi.r4 && (
                <div className="flex justify-between">
                  <span className="text-green-600 font-medium">R4 (Exceeds):</span>
                  <span className="text-muted-foreground">{kpi.r4}</span>
                </div>
              )}
              {kpi.r3 && (
                <div className="flex justify-between">
                  <span className="text-yellow-600 font-medium">R3 (Meets):</span>
                  <span className="text-muted-foreground">{kpi.r3}</span>
                </div>
              )}
              {kpi.r2 && (
                <div className="flex justify-between">
                  <span className="text-orange-600 font-medium">R2 (Below):</span>
                  <span className="text-muted-foreground">{kpi.r2}</span>
                </div>
              )}
              {kpi.r1 && (
                <div className="flex justify-between">
                  <span className="text-red-600 font-medium">R1 (Poor):</span>
                  <span className="text-muted-foreground">{kpi.r1}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
