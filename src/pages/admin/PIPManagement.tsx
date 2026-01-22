import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { usePIPs, usePIPSummary, PIPStatus } from '@/hooks/usePIP';
import { useAuth } from '@/contexts/AuthContext';
import { PIPCreateDialog } from '@/components/pip/PIPCreateDialog';
import { PIPDetailSheet } from '@/components/pip/PIPDetailSheet';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  FileText, 
  Plus, 
  Search, 
  UserX,
  ClipboardCheck,
  XCircle
} from 'lucide-react';
import { format } from 'date-fns';

const STATUS_CONFIG: Record<PIPStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
  draft: { label: 'Draft', variant: 'secondary', icon: FileText },
  pending_hr_approval: { label: 'Pending HR', variant: 'outline', icon: Clock },
  active: { label: 'Active', variant: 'default', icon: AlertTriangle },
  completed: { label: 'Completed', variant: 'secondary', icon: CheckCircle2 },
  extended: { label: 'Extended', variant: 'destructive', icon: Clock },
  terminated: { label: 'Terminated', variant: 'destructive', icon: XCircle },
};

export default function PIPManagement() {
  const { role } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<PIPStatus | 'all'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedPipId, setSelectedPipId] = useState<string | null>(null);

  const { data: summary, isLoading: summaryLoading } = usePIPSummary();
  const { data: pips, isLoading: pipsLoading } = usePIPs(
    statusFilter !== 'all' ? { status: statusFilter } : undefined
  );

  const filteredPips = pips?.filter(pip => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      pip.employee?.full_name?.toLowerCase().includes(term) ||
      pip.employee?.employee_code?.toLowerCase().includes(term) ||
      pip.initiator?.full_name?.toLowerCase().includes(term)
    );
  });

  const isHR = role === 'admin' || role === 'management';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance Improvement Plans"
        description="Manage and track employee performance improvement plans"
        backTo="/admin"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New PIP
          </Button>
        }
      />

      {/* Summary Cards */}
      {summaryLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="cursor-pointer hover:shadow-md" onClick={() => setStatusFilter('all')}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total PIPs</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.total || 0}</div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md" onClick={() => setStatusFilter('pending_hr_approval')}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
              <Clock className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{summary?.pendingApproval || 0}</div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md" onClick={() => setStatusFilter('active')}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {(summary?.active || 0) + (summary?.extended || 0)}
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md" onClick={() => setStatusFilter('completed')}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{summary?.completed || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary?.completed ? 
                  Math.round((summary.improved / summary.completed) * 100) : 0}%
              </div>
              <p className="text-xs text-muted-foreground">
                {summary?.improved || 0} improved
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as PIPStatus | 'all')}>
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="draft">Draft</TabsTrigger>
            {isHR && <TabsTrigger value="pending_hr_approval">Pending HR</TabsTrigger>}
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <TabsContent value={statusFilter} className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>PIPs List</CardTitle>
              <CardDescription>
                {statusFilter === 'all' ? 'All performance improvement plans' : 
                  `Showing ${STATUS_CONFIG[statusFilter as PIPStatus]?.label || statusFilter} PIPs`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pipsLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Initiated By</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Milestones</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPips?.map(pip => {
                      const statusConfig = STATUS_CONFIG[pip.status];
                      const StatusIcon = statusConfig.icon;
                      const effectiveEndDate = pip.extended_end_date || pip.end_date;
                      const milestonesCompleted = pip.milestones?.filter(m => m.status === 'met').length || 0;
                      const totalMilestones = pip.milestones?.length || 0;

                      return (
                        <TableRow key={pip.id} className="cursor-pointer" onClick={() => setSelectedPipId(pip.id)}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{pip.employee?.full_name}</div>
                              <div className="text-xs text-muted-foreground">
                                {pip.employee?.employee_code} · {pip.employee?.designation}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{pip.initiator?.full_name}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {format(new Date(pip.start_date), 'MMM d')} - {format(new Date(effectiveEndDate), 'MMM d, yyyy')}
                            </div>
                            {pip.extended_end_date && (
                              <div className="text-xs text-warning">Extended</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusConfig.variant}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statusConfig.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {milestonesCompleted}/{totalMilestones} complete
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm">View</Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {(!filteredPips || filteredPips.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          <UserX className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          {searchTerm ? 'No matching PIPs found' : 'No PIPs in this category'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <PIPCreateDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* Detail Sheet */}
      <PIPDetailSheet 
        pipId={selectedPipId} 
        open={!!selectedPipId} 
        onOpenChange={(open) => !open && setSelectedPipId(null)} 
      />
    </div>
  );
}
