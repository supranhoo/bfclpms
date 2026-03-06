import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trophy, AlertTriangle, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Performer {
  employeeId: string;
  name: string;
  department: string;
  score: number;
}

interface TopBottomPerformersProps {
  top: Performer[];
  bottom: Performer[];
}

const getScoreColor = (score: number) => {
  if (score >= 4.25) return 'text-green-600 dark:text-green-400';
  if (score >= 3.5) return 'text-blue-600 dark:text-blue-400';
  if (score >= 2.5) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-destructive';
};

export function TopBottomPerformers({ top, bottom }: TopBottomPerformersProps) {
  const navigate = useNavigate();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Top Performers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Top Performers
          </CardTitle>
          <CardDescription>Highest weighted average scores (0-5 scale)</CardDescription>
        </CardHeader>
        <CardContent>
          {top.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
          ) : (
            <div className="space-y-3">
              {top.map((p, i) => (
                <div key={p.employeeId} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="w-6 h-6 flex items-center justify-center p-0 text-xs">
                      {i + 1}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.department}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${getScoreColor(p.score)}`}>
                    {p.score.toFixed(2)} / 5
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bottom Performers */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Bottom Performers
              </CardTitle>
              <CardDescription>Lowest average over last 3 months</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/pip')}>
              PIP <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {bottom.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
          ) : (
            <div className="space-y-3">
              {bottom.map((p, i) => (
                <div key={p.employeeId} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="destructive" className="w-6 h-6 flex items-center justify-center p-0 text-xs">
                      {i + 1}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.department}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${getScoreColor(p.score)}`}>
                    {p.score.toFixed(2)} / 5
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
