import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, ClipboardCheck, Loader2, Search, ArrowRight, BarChart3, FileText } from 'lucide-react';
import { useAuditRuns, useAuditTemplates } from '@/hooks/useSafetyAudits';
import {
  SAFETY_AUDIT_RUN_STATUSES,
  SAFETY_AUDIT_RUN_STATUS_LABEL,
  type SafetyAuditRunStatus,
  complianceBand,
  COMPLIANCE_BAND_TONE,
  COMPLIANCE_BAND_LABEL,
} from '@/lib/safetyAudits';
import { AuditRunStatusBadge } from '@/components/safety/AuditRunStatusBadge';
import { format } from 'date-fns';

/**
 * Audit hub: tabs of Runs and Templates with quick filters.
 */
export default function SafetyAudits() {
  const [status, setStatus] = useState<SafetyAuditRunStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const { data: runs = [], isLoading } = useAuditRuns({ status });
  const { data: templates = [] } = useAuditTemplates({ activeOnly: true, search });

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="p-3 rounded-xl bg-primary/10 text-primary">
          <ClipboardCheck className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Audits & Compliance</h1>
          <p className="text-muted-foreground">
            Run safety checklists, auto-create incidents on critical NOs, and track BU compliance.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/safety/audits/scoreboard"><BarChart3 className="h-4 w-4 mr-2" /> Scoreboard</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/safety/audits/templates"><FileText className="h-4 w-4 mr-2" /> Templates</Link>
        </Button>
        <Button asChild>
          <Link to="/safety/audits/runs/new"><Plus className="h-4 w-4 mr-2" /> Start Audit</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Runs</CardTitle>
          <CardDescription>{runs.length} run(s) match the filters.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {SAFETY_AUDIT_RUN_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{SAFETY_AUDIT_RUN_STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative md:col-span-2">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search templates by title or code…"
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading runs…
            </div>
          )}

          {!isLoading && runs.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No audit runs yet. Start one above.
            </div>
          )}

          {runs.map((r) => {
            const band = complianceBand(r.score);
            const tpl = templates.find((t) => t.id === r.template_id);
            return (
              <Link
                key={r.id}
                to={`/safety/audits/runs/${r.id}`}
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {tpl?.title ?? 'Audit Run'} · {format(new Date(r.conducted_at), 'dd MMM yyyy HH:mm')}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.location ?? '—'}
                    {r.critical_failures > 0 ? ` · ${r.critical_failures} critical NO` : ''}
                  </div>
                </div>
                {r.score !== null && (
                  <Badge variant={COMPLIANCE_BAND_TONE[band]} className="text-[11px]">
                    {r.score.toFixed(1)} · {COMPLIANCE_BAND_LABEL[band].split(' ')[0]}
                  </Badge>
                )}
                <AuditRunStatusBadge status={r.status} />
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}