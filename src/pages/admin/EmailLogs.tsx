import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Mail, CheckCircle2, XCircle, SkipForward, Clock, Search, ChevronDown, ChevronRight, RefreshCw, Download, CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { fetchAllPaged } from '@/lib/fetchAll';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';

interface EmailLog {
  id: string;
  event_type: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string | null;
  status: string;
  error_message: string | null;
  provider: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

const EVENT_LABELS: Record<string, string> = {
  kpi_submitted: 'KPI Submitted',
  manager_approved: 'Manager Approved',
  manager_rejected: 'Sent Back',
  query_raised: 'Query Raised',
  query_resolved: 'Query Resolved',
  final_approved: 'Finalized',
  kra_assigned: 'KRA Assigned',
  kra_batch_assigned: 'KRA Batch Assigned',
  period_locked: 'Period Locked',
  pip_initiated: 'PIP Initiated',
  pip_completed: 'PIP Completed',
  pip_milestone_reminder: 'PIP Milestone',
  kpi_ready_for_audit: 'Ready for Audit',
  kpi_ready_for_management: 'Ready for Mgmt',
  query_response_received: 'Query Response',
  admin_status_change: 'Admin Status Change',
  admin_data_entry: 'Admin Data Entry',
  admin_data_override: 'Admin Override',
  org_kpi_sent_back: 'Org KPI Sent Back',
  password_rollout: 'Password Rollout',
  observation_raised: 'Observation Raised',
  observation_reply: 'Observation Reply',
  observation_resolved: 'Observation Resolved',
  test: 'Test Email',
  admin_status_step_back: 'Admin Step Back',
  rollback_requested: 'Rollback Requested',
  rollback_approved: 'Rollback Approved',
  rollback_rejected: 'Rollback Dismissed',
};

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'sent':
      return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0"><CheckCircle2 className="h-3 w-3 mr-1" />Sent</Badge>;
    case 'failed':
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
    case 'skipped':
      return <Badge variant="secondary"><SkipForward className="h-3 w-3 mr-1" />Skipped</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function EmailLogs() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [downloadRange, setDownloadRange] = useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 7);
    return { from, to };
  });
  const [downloading, setDownloading] = useState(false);

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['email-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as EmailLog[];
    },
  });

  const filtered = useMemo(() => {
    return logs.filter(log => {
      if (statusFilter !== 'all' && log.status !== statusFilter) return false;
      if (eventFilter !== 'all' && log.event_type !== eventFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          log.recipient_email.toLowerCase().includes(q) ||
          (log.recipient_name || '').toLowerCase().includes(q) ||
          (log.subject || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [logs, search, statusFilter, eventFilter]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: logs.length,
      sent: logs.filter(l => l.status === 'sent').length,
      failed: logs.filter(l => l.status === 'failed').length,
      skipped: logs.filter(l => l.status === 'skipped').length,
      today: logs.filter(l => l.created_at.slice(0, 10) === today).length,
    };
  }, [logs]);

  const eventTypes = useMemo(() => {
    return [...new Set(logs.map(l => l.event_type))].sort();
  }, [logs]);

  const handleDownload = async () => {
    if (!downloadRange?.from || !downloadRange?.to) {
      toast.error('Please select a date range');
      return;
    }
    setDownloading(true);
    try {
      const fromIso = new Date(downloadRange.from);
      fromIso.setHours(0, 0, 0, 0);
      const toIso = new Date(downloadRange.to);
      toIso.setHours(23, 59, 59, 999);

      const rows = await fetchAllPaged<EmailLog>((from, to) => {
        let q = supabase
          .from('email_logs')
          .select('*')
          .gte('created_at', fromIso.toISOString())
          .lte('created_at', toIso.toISOString())
          .order('created_at', { ascending: false })
          .range(from, to);
        if (statusFilter !== 'all') q = q.eq('status', statusFilter);
        if (eventFilter !== 'all') q = q.eq('event_type', eventFilter);
        return q as unknown as PromiseLike<{ data: EmailLog[] | null; error: unknown }>;
      });

      if (rows.length === 0) {
        toast.info('No email logs found for selected range');
        return;
      }

      const exportRows = rows.map(l => ({
        'Timestamp': format(new Date(l.created_at), 'dd MMM yyyy HH:mm:ss'),
        'Event': EVENT_LABELS[l.event_type] || l.event_type,
        'Recipient Name': l.recipient_name || '',
        'Recipient Email': l.recipient_email,
        'Subject': l.subject || '',
        'Status': l.status,
        'Provider': l.provider || '',
        'Error': l.error_message || '',
        'Metadata': l.metadata ? JSON.stringify(l.metadata) : '',
      }));

      const ws = XLSX.utils.json_to_sheet(exportRows);
      ws['!cols'] = [
        { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 30 }, { wch: 40 },
        { wch: 12 }, { wch: 14 }, { wch: 40 }, { wch: 50 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Email Logs');
      const fromStr = format(downloadRange.from, 'yyyy-MM-dd');
      const toStr = format(downloadRange.to, 'yyyy-MM-dd');
      XLSX.writeFile(wb, `Email_Logs_${fromStr}_to_${toStr}.xlsx`);
      toast.success(`Exported ${rows.length} email log${rows.length === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to download email logs');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Email Logs" description="Track all system-generated emails" />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><Mail className="h-4 w-4 text-primary" /></div>
            <div><p className="text-2xl font-bold">{stats.total}</p><p className="text-xs text-muted-foreground">Total</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30"><CheckCircle2 className="h-4 w-4 text-emerald-600" /></div>
            <div><p className="text-2xl font-bold">{stats.sent}</p><p className="text-xs text-muted-foreground">Sent</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10"><XCircle className="h-4 w-4 text-destructive" /></div>
            <div><p className="text-2xl font-bold">{stats.failed}</p><p className="text-xs text-muted-foreground">Failed</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-secondary"><SkipForward className="h-4 w-4 text-muted-foreground" /></div>
            <div><p className="text-2xl font-bold">{stats.skipped}</p><p className="text-xs text-muted-foreground">Skipped</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><Clock className="h-4 w-4 text-primary" /></div>
            <div><p className="text-2xl font-bold">{stats.today}</p><p className="text-xs text-muted-foreground">Today</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by recipient or subject..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
              </SelectContent>
            </Select>
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Event Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                {eventTypes.map(et => (
                  <SelectItem key={et} value={et}>{EVENT_LABELS[et] || et}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('justify-start gap-2 min-w-[240px]', !downloadRange && 'text-muted-foreground')}>
                  <CalendarIcon className="h-4 w-4" />
                  {downloadRange?.from ? (
                    downloadRange.to ? (
                      <>{format(downloadRange.from, 'dd MMM yyyy')} – {format(downloadRange.to, 'dd MMM yyyy')}</>
                    ) : (
                      format(downloadRange.from, 'dd MMM yyyy')
                    )
                  ) : (
                    <span>Select date range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={downloadRange}
                  onSelect={setDownloadRange}
                  numberOfMonths={2}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Button onClick={handleDownload} disabled={downloading} className="gap-2">
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Timestamp</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead className="hidden md:table-cell">Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Provider</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No email logs found</TableCell></TableRow>
              ) : filtered.map(log => (
                <>
                  <TableRow key={log.id} className="cursor-pointer" onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}>
                    <TableCell className="w-8">
                      {expandedRow === log.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{format(new Date(log.created_at), 'dd MMM yyyy HH:mm')}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{EVENT_LABELS[log.event_type] || log.event_type}</Badge></TableCell>
                    <TableCell>
                      <div className="text-sm">{log.recipient_name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{log.recipient_email}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell max-w-[250px] truncate text-xs">{log.subject || '—'}</TableCell>
                    <TableCell><StatusBadge status={log.status} /></TableCell>
                    <TableCell className="hidden lg:table-cell text-xs capitalize">{log.provider || '—'}</TableCell>
                  </TableRow>
                  {expandedRow === log.id && (
                    <TableRow key={`${log.id}-detail`}>
                      <TableCell colSpan={7} className="bg-muted/30 p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="font-medium mb-1">Subject</p>
                            <p className="text-muted-foreground">{log.subject || 'N/A'}</p>
                          </div>
                          {log.error_message && (
                            <div>
                              <p className="font-medium mb-1 text-destructive">Error</p>
                              <p className="text-destructive/80 text-xs">{log.error_message}</p>
                            </div>
                          )}
                          {log.metadata && Object.keys(log.metadata).length > 0 && (
                            <div className="md:col-span-2">
                              <p className="font-medium mb-1">Metadata</p>
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(log.metadata).map(([k, v]) => (
                                  <Badge key={k} variant="secondary" className="text-xs font-normal">
                                    {k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
