import { useState } from 'react';
import { format, subMonths } from 'date-fns';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, Settings, AlertTriangle, Users, Undo2, Mail } from 'lucide-react';
import { EffectiveMonthSelector } from '@/components/admin/EffectiveMonthSelector';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdateSystemSetting } from '@/hooks/useSystemSettings';
import {
  usePendingReviewSettings,
  useOverdueKraSetKpis,
  useOverdueTeamReviewKpis,
  useBulkAutoScore,
  useBulkManagerPenalty,
  useSentBackKpisTab,
  useSendReminder,
  OverdueKpi,
  SentBackKpi,
} from '@/hooks/usePendingSelfReviews';
import { useToast } from '@/hooks/use-toast';

export default function PendingSelfReviews() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { deadlineDay, employeeRemark, managerRemark, isLoading: settingsLoading } = usePendingReviewSettings();

  const prevMonth = subMonths(new Date(), 1);
  const [selectedMonth, setSelectedMonth] = useState<string>(format(prevMonth, 'MMMM'));
  const [selectedYear, setSelectedYear] = useState<number>(prevMonth.getFullYear());

  const [editDay, setEditDay] = useState<string>('');
  const [editEmpRemark, setEditEmpRemark] = useState<string>('');
  const [editMgrRemark, setEditMgrRemark] = useState<string>('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: overdueKraSet = [], isLoading: kraSetLoading } = useOverdueKraSetKpis(deadlineDay, selectedMonth, selectedYear);
  const { data: overdueTeamReview = [], isLoading: teamReviewLoading } = useOverdueTeamReviewKpis(deadlineDay, selectedMonth, selectedYear);

  const updateSetting = useUpdateSystemSetting();
  const bulkAutoScore = useBulkAutoScore();
  const bulkManagerPenalty = useBulkManagerPenalty();

  const [selectedKraSet, setSelectedKraSet] = useState<Set<string>>(new Set());
  const [selectedTeamReview, setSelectedTeamReview] = useState<Set<string>>(new Set());

  const handleSaveSettings = async () => {
    try {
      if (editDay) await updateSetting.mutateAsync({ key: 'pending_review_deadline_day', value: editDay });
      if (editEmpRemark) await updateSetting.mutateAsync({ key: 'pending_review_auto_remark', value: editEmpRemark });
      if (editMgrRemark) await updateSetting.mutateAsync({ key: 'manager_penalty_auto_remark', value: editMgrRemark });
      toast({ title: 'Settings Saved' });
      setSettingsOpen(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleAutoScoreSelected = () => {
    if (!user?.id || selectedKraSet.size === 0) return;
    bulkAutoScore.mutate({ kpiIds: [...selectedKraSet], remark: employeeRemark, adminId: user.id });
    setSelectedKraSet(new Set());
  };

  const handleAutoScoreAll = () => {
    if (!user?.id || overdueKraSet.length === 0) return;
    bulkAutoScore.mutate({ kpiIds: overdueKraSet.map(k => k.kpiId), remark: employeeRemark, adminId: user.id });
    setSelectedKraSet(new Set());
  };

  const handlePenalizeSelected = () => {
    if (!user?.id || selectedTeamReview.size === 0) return;
    const items = overdueTeamReview.filter(k => selectedTeamReview.has(k.kpiId));
    bulkManagerPenalty.mutate({ items, remark: managerRemark, adminId: user.id });
    setSelectedTeamReview(new Set());
  };

  const handlePenalizeAll = () => {
    if (!user?.id || overdueTeamReview.length === 0) return;
    bulkManagerPenalty.mutate({ items: overdueTeamReview, remark: managerRemark, adminId: user.id });
    setSelectedTeamReview(new Set());
  };

  const toggleSelection = (set: Set<string>, setFn: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setFn(next);
  };

  const toggleAll = (items: OverdueKpi[], set: Set<string>, setFn: (s: Set<string>) => void) => {
    if (set.size === items.length) {
      setFn(new Set());
    } else {
      setFn(new Set(items.map(i => i.kpiId)));
    }
  };

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Pending Reviews" description="Manage overdue self-reviews and manager penalties" />

      {/* Settings Panel */}
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => {
          if (!settingsOpen) {
            setEditDay(String(deadlineDay));
            setEditEmpRemark(employeeRemark);
            setEditMgrRemark(managerRemark);
          }
          setSettingsOpen(!settingsOpen);
        }}>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4" />
            Settings
            <Badge variant="outline" className="ml-2">Deadline: {deadlineDay}th</Badge>
          </CardTitle>
        </CardHeader>
        {settingsOpen && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Deadline Day (of following month)</Label>
                <Input type="number" min={1} max={28} value={editDay} onChange={e => setEditDay(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Employee Auto-Remark</Label>
                <Input value={editEmpRemark} onChange={e => setEditEmpRemark(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Manager Penalty Remark</Label>
                <Input value={editMgrRemark} onChange={e => setEditMgrRemark(e.target.value)} />
              </div>
            </div>
            <Button size="sm" onClick={handleSaveSettings} disabled={updateSetting.isPending}>
              {updateSetting.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save Settings
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Month-Year Filter */}
      <EffectiveMonthSelector
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        onMonthChange={setSelectedMonth}
        onYearChange={setSelectedYear}
      />

      {/* Tabs */}
      <Tabs defaultValue="self-review">
        <TabsList>
          <TabsTrigger value="self-review" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Pending Self-Review ({overdueKraSet.length})
          </TabsTrigger>
          <TabsTrigger value="team-review" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Pending Manager Review ({overdueTeamReview.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Pending Self-Review */}
        <TabsContent value="self-review">
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" onClick={handleAutoScoreSelected} disabled={selectedKraSet.size === 0 || bulkAutoScore.isPending}>
                  {bulkAutoScore.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Auto-Score Selected ({selectedKraSet.size})
                </Button>
                <Button size="sm" variant="destructive" onClick={handleAutoScoreAll} disabled={overdueKraSet.length === 0 || bulkAutoScore.isPending}>
                  Auto-Score All ({overdueKraSet.length})
                </Button>
              </div>

              {kraSetLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : overdueKraSet.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No overdue self-review KPIs found.</p>
              ) : (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={selectedKraSet.size === overdueKraSet.length && overdueKraSet.length > 0}
                            onCheckedChange={() => toggleAll(overdueKraSet, selectedKraSet, setSelectedKraSet)}
                          />
                        </TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>KPI</TableHead>
                        <TableHead>KRA</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Days Overdue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overdueKraSet.map(item => (
                        <TableRow key={item.kpiId}>
                          <TableCell>
                            <Checkbox
                              checked={selectedKraSet.has(item.kpiId)}
                              onCheckedChange={() => toggleSelection(selectedKraSet, setSelectedKraSet, item.kpiId)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{item.employeeName}</TableCell>
                          <TableCell>{item.employeeCode}</TableCell>
                          <TableCell>{item.departmentName}</TableCell>
                          <TableCell>{item.kpiName}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{item.kraName}</TableCell>
                          <TableCell>{item.reviewPeriod} {item.reviewYear}</TableCell>
                          <TableCell>
                            <Badge variant={item.daysOverdue > 15 ? 'destructive' : 'secondary'}>
                              {item.daysOverdue} days
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Pending Manager Review */}
        <TabsContent value="team-review">
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" onClick={handlePenalizeSelected} disabled={selectedTeamReview.size === 0 || bulkManagerPenalty.isPending}>
                  {bulkManagerPenalty.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Penalize Managers ({selectedTeamReview.size})
                </Button>
                <Button size="sm" variant="destructive" onClick={handlePenalizeAll} disabled={overdueTeamReview.length === 0 || bulkManagerPenalty.isPending}>
                  Penalize All ({overdueTeamReview.length})
                </Button>
              </div>

              {teamReviewLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : overdueTeamReview.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No overdue manager-review KPIs found.</p>
              ) : (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={selectedTeamReview.size === overdueTeamReview.length && overdueTeamReview.length > 0}
                            onCheckedChange={() => toggleAll(overdueTeamReview, selectedTeamReview, setSelectedTeamReview)}
                          />
                        </TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>KPI</TableHead>
                        <TableHead>Manager</TableHead>
                        <TableHead>Skip Manager</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Days Overdue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overdueTeamReview.map(item => (
                        <TableRow key={item.kpiId}>
                          <TableCell>
                            <Checkbox
                              checked={selectedTeamReview.has(item.kpiId)}
                              onCheckedChange={() => toggleSelection(selectedTeamReview, setSelectedTeamReview, item.kpiId)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{item.employeeName}</TableCell>
                          <TableCell>{item.employeeCode}</TableCell>
                          <TableCell>{item.departmentName}</TableCell>
                          <TableCell>{item.kpiName}</TableCell>
                          <TableCell>{item.reportingManagerName || '—'}</TableCell>
                          <TableCell>{item.skipLevelManagerName || '—'}</TableCell>
                          <TableCell>{item.reviewPeriod} {item.reviewYear}</TableCell>
                          <TableCell>
                            <Badge variant={item.daysOverdue > 15 ? 'destructive' : 'secondary'}>
                              {item.daysOverdue} days
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
