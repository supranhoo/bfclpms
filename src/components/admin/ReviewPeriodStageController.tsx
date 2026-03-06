import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, ArrowRight, ArrowLeft, Check, Clock } from 'lucide-react';
import {
  GOVERNANCE_STAGES,
  STAGE_LABELS,
  GovernanceStage,
  ReviewPeriodStageRecord,
} from '@/hooks/useReviewPeriodGovernance';
import { format } from 'date-fns';

interface Props {
  currentStage: string;
  stageHistory: ReviewPeriodStageRecord[];
  onAdvanceStage: (params: { newStage: string; reason?: string }) => void;
  isPending: boolean;
}

export default function ReviewPeriodStageController({ currentStage, stageHistory, onAdvanceStage, isPending }: Props) {
  const [reason, setReason] = useState('');
  const currentIdx = GOVERNANCE_STAGES.indexOf(currentStage as GovernanceStage);
  const canAdvance = currentIdx >= 0 && currentIdx < GOVERNANCE_STAGES.length - 1;
  const canRevert = currentIdx > 0;

  const handleAdvance = () => {
    if (!canAdvance) return;
    onAdvanceStage({ newStage: GOVERNANCE_STAGES[currentIdx + 1], reason: reason || undefined });
    setReason('');
  };

  const handleRevert = () => {
    if (!canRevert) return;
    onAdvanceStage({ newStage: GOVERNANCE_STAGES[currentIdx - 1], reason: reason || undefined });
    setReason('');
  };

  return (
    <div className="space-y-6">
      {/* Visual Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stage Pipeline</CardTitle>
          <CardDescription>Move the review period through its lifecycle stages</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {GOVERNANCE_STAGES.map((stage, idx) => {
              const isComplete = idx < currentIdx;
              const isCurrent = idx === currentIdx;
              return (
                <div key={stage} className="flex items-center">
                  <div
                    className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap border ${
                      isComplete
                        ? 'bg-primary/10 border-primary text-primary'
                        : isCurrent
                          ? 'bg-primary text-primary-foreground border-primary shadow-md'
                          : 'bg-muted border-border text-muted-foreground'
                    }`}
                  >
                    {isComplete && <Check className="h-3 w-3 inline mr-1" />}
                    {isCurrent && <Clock className="h-3 w-3 inline mr-1" />}
                    {STAGE_LABELS[stage]}
                  </div>
                  {idx < GOVERNANCE_STAGES.length - 1 && (
                    <ArrowRight className="h-4 w-4 mx-1 text-muted-foreground shrink-0" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Reason + Actions */}
          <div className="space-y-3">
            <Textarea
              placeholder="Reason for stage change (optional)"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
            />
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleRevert}
                disabled={!canRevert || isPending}
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Revert to {canRevert ? STAGE_LABELS[GOVERNANCE_STAGES[currentIdx - 1]] : '—'}
              </Button>
              <Button
                onClick={handleAdvance}
                disabled={!canAdvance || isPending}
              >
                Advance to {canAdvance ? STAGE_LABELS[GOVERNANCE_STAGES[currentIdx + 1]] : '—'}
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </div>

          {currentStage === 'closed' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p className="text-sm">This period is closed. All submissions are view-only. Revert to re-open.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stage History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stage History</CardTitle>
        </CardHeader>
        <CardContent>
          {stageHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No stage transitions recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stage</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Ended</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stageHistory.map(s => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Badge variant="outline">{STAGE_LABELS[s.stage] || s.stage}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(s.started_at), 'dd MMM yyyy, hh:mm a')}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.ended_at ? format(new Date(s.ended_at), 'dd MMM yyyy, hh:mm a') : 'Active'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.ended_at
                        ? `${Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / (1000 * 60 * 60 * 24))}d`
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
