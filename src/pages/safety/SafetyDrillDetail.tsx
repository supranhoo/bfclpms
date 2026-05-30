import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Loader2, Play, CheckCircle2, ClipboardList, Plus } from 'lucide-react';
import { SafetySkeletonBlock } from '@/components/safety/SafetySkeletonBlock';
import {
  useDrill,
  useDrillFindings,
  useStartDrill,
  useCompleteDrill,
  useReviewDrill,
  useAddFinding,
} from '@/hooks/useSafetyEmergency';
import {
  SAFETY_DRILL_TYPE_LABEL,
  canStartDrill, canCompleteDrill, canReviewDrill,
  formatEvacuationDuration,
} from '@/lib/safetyEmergency';
import { DrillStatusBadge } from '@/components/safety/DrillStatusBadge';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

export default function SafetyDrillDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { data: drill, isLoading } = useDrill(id);
  const { data: findings = [] } = useDrillFindings(id);
  const start = useStartDrill();
  const complete = useCompleteDrill();
  const review = useReviewDrill();
  const addFinding = useAddFinding();

  const [seconds, setSeconds] = useState('');
  const [score, setScore] = useState('');
  const [summary, setSummary] = useState('');
  const [obs, setObs] = useState('');
  const [sev, setSev] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');

  if (isLoading || !drill) {
    return (
      <div className="p-3 sm:p-6 max-w-5xl mx-auto">
        <SafetySkeletonBlock variant="detail" />
      </div>
    );
  }

  const wrap = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast({ title: ok }); }
    catch (e) {
      const msg = e instanceof Error ? e.message : 'Action failed';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/safety/emergency"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-xl">{drill.drill_code}</CardTitle>
            <Badge variant="outline">{SAFETY_DRILL_TYPE_LABEL[drill.type]}</Badge>
            <DrillStatusBadge status={drill.status} />
          </div>
          <CardDescription>
            Scheduled {format(new Date(drill.scheduled_at), 'PPp')}
            {drill.location && <> · {drill.location}</>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm whitespace-pre-wrap">{drill.scenario}</div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Started</div>
              <div className="text-sm font-medium">
                {drill.started_at ? format(new Date(drill.started_at), 'PPp') : '—'}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Evacuation Time</div>
              <div className="text-sm font-medium">{formatEvacuationDuration(drill.evacuation_seconds)}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Score</div>
              <div className="text-sm font-medium">{drill.score ?? '—'}</div>
            </div>
          </div>

          {/* Lifecycle controls */}
          <div className="border-t pt-4 space-y-3">
            {canStartDrill(drill.status) && (
              <Button onClick={() => wrap(() => start.mutateAsync(drill.id), 'Drill started')} disabled={start.isPending}>
                <Play className="h-4 w-4 mr-2" /> Start drill
              </Button>
            )}

            {canCompleteDrill(drill.status) && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div className="space-y-1">
                  <Label htmlFor="sec">Evac seconds</Label>
                  <Input id="sec" type="number" min={0} value={seconds} onChange={(e) => setSeconds(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sc">Score (0-100)</Label>
                  <Input id="sc" type="number" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} />
                </div>
                <Button
                  onClick={() => wrap(
                    () => complete.mutateAsync({
                      drillId: drill.id,
                      evacuationSeconds: seconds ? Number(seconds) : undefined,
                      score: score ? Number(score) : undefined,
                    }),
                    'Drill completed',
                  )}
                  disabled={complete.isPending}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Mark Completed
                </Button>
              </div>
            )}

            {canReviewDrill(drill.status) && (
              <div className="space-y-2">
                <Label htmlFor="sum">Review summary</Label>
                <Textarea id="sum" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
                <Button
                  onClick={() => wrap(
                    () => review.mutateAsync({ drillId: drill.id, summary: summary.trim() || undefined }),
                    'Drill reviewed',
                  )}
                  disabled={review.isPending}
                >
                  <ClipboardList className="h-4 w-4 mr-2" /> Mark Reviewed
                </Button>
              </div>
            )}

            {drill.summary && drill.status === 'reviewed' && (
              <div className="rounded-lg border p-3 bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">Review Summary</div>
                <div className="text-sm whitespace-pre-wrap">{drill.summary}</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Findings ({findings.length})</CardTitle>
          <CardDescription>Capture observations, gaps, and corrective actions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_auto] gap-2">
            <Select value={sev} onValueChange={(v) => setSev(v as typeof sev)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observation…" />
            <Button
              onClick={() => {
                if (!obs.trim()) return;
                wrap(
                  () => addFinding.mutateAsync({ drill_id: drill.id, severity: sev, observation: obs.trim() }),
                  'Finding added',
                );
                setObs('');
              }}
              disabled={addFinding.isPending}
            >
              <Plus className="h-4 w-4 mr-2" /> Add
            </Button>
          </div>

          {findings.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">No findings yet.</div>
          ) : (
            findings.map((f) => (
              <div key={f.id} className="flex items-start gap-2 rounded-lg border p-3">
                <Badge
                  variant={f.severity === 'critical' || f.severity === 'high' ? 'destructive' : 'outline'}
                >
                  {f.severity}
                </Badge>
                <div className="flex-1">
                  <div className="text-sm">{f.observation}</div>
                  {f.corrective_action && (
                    <div className="text-xs text-muted-foreground mt-1">{f.corrective_action}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
