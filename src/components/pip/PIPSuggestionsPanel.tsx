/**
 * ADR-207 / POLICY §PIP-TRIGGER-SUGGESTIONS
 * Advisory list of employees meeting an objective PIP trigger.
 */
import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Info, RotateCw, Search, ShieldCheck } from 'lucide-react';
import { usePIPCandidates, recentMonthOptions, type PIPCandidate } from '@/hooks/usePIPCandidates';
import type { MonthKey } from '@/hooks/useMonthlyTrend';
import { POLICY_PIP_RATING } from '@/lib/pip/pipTriggerRules';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

type TriggerFilter = 'all' | 'monthly_trend' | 'annual_rating';

interface PIPSuggestionsPanelProps {
  /** Data loads only while the tab is visible (the trend RPC is org-wide). */
  active: boolean;
  /** `months` is the evaluation window that produced the suggestion. */
  onInitiate: (candidate: PIPCandidate, months: MonthKey[]) => void;
  onOpenPip: (pipId: string) => void;
}

export function PIPSuggestionsPanel({ active, onInitiate, onOpenPip }: PIPSuggestionsPanelProps) {
  const [windowMonths, setWindowMonths] = useState(3);
  const monthOptions = useMemo(() => recentMonthOptions(18, new Date()), []);
  const [anchorKey, setAnchorKey] = useState(() => `${monthOptions[0].month}-${monthOptions[0].year}`);
  const anchor = useMemo(
    () => monthOptions.find(o => `${o.month}-${o.year}` === anchorKey) ?? monthOptions[0],
    [monthOptions, anchorKey],
  );
  const [triggerFilter, setTriggerFilter] = useState<TriggerFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { candidates, months, threshold, thresholdMatchesPolicy, isLoading, error, refetch } =
    usePIPCandidates({ windowMonths, enabled: active, anchor });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return candidates.filter(c => {
      if (triggerFilter !== 'all' && !c.triggers.includes(triggerFilter)) return false;
      if (!term) return true;
      return (
        (c.fullName ?? '').toLowerCase().includes(term) ||
        (c.employeeCode ?? '').toLowerCase().includes(term) ||
        (c.departmentName ?? '').toLowerCase().includes(term)
      );
    });
  }, [candidates, triggerFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <Card>
      <CardHeader>
        <CardTitle>PIP suggestions</CardTitle>
        <CardDescription>
          Employees meeting an objective trigger under POLICY §15.2 (monthly rating below the
          threshold in every month of the window) or §15.3 (annual rating at or below the
          threshold). Suggestions are advisory — a plan is always initiated by a person.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <Label htmlFor="pip-anchor">Up to month</Label>
              <Select value={anchorKey} onValueChange={v => { setAnchorKey(v); setPage(1); }}>
                <SelectTrigger id="pip-anchor" className="h-10 w-44"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {monthOptions.map(o => (
                    <SelectItem key={`${o.month}-${o.year}`} value={`${o.month}-${o.year}`}>
                      {o.month} {o.year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="pip-window">Window</Label>
              <Select value={String(windowMonths)} onValueChange={v => { setWindowMonths(Number(v)); setPage(1); }}>
                <SelectTrigger id="pip-window" className="h-10 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">Last 3 months</SelectItem>
                  <SelectItem value="6">Last 6 months</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="pip-trigger">Trigger</Label>
              <Select value={triggerFilter} onValueChange={v => { setTriggerFilter(v as TriggerFilter); setPage(1); }}>
                <SelectTrigger id="pip-trigger" className="h-10 w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All triggers</SelectItem>
                  <SelectItem value="monthly_trend">Monthly (§15.2)</SelectItem>
                  <SelectItem value="annual_rating">Annual (§15.3)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="pip-search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="pip-search"
                  className="h-10 w-64 pl-10"
                  placeholder="Name, code or department"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="h-10 px-3">
              Threshold: {threshold == null ? '—' : threshold.toFixed(2)}
            </Badge>
            <Button variant="outline" size="sm" className="h-10" onClick={refetch} disabled={isLoading}>
              <RotateCw className={cn('mr-2 h-4 w-4', isLoading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        {threshold != null && !thresholdMatchesPolicy && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Threshold differs from policy</AlertTitle>
            <AlertDescription>
              The configured PIP threshold is {threshold.toFixed(2)}; POLICY §15.2 names{' '}
              {POLICY_PIP_RATING.toFixed(2)}. Update it in PMS settings to align suggestions with policy.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Could not load suggestions</AlertTitle>
            <AlertDescription className="flex items-center gap-3">
              <span>{error.message}</span>
              <Button size="sm" variant="outline" onClick={refetch}>Retry</Button>
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <ShieldCheck className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No employees meet the PIP trigger criteria for this window</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Triggers are evaluated against the same scores as Reports → Monthly Scorecard → Trend.
            </p>
          </div>
        ) : (
          <TooltipProvider>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department / BU</TableHead>
                    <TableHead>Reporting manager</TableHead>
                    {months.map(m => (
                      <TableHead key={m.key} className="text-right">{m.label}</TableHead>
                    ))}
                    <TableHead className="text-right">Annual</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(c => (
                    <TableRow key={c.employeeId} className="h-12 hover:bg-muted/50">
                      <TableCell>
                        <div className="font-medium">{c.fullName}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.employeeCode}{c.designation ? ` · ${c.designation}` : ''}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{c.departmentName || '—'}</div>
                        <div className="text-xs text-muted-foreground">{c.businessUnitName || '—'}</div>
                      </TableCell>
                      <TableCell className="text-sm">{c.reportingManagerName || '—'}</TableCell>
                      {c.monthly.months.map(m => (
                        <TableCell
                          key={m.key}
                          className={cn(
                            'text-right tabular-nums',
                            threshold != null && m.score != null && m.score < threshold && 'text-destructive font-medium',
                          )}
                        >
                          {m.score == null ? '—' : m.score.toFixed(2)}
                        </TableCell>
                      ))}
                      <TableCell className="text-right tabular-nums">
                        {c.annualRating == null ? '—' : c.annualRating.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {c.triggers.includes('monthly_trend') && (
                            <Badge variant="destructive">Monthly §15.2</Badge>
                          )}
                          {c.triggers.includes('annual_rating') && (
                            <Badge variant="secondary">Annual §15.3</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {c.state === 'eligible' && <Badge variant="outline">Eligible</Badge>}
                        {c.state === 'live_pip' && <Badge variant="secondary">Live PIP exists</Badge>}
                        {c.state === 'relapse_window' && <Badge variant="destructive">Relapse window</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        {c.state === 'eligible' ? (
                          <Button size="sm" className="h-10" onClick={() => onInitiate(c, months)}>
                            Initiate PIP
                          </Button>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-10"
                                  onClick={() => c.existingPipId && onOpenPip(c.existingPipId)}
                                >
                                  View plan
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{c.stateNote}</TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="flex flex-col items-center justify-between gap-3 pt-4 sm:flex-row">
                <div className="text-sm text-muted-foreground">
                  Page {safePage} of {totalPages} · {filtered.length} candidate{filtered.length === 1 ? '' : 's'}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}