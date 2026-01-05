import { Label } from '@/components/ui/label';
import { KPI } from '@/hooks/useKpis';

interface RatingScaleDisplayProps {
  kpi: KPI | null;
  compact?: boolean;
}

export function RatingScaleDisplay({ kpi, compact = false }: RatingScaleDisplayProps) {
  if (!kpi || (!kpi.r5 && !kpi.r4 && !kpi.r3 && !kpi.r2 && !kpi.r1)) {
    return null;
  }

  if (compact) {
    return (
      <div className="p-2 border rounded-lg space-y-1">
        <Label className="text-xs font-medium text-muted-foreground">Rating Scale</Label>
        <div className="space-y-0.5 text-xs">
          {kpi.r5 && <div className="flex gap-1"><span className="text-blue-600 font-medium w-6">R5:</span><span className="text-muted-foreground truncate">{kpi.r5}</span></div>}
          {kpi.r4 && <div className="flex gap-1"><span className="text-green-600 font-medium w-6">R4:</span><span className="text-muted-foreground truncate">{kpi.r4}</span></div>}
          {kpi.r3 && <div className="flex gap-1"><span className="text-yellow-600 font-medium w-6">R3:</span><span className="text-muted-foreground truncate">{kpi.r3}</span></div>}
          {kpi.r2 && <div className="flex gap-1"><span className="text-orange-600 font-medium w-6">R2:</span><span className="text-muted-foreground truncate">{kpi.r2}</span></div>}
          {kpi.r1 && <div className="flex gap-1"><span className="text-red-600 font-medium w-6">R1:</span><span className="text-muted-foreground truncate">{kpi.r1}</span></div>}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 border rounded-lg space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">Rating Scale (R1-R5)</Label>
      <div className="space-y-1 text-xs">
        {kpi.r5 && <div className="flex justify-between"><span className="text-blue-600 font-medium">R5:</span><span className="text-muted-foreground truncate ml-2">{kpi.r5}</span></div>}
        {kpi.r4 && <div className="flex justify-between"><span className="text-green-600 font-medium">R4:</span><span className="text-muted-foreground truncate ml-2">{kpi.r4}</span></div>}
        {kpi.r3 && <div className="flex justify-between"><span className="text-yellow-600 font-medium">R3:</span><span className="text-muted-foreground truncate ml-2">{kpi.r3}</span></div>}
        {kpi.r2 && <div className="flex justify-between"><span className="text-orange-600 font-medium">R2:</span><span className="text-muted-foreground truncate ml-2">{kpi.r2}</span></div>}
        {kpi.r1 && <div className="flex justify-between"><span className="text-red-600 font-medium">R1:</span><span className="text-muted-foreground truncate ml-2">{kpi.r1}</span></div>}
      </div>
    </div>
  );
}
