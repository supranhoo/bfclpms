import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Search, Eye, MessageCircle, CheckCircle2, AlertCircle, Clock, Download, Lock, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

type ObservationStatus = 'open' | 'acknowledged' | 'resolved';

interface AdminObservation {
  id: string;
  kpi_id: string;
  title: string;
  description: string | null;
  observation_type: 'positive' | 'concern' | 'neutral';
  observer_role: string;
  status: string;
  visibility: string;
  created_at: string;
  updated_at: string;
  created_by_profile: { full_name: string | null; email: string } | null;
  kpi: { kra_name: string; kpi_name: string; employee_id: string } | null;
  employee_profile: { full_name: string | null; email: string; employee_code: string | null } | null;
}

function useAllObservations() {
  return useQuery({
    queryKey: ['admin-all-observations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpi_observations')
        .select(`
          id, kpi_id, title, description, observation_type, observer_role, status, visibility, created_at, updated_at, ticket_number,
          created_by_profile:profiles!kpi_observations_created_by_fkey(full_name, email)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch KPI info + employee profiles
      const kpiIds = [...new Set(data.map(o => o.kpi_id))];
      const { data: kpis } = await supabase
        .from('kpis')
        .select('id, kra_name, kpi_name, employee_id')
        .in('id', kpiIds);

      const kpiMap = new Map(kpis?.map(k => [k.id, k]) || []);

      const employeeIds = [...new Set(kpis?.map(k => k.employee_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, employee_code')
        .in('id', employeeIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      return data.map(obs => {
        const kpi = kpiMap.get(obs.kpi_id) || null;
        return {
          ...obs,
          kpi,
          employee_profile: kpi ? profileMap.get(kpi.employee_id) || null : null,
        } as AdminObservation;
      });
    },
  });
}

const statusConfig: Record<string, { label: string; icon: typeof Clock; variant: 'default' | 'secondary' | 'outline' }> = {
  open: { label: 'Open', icon: Clock, variant: 'default' },
  acknowledged: { label: 'Acknowledged', icon: MessageCircle, variant: 'secondary' },
  resolved: { label: 'Resolved', icon: CheckCircle2, variant: 'outline' },
};

const typeConfig: Record<string, { label: string; className: string }> = {
  positive: { label: 'Positive', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  concern: { label: 'Concern', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  neutral: { label: 'Neutral', className: 'bg-muted text-muted-foreground' },
};

export default function ObservationsOverview() {
  const { data: observations, isLoading } = useAllObservations();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const counts = useMemo(() => {
    if (!observations) return { all: 0, open: 0, acknowledged: 0, resolved: 0 };
    return {
      all: observations.length,
      open: observations.filter(o => o.status === 'open').length,
      acknowledged: observations.filter(o => o.status === 'acknowledged').length,
      resolved: observations.filter(o => o.status === 'resolved').length,
    };
  }, [observations]);

  const filtered = useMemo(() => {
    if (!observations) return [];
    return observations.filter(obs => {
      if (statusFilter !== 'all' && obs.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const match =
          obs.title.toLowerCase().includes(q) ||
          obs.kpi?.kra_name?.toLowerCase().includes(q) ||
          obs.kpi?.kpi_name?.toLowerCase().includes(q) ||
          obs.employee_profile?.full_name?.toLowerCase().includes(q) ||
          obs.employee_profile?.employee_code?.toLowerCase().includes(q) ||
          obs.created_by_profile?.full_name?.toLowerCase().includes(q) ||
          (obs as any).ticket_number?.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [observations, statusFilter, search]);

  const handleExportExcel = () => {
    const rows = filtered.map(obs => ({
      'Ticket #': (obs as any).ticket_number || '',
      'Title': obs.title,
      'Description': obs.description || '',
      'Employee': obs.employee_profile?.full_name || '',
      'Employee Code': obs.employee_profile?.employee_code || '',
      'KRA': obs.kpi?.kra_name || '',
      'KPI': obs.kpi?.kpi_name || '',
      'Type': typeConfig[obs.observation_type]?.label || obs.observation_type,
      'Visibility': obs.visibility === 'internal' ? 'Internal' : 'Public',
      'Observer': obs.created_by_profile?.full_name || '',
      'Observer Role': obs.observer_role,
      'Status': statusConfig[obs.status]?.label || obs.status,
      'Created': format(new Date(obs.created_at), 'dd MMM yyyy'),
      'Last Updated': format(new Date(obs.updated_at), 'dd MMM yyyy'),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 30 }, { wch: 40 }, { wch: 20 }, { wch: 14 },
      { wch: 25 }, { wch: 30 }, { wch: 10 }, { wch: 20 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Observations');
    XLSX.writeFile(wb, `Observations_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const tabs = [
    { value: 'all', label: 'All', icon: Eye, count: counts.all },
    { value: 'open', label: 'Open', icon: Clock, count: counts.open },
    { value: 'acknowledged', label: 'Acknowledged', icon: MessageCircle, count: counts.acknowledged },
    { value: 'resolved', label: 'Resolved', icon: CheckCircle2, count: counts.resolved },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="All Observations" description="View and monitor all KPI observations across the organization" />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title, employee, KRA, KPI..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={filtered.length === 0} className="gap-1.5">
              <Download className="h-4 w-4" />
              Download Report
            </Button>
            <Tabs value={statusFilter} onValueChange={setStatusFilter} className="flex-1">
              <TabsList className="grid w-full grid-cols-4 max-w-md">
                {tabs.map(tab => {
                  const Icon = tab.icon;
                  return (
                    <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
                      <Icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{tab.label}</span>
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{tab.count}</Badge>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">Loading observations...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <AlertCircle className="h-8 w-8" />
              <p>No observations found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Ticket #</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>KRA / KPI</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead>Observer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(obs => {
                  const st = statusConfig[obs.status] || statusConfig.open;
                  const tp = typeConfig[obs.observation_type] || typeConfig.neutral;
                  const StIcon = st.icon;
                  return (
                    <TableRow key={obs.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{(obs as any).ticket_number || '—'}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">{obs.title}</TableCell>
                      <TableCell>
                        <div className="text-sm">{obs.employee_profile?.full_name || '—'}</div>
                        {obs.employee_profile?.employee_code && (
                          <div className="text-xs text-muted-foreground">{obs.employee_profile.employee_code}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{obs.kpi?.kra_name || '—'}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[180px]">{obs.kpi?.kpi_name}</div>
                      </TableCell>
                      <TableCell>
                        <Badge className={tp.className} variant="secondary">{tp.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {obs.visibility === 'internal' ? (
                          <Badge variant="outline" className="gap-1 border-violet-300 dark:border-violet-700 bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400">
                            <Lock className="h-3 w-3" />
                            Internal
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-muted-foreground">
                            <Globe className="h-3 w-3" />
                            Public
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{obs.created_by_profile?.full_name || '—'}</div>
                        <div className="text-xs text-muted-foreground capitalize">{obs.observer_role}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={st.variant} className="gap-1">
                          <StIcon className="h-3 w-3" />
                          {st.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(obs.created_at), 'dd MMM yyyy')}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
