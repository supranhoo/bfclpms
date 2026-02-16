import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock } from 'lucide-react';

interface CategoryProgress {
  categoryId: string;
  categoryName: string;
  color: string;
  total: number;
  entered: number;
}

interface OrgKpiProgressBarProps {
  totalKpis: number;
  enteredKpis: number;
  categoryProgress: CategoryProgress[];
}

export function OrgKpiProgressBar({ totalKpis, enteredKpis, categoryProgress }: OrgKpiProgressBarProps) {
  const percentage = totalKpis > 0 ? Math.round((enteredKpis / totalKpis) * 100) : 0;
  const allDone = enteredKpis === totalKpis && totalKpis > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
      {allDone ? (
            <CheckCircle2 className="h-5 w-5 text-primary" />
          ) : (
            <Clock className="h-5 w-5 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">
            {enteredKpis} of {totalKpis} KPIs Entered
          </span>
        </div>
        <span className="text-sm font-semibold">{percentage}%</span>
      </div>
      <Progress value={percentage} className="h-2.5" />
      
      {categoryProgress.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {categoryProgress.map(cat => (
            <Badge
              key={cat.categoryId}
              variant={cat.entered === cat.total ? 'default' : 'outline'}
              className="gap-1.5 text-xs"
            >
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: cat.color || '#6B7280' }}
              />
              {cat.categoryName}: {cat.entered}/{cat.total}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
