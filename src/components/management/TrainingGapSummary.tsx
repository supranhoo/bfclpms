import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GraduationCap, ArrowRight, Users, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTNISummary, useTNIByDepartment } from '@/hooks/useTNI';

interface TrainingGapSummaryProps {
  reviewPeriod?: string;
  reviewYear?: number;
}

export function TrainingGapSummary({ reviewPeriod, reviewYear }: TrainingGapSummaryProps) {
  const navigate = useNavigate();
  const { data: summary } = useTNISummary(reviewPeriod, reviewYear);
  const { data: deptData } = useTNIByDepartment(reviewPeriod, reviewYear);

  const topDepts = (deptData || []).slice(0, 3);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="h-5 w-5" />
              Training Gap Insights
            </CardTitle>
            <CardDescription>Employees flagged for skill development</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/reports/tni')}>
            Full Report <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!summary || summary.total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No training gaps identified</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2 rounded-lg bg-muted/50">
                <p className="text-lg font-bold">{summary.employeesAffected}</p>
                <p className="text-xs text-muted-foreground">Employees</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/50">
                <p className="text-lg font-bold">{summary.total}</p>
                <p className="text-xs text-muted-foreground">Total Gaps</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/50">
                <p className="text-lg font-bold text-destructive">{summary.highPriority}</p>
                <p className="text-xs text-muted-foreground">High Priority</p>
              </div>
            </div>

            {topDepts.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Top departments by gaps</p>
                <div className="space-y-2">
                  {topDepts.map((dept) => (
                    <div key={dept.department_id} className="flex items-center justify-between text-sm">
                      <span>{dept.department_name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{dept.total_needs} gaps</Badge>
                        <Badge variant="outline" className="text-xs">
                          <Users className="h-3 w-3 mr-1" />
                          {dept.employees_affected}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
