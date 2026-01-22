import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { IssueSummary } from '@/hooks/useSystemIssues';
import { cn } from '@/lib/utils';

interface IssuesHeatmapProps {
  summary: IssueSummary;
  onDepartmentClick?: (departmentId: string) => void;
}

export function IssuesHeatmap({ summary, onDepartmentClick }: IssuesHeatmapProps) {
  const departments = Object.entries(summary.byDepartment)
    .filter(([id]) => id !== 'unknown')
    .sort((a, b) => b[1].count - a[1].count);

  const maxCount = Math.max(...departments.map(([, d]) => d.count), 1);

  const getHeatLevel = (count: number): string => {
    const ratio = count / maxCount;
    if (ratio >= 0.8) return 'bg-destructive/20 border-destructive/40';
    if (ratio >= 0.6) return 'bg-warning/30 border-warning/50';
    if (ratio >= 0.4) return 'bg-warning/20 border-warning/40';
    if (ratio >= 0.2) return 'bg-accent/30 border-accent/50';
    return 'bg-primary/10 border-primary/30';
  };

  if (departments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Issues by Department</CardTitle>
          <CardDescription>Distribution of issues across departments</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No department data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Issues by Department</CardTitle>
        <CardDescription>Click a department to filter the table</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {departments.map(([id, dept]) => (
            <button
              key={id}
              onClick={() => onDepartmentClick?.(id)}
              className={cn(
                'p-3 rounded-lg border-2 text-left transition-all hover:scale-105',
                getHeatLevel(dept.count)
              )}
            >
              <p className="text-sm font-medium truncate">{dept.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-lg font-bold">{dept.count}</span>
                {dept.critical > 0 && (
                  <span className="text-xs text-destructive font-medium">
                    ({dept.critical} critical)
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-4 mt-4 pt-4 border-t">
          <span className="text-xs text-muted-foreground">Severity:</span>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-primary/10 border border-primary/30" />
            <span className="text-xs">Low</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-warning/20 border border-warning/40" />
            <span className="text-xs">Medium</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-destructive/20 border border-destructive/40" />
            <span className="text-xs">High</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
