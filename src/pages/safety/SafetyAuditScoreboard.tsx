import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import { useAuditRuns } from '@/hooks/useSafetyAudits';
import { complianceBand, COMPLIANCE_BAND_TONE, COMPLIANCE_BAND_LABEL } from '@/lib/safetyAudits';

/**
 * Simple BU scoreboard: latest reviewed/submitted run per business_unit_id with average score.
 */
export default function SafetyAuditScoreboard() {
  const { data: runs = [] } = useAuditRuns({});

  const byBu = useMemo(() => {
    const map = new Map<string, { count: number; avg: number; criticals: number }>();
    for (const r of runs) {
      if (r.score === null) continue;
      const key = r.business_unit_id ?? 'Unassigned';
      const cur = map.get(key) ?? { count: 0, avg: 0, criticals: 0 };
      cur.avg = (cur.avg * cur.count + Number(r.score)) / (cur.count + 1);
      cur.count += 1;
      cur.criticals += r.critical_failures;
      map.set(key, cur);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].avg - b[1].avg);
  }, [runs]);

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/safety/audits"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
        </Button>
        <h1 className="text-xl font-bold">Compliance Scoreboard</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Average score by business unit
          </CardTitle>
          <CardDescription>Across {runs.length} run(s) (excluding drafts without a score).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {byBu.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">No scored runs yet.</div>
          )}
          {byBu.map(([bu, s]) => {
            const band = complianceBand(s.avg);
            return (
              <div key={bu} className="flex items-center gap-3 p-3 rounded-lg border">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{bu}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.count} run(s) · {s.criticals} critical NO recorded
                  </div>
                </div>
                <Badge variant={COMPLIANCE_BAND_TONE[band]} className="text-[11px]">
                  {s.avg.toFixed(1)} · {COMPLIANCE_BAND_LABEL[band].split(' ')[0]}
                </Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}