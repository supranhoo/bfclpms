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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Settings, AlertTriangle, Users, Undo2, Mail, RotateCcw, UserCheck, FastForward, Download, ArrowUpDown, ArrowUp, ArrowDown, ShieldAlert } from 'lucide-react';
import * as XLSX from 'xlsx';
import { EffectiveMonthSelector } from '@/components/admin/EffectiveMonthSelector';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdateSystemSetting, useSystemSetting } from '@/hooks/useSystemSettings';
import {
  usePendingReviewSettings,
  useOverdueKraSetKpis,
  useOverdueTeamReviewKpis,
  useOverdueSkipLevelKpis,
  useBulkAutoScore,
  useBulkManagerPenalty,
  useSentBackKpisTab,
  useSendReminder,
  useAutoScoredKpis,
  usePenalizedManagerKpis,
  useRollbackAutoScore,
  useRollbackManagerPenalty,
  useBulkPushForward,
  OverdueKpi,
  SentBackKpi,
  AutoScoredKpi,
  PenalizedManagerKpi,
} from '@/hooks/usePendingSelfReviews';
import { CompliancePenaltyTab } from '@/components/admin/CompliancePenaltyTab';
import { useToast } from '@/hooks/use-toast';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

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

  // Effective from month setting
  const { data: effectiveFromSetting } = useSystemSetting('pending_review_effective_from_month');
  const effectiveFrom = effectiveFromSetting?.setting_value
    ? (typeof effectiveFromSetting.setting_value === 'string'
      ? JSON.parse(effectiveFromSetting.setting_value)
      : effectiveFromSetting.setting_value) as { month: string; year: number }
    : null;
  const [editEffMonth, setEditEffMonth] = useState<string>('');
  const [editEffYear, setEditEffYear] = useState<string>('');

  const { data: overdueKraSet = [], isLoading: kraSetLoading } = useOverdueKraSetKpis(deadlineDay, selectedMonth, selectedYear);
  const { data: overdueTeamReview = [], isLoading: teamReviewLoading } = useOverdueTeamReviewKpis(deadlineDay, selectedMonth, selectedYear);
  const { data: sentBackKpis = [], isLoading: sentBackLoading } = useSentBackKpisTab(selectedMonth, selectedYear);
  const { data: autoScoredKpis = [], isLoading: autoScoredLoading } = useAutoScoredKpis(selectedMonth, selectedYear);
  const { data: penalizedKpis = [], isLoading: penalizedLoading } = usePenalizedManagerKpis(selectedMonth, selectedYear);
  const { data: overdueSkipLevel = [], isLoading: skipLevelLoading } = useOverdueSkipLevelKpis(deadlineDay, selectedMonth, selectedYear);

  const updateSetting = useUpdateSystemSetting();
  const bulkAutoScore = useBulkAutoScore();
  const bulkManagerPenalty = useBulkManagerPenalty();
  const sendReminder = useSendReminder();
  const rollbackAutoScore = useRollbackAutoScore();
  const rollbackManagerPenalty = useRollbackManagerPenalty();
  const bulkPushForward = useBulkPushForward();

  const [selectedKraSet, setSelectedKraSet] = useState<Set<string>>(new Set());
  const [selectedTeamReview, setSelectedTeamReview] = useState<Set<string>>(new Set());
  const [selectedSentBack, setSelectedSentBack] = useState<Set<string>>(new Set());
  const [selectedAutoScored, setSelectedAutoScored] = useState<Set<string>>(new Set());
  const [selectedPenalized, setSelectedPenalized] = useState<Set<string>>(new Set());
  const [selectedSkipLevel, setSelectedSkipLevel] = useState<Set<string>>(new Set());

  // Sorting state for Code and Reviewer columns
  const [sortField, setSortField] = useState<'code' | 'reviewer' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSortClick = (field: 'code' | 'reviewer') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: 'code' | 'reviewer') => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const sortItems = (items: OverdueKpi[], tabType: 'self' | 'manager' | 'skip'): OverdueKpi[] => {
    if (!sortField) return items;
    return [...items].sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      let valA = '';
      let valB = '';
      if (sortField === 'code') {
        valA = a.employeeCode || '';
        valB = b.employeeCode || '';
      } else {
        valA = tabType === 'skip' ? (a.skipLevelManagerName || '') : (a.reportingManagerName || '');
        valB = tabType === 'skip' ? (b.skipLevelManagerName || '') : (b.reportingManagerName || '');
      }
      return valA.localeCompare(valB) * dir;
    });
  };

  // Push forward targets per tab
  const [selfForwardTarget, setSelfForwardTarget] = useState<string>('self_review');
  const [mgrForwardTarget, setMgrForwardTarget] = useState<string>('manager_check');
  const [skipForwardTarget, setSkipForwardTarget] = useState<string>('hr_pms_review');

  const handleSaveSettings = async () => {
    try {
      if (editDay) await updateSetting.mutateAsync({ key: 'pending_review_deadline_day', value: editDay });
      if (editEmpRemark) await updateSetting.mutateAsync({ key: 'pending_review_auto_remark', value: editEmpRemark });
      if (editMgrRemark) await updateSetting.mutateAsync({ key: 'manager_penalty_auto_remark', value: editMgrRemark });
      if (editEffMonth && editEffYear) {
        await updateSetting.mutateAsync({
          key: 'pending_review_effective_from_month',
          value: JSON.stringify({ month: editEffMonth, year: parseInt(editEffYear) }),
        });
      }
      toast({ title: 'Settings Saved' });
      setSettingsOpen(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleAutoScoreSelected = () => {
    if (!user?.id || selectedKraSet.size === 0) return;
    const selectedItems = overdueKraSet.filter(k => selectedKraSet.has(k.kpiId));
    const kpiDetails = selectedItems.map(k => ({ kpiId: k.kpiId, kpiName: k.kpiName, employeeId: k.employeeId, reviewPeriod: k.reviewPeriod, reviewYear: k.reviewYear }));
    bulkAutoScore.mutate({ kpiIds: [...selectedKraSet], remark: employeeRemark, adminId: user.id, kpiDetails });
    setSelectedKraSet(new Set());
  };

  const handleAutoScoreAll = () => {
    if (!user?.id || overdueKraSet.length === 0) return;
    const kpiDetails = overdueKraSet.map(k => ({ kpiId: k.kpiId, kpiName: k.kpiName, employeeId: k.employeeId, reviewPeriod: k.reviewPeriod, reviewYear: k.reviewYear }));
    bulkAutoScore.mutate({ kpiIds: overdueKraSet.map(k => k.kpiId), remark: employeeRemark, adminId: user.id, kpiDetails });
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

  const handleSendReminderSelected = () => {
    if (selectedSentBack.size === 0) return;
    const items = sentBackKpis.filter(k => selectedSentBack.has(k.kpiId));
    sendReminder.mutate({ items });
    setSelectedSentBack(new Set());
  };

  const handleSendReminderAll = () => {
    if (sentBackKpis.length === 0) return;
    sendReminder.mutate({ items: sentBackKpis });
    setSelectedSentBack(new Set());
  };

  const handleRollbackAutoScoreSelected = () => {
    if (!user?.id || selectedAutoScored.size === 0) return;
    rollbackAutoScore.mutate({ kpiIds: [...selectedAutoScored], adminId: user.id });
    setSelectedAutoScored(new Set());
  };

  const handleRollbackAutoScoreAll = () => {
    if (!user?.id || autoScoredKpis.length === 0) return;
    rollbackAutoScore.mutate({ kpiIds: autoScoredKpis.map(k => k.kpiId), adminId: user.id });
    setSelectedAutoScored(new Set());
  };

  const handleRollbackPenaltySelected = () => {
    if (!user?.id || selectedPenalized.size === 0) return;
    const items = penalizedKpis.filter(k => selectedPenalized.has(k.kpiId));
    rollbackManagerPenalty.mutate({ items, adminId: user.id });
    setSelectedPenalized(new Set());
  };

  const handleRollbackPenaltyAll = () => {
    if (!user?.id || penalizedKpis.length === 0) return;
    rollbackManagerPenalty.mutate({ items: penalizedKpis, adminId: user.id });
    setSelectedPenalized(new Set());
  };
  // Push forward handlers
  const handlePushForwardSelected = (
    items: OverdueKpi[],
    selected: Set<string>,
    setSelected: (s: Set<string>) => void,
    targetStatus: string,
    currentStatusLabel: string
  ) => {
    if (!user?.id || selected.size === 0) return;
    const kpiItems = items
      .filter(k => selected.has(k.kpiId))
      .map(k => ({ kpiId: k.kpiId, employeeId: k.employeeId }));
    bulkPushForward.mutate({
      kpiItems,
      targetStatus,
      adminId: user.id,
      currentStatusLabel,
    });
    setSelected(new Set());
  };

  const handlePushForwardAll = (
    items: OverdueKpi[],
    targetStatus: string,
    currentStatusLabel: string
  ) => {
    if (!user?.id || items.length === 0) return;
    bulkPushForward.mutate({
      kpiItems: items.map(k => ({ kpiId: k.kpiId, employeeId: k.employeeId })),
      targetStatus,
      adminId: user.id,
      currentStatusLabel,
    });
  };

  const toggleSelection = (set: Set<string>, setFn: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setFn(next);
  };

  const toggleAll = (items: Array<{ kpiId: string }>, set: Set<string>, setFn: (s: Set<string>) => void) => {
    if (set.size === items.length) {
      setFn(new Set());
    } else {
      setFn(new Set(items.map(i => i.kpiId)));
    }
  };

  const getReviewerName = (item: OverdueKpi, pendingWith: string): string => {
    if (pendingWith === 'Employee') return item.reportingManagerName || '-';
    if (pendingWith === 'Manager') return item.reportingManagerName || '-';
    if (pendingWith === 'Skip-Level Manager') return item.skipLevelManagerName || '-';
    return '-';
  };

  const handleExportExcel = (tabName: string, pendingWith: string, data: OverdueKpi[]) => {
    if (data.length === 0) return;
    const rows = data.map(k => ({
      'Employee': k.employeeName,
      'Code': k.employeeCode,
      'Department': k.departmentName,
      'KPI': k.kpiName,
      'Frequency': k.frequency || '-',
      'Pending With': pendingWith,
      'Reviewer': getReviewerName(k, pendingWith),
      'Period': `${k.reviewPeriod} ${k.reviewYear}`,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 25 }, { wch: 14 }, { wch: 20 }, { wch: 35 }, { wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tabName);
    XLSX.writeFile(wb, `Pending_Reviews_${tabName.replace(/\s+/g, '_')}_${selectedMonth}_${selectedYear}.xlsx`);
  };

  const handleExportSentBack = () => {
    if (sentBackKpis.length === 0) return;
    const statusLabel: Record<string, string> = {
      kra_set: 'With Employee',
      self_review: 'With Manager',
      manager_check: 'With Skip-Level',
      skip_level_check: 'With Skip-Level',
      audit: 'With Auditor',
      management_review: 'With Management',
    };
    const rows = sentBackKpis.map(k => ({
      'Employee': k.employeeName,
      'Code': k.employeeCode,
      'Department': k.departmentName,
      'KPI': k.kpiName,
      'Frequency': k.frequency || '-',
      'Current Status': statusLabel[k.currentStatus] || k.currentStatus,
      'Sent Back By': k.sentBackBy,
      'Reason': k.reason,
      'Date': format(new Date(k.sentBackDate), 'dd MMM yyyy'),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 25 }, { wch: 14 }, { wch: 20 }, { wch: 35 }, { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 30 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sent Back');
    XLSX.writeFile(wb, `Pending_Reviews_Sent_Back_${selectedMonth}_${selectedYear}.xlsx`);
  };

  const handleExportRollback = () => {
    if (autoScoredKpis.length === 0 && penalizedKpis.length === 0) return;
    const wb = XLSX.utils.book_new();
    if (autoScoredKpis.length > 0) {
      const rows = autoScoredKpis.map(k => ({
        'Type': 'Auto-Scored',
        'Employee': k.employeeName,
        'Code': k.employeeCode,
        'Department': k.departmentName,
        'KPI': k.kpiName,
        'KRA': k.kraName,
        'Frequency': k.frequency || '-',
        'Period': `${k.reviewPeriod} ${k.reviewYear}`,
        'Scored At': format(new Date(k.scoredAt), 'dd MMM yyyy HH:mm'),
        'Scored By': k.scoredBy,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 14 }, { wch: 25 }, { wch: 14 }, { wch: 20 }, { wch: 35 }, { wch: 25 }, { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Auto-Scored');
    }
    if (penalizedKpis.length > 0) {
      const rows = penalizedKpis.map(k => ({
        'Type': 'Manager Penalty',
        'Manager': k.managerName,
        'Code': k.managerCode,
        'Department': k.departmentName,
        'KPI': k.kpiName,
        'KRA': k.kraName,
        'Frequency': k.frequency || '-',
        'Period': `${k.reviewPeriod} ${k.reviewYear}`,
        'Previous Status': k.oldStatus.replace(/_/g, ' '),
        'Scored At': format(new Date(k.scoredAt), 'dd MMM yyyy HH:mm'),
        'Scored By': k.scoredBy,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 16 }, { wch: 25 }, { wch: 14 }, { wch: 20 }, { wch: 35 }, { wch: 25 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Manager Penalty');
    }
    XLSX.writeFile(wb, `Pending_Reviews_Rollback_${selectedMonth}_${selectedYear}.xlsx`);
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
            setEditEffMonth(effectiveFrom?.month || '');
            setEditEffYear(effectiveFrom?.year ? String(effectiveFrom.year) : '');
          }
          setSettingsOpen(!settingsOpen);
        }}>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4" />
            Settings
            <Badge variant="outline" className="ml-2">Deadline: {deadlineDay}th</Badge>
            {effectiveFrom && (
              <Badge variant="outline" className="ml-1">Effective From: {effectiveFrom.month} {effectiveFrom.year}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        {settingsOpen && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <div className="space-y-1.5">
                <Label>Effective From Month</Label>
                <div className="flex gap-2">
                  <Select value={editEffMonth} onValueChange={setEditEffMonth}>
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map(m => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={editEffYear} onValueChange={setEditEffYear}>
                    <SelectTrigger className="w-[90px] h-8">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="self-review" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Pending Self-Review ({overdueKraSet.length})
          </TabsTrigger>
          <TabsTrigger value="team-review" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Pending Manager Review ({overdueTeamReview.length})
          </TabsTrigger>
          <TabsTrigger value="skip-level" className="gap-1.5">
            <UserCheck className="h-3.5 w-3.5" />
            Pending Skip-Level Review ({overdueSkipLevel.length})
          </TabsTrigger>
          <TabsTrigger value="sent-back" className="gap-1.5">
            <Undo2 className="h-3.5 w-3.5" />
            Sent Back KPIs ({sentBackKpis.length})
          </TabsTrigger>
          <TabsTrigger value="rollback" className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Rollback ({autoScoredKpis.length + penalizedKpis.length})
          </TabsTrigger>
          <TabsTrigger value="compliance-penalty" className="gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" />
            Compliance Penalty
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Pending Self-Review */}
        <TabsContent value="self-review">
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="flex gap-2 flex-wrap items-center">
                <Button size="sm" onClick={handleAutoScoreSelected} disabled={selectedKraSet.size === 0 || bulkAutoScore.isPending}>
                  {bulkAutoScore.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Auto-Score Selected ({selectedKraSet.size})
                </Button>
                <Button size="sm" variant="destructive" onClick={handleAutoScoreAll} disabled={overdueKraSet.length === 0 || bulkAutoScore.isPending}>
                  Auto-Score All ({overdueKraSet.length})
                </Button>
                <div className="h-6 w-px bg-border mx-1" />
                <Select value={selfForwardTarget} onValueChange={setSelfForwardTarget}>
                  <SelectTrigger className="h-8 w-[160px]">
                    <SelectValue placeholder="Forward to..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self_review">Manager</SelectItem>
                    <SelectItem value="manager_check">Skip Manager</SelectItem>
                    <SelectItem value="hr_pms_review">HR PMS</SelectItem>
                    <SelectItem value="audit">Audit</SelectItem>
                    <SelectItem value="management_review">Management</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => handlePushForwardSelected(overdueKraSet, selectedKraSet, setSelectedKraSet, selfForwardTarget, 'Self Review')} disabled={selectedKraSet.size === 0 || bulkPushForward.isPending}>
                  {bulkPushForward.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FastForward className="h-3.5 w-3.5 mr-1" />}
                  Push Selected
                </Button>
                <Button size="sm" variant="outline" onClick={() => handlePushForwardAll(overdueKraSet, selfForwardTarget, 'Self Review')} disabled={overdueKraSet.length === 0 || bulkPushForward.isPending}>
                  <FastForward className="h-3.5 w-3.5 mr-1" />
                  Push All
                </Button>
                <div className="h-6 w-px bg-border mx-1" />
                <Button size="sm" variant="outline" onClick={() => handleExportExcel('Self Review', 'Employee', overdueKraSet)} disabled={overdueKraSet.length === 0}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Export Excel
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
                        <TableHead className="cursor-pointer select-none" onClick={() => handleSortClick('code')}>
                          <span className="inline-flex items-center gap-1">Code {getSortIcon('code')}</span>
                        </TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>KPI</TableHead>
                         <TableHead>Pending With</TableHead>
                         <TableHead className="cursor-pointer select-none" onClick={() => handleSortClick('reviewer')}>
                           <span className="inline-flex items-center gap-1">Reviewer {getSortIcon('reviewer')}</span>
                         </TableHead>
                         <TableHead>Period</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortItems(overdueKraSet, 'self').map(item => (
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
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5 flex-wrap">
                              {item.kpiName}
                              {item.frequency === 'Bi-Monthly' && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-violet-300 text-violet-700">Bi-Monthly</Badge>}
                              {item.frequency === 'Quarterly' && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-teal-300 text-teal-700">Quarterly</Badge>}
                            </span>
                          </TableCell>
                           <TableCell><Badge variant="outline">Employee</Badge></TableCell>
                           <TableCell>{item.reportingManagerName || '-'}</TableCell>
                           <TableCell>{item.reviewPeriod} {item.reviewYear}</TableCell>
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
              <div className="flex gap-2 flex-wrap items-center">
                <Button size="sm" onClick={handlePenalizeSelected} disabled={selectedTeamReview.size === 0 || bulkManagerPenalty.isPending}>
                  {bulkManagerPenalty.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Penalize Managers ({selectedTeamReview.size})
                </Button>
                <Button size="sm" variant="destructive" onClick={handlePenalizeAll} disabled={overdueTeamReview.length === 0 || bulkManagerPenalty.isPending}>
                  Penalize All ({overdueTeamReview.length})
                </Button>
                <div className="h-6 w-px bg-border mx-1" />
                <Select value={mgrForwardTarget} onValueChange={setMgrForwardTarget}>
                  <SelectTrigger className="h-8 w-[160px]">
                    <SelectValue placeholder="Forward to..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager_check">Skip Manager</SelectItem>
                    <SelectItem value="hr_pms_review">HR PMS</SelectItem>
                    <SelectItem value="audit">Audit</SelectItem>
                    <SelectItem value="management_review">Management</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => handlePushForwardSelected(overdueTeamReview, selectedTeamReview, setSelectedTeamReview, mgrForwardTarget, 'Manager Review')} disabled={selectedTeamReview.size === 0 || bulkPushForward.isPending}>
                  {bulkPushForward.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FastForward className="h-3.5 w-3.5 mr-1" />}
                  Push Selected
                </Button>
                <Button size="sm" variant="outline" onClick={() => handlePushForwardAll(overdueTeamReview, mgrForwardTarget, 'Manager Review')} disabled={overdueTeamReview.length === 0 || bulkPushForward.isPending}>
                  <FastForward className="h-3.5 w-3.5 mr-1" />
                  Push All
                </Button>
                <div className="h-6 w-px bg-border mx-1" />
                <Button size="sm" variant="outline" onClick={() => handleExportExcel('Manager Review', 'Manager', overdueTeamReview)} disabled={overdueTeamReview.length === 0}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Export Excel
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
                        <TableHead className="cursor-pointer select-none" onClick={() => handleSortClick('code')}>
                          <span className="inline-flex items-center gap-1">Code {getSortIcon('code')}</span>
                        </TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>KPI</TableHead>
                         <TableHead>Pending With</TableHead>
                         <TableHead className="cursor-pointer select-none" onClick={() => handleSortClick('reviewer')}>
                           <span className="inline-flex items-center gap-1">Reviewer {getSortIcon('reviewer')}</span>
                         </TableHead>
                         <TableHead>Period</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortItems(overdueTeamReview, 'manager').map(item => (
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
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5 flex-wrap">
                              {item.kpiName}
                              {item.frequency === 'Bi-Monthly' && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-violet-300 text-violet-700">Bi-Monthly</Badge>}
                              {item.frequency === 'Quarterly' && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-teal-300 text-teal-700">Quarterly</Badge>}
                            </span>
                          </TableCell>
                           <TableCell><Badge variant="outline">Manager</Badge></TableCell>
                           <TableCell>{item.reportingManagerName || '-'}</TableCell>
                           <TableCell>{item.reviewPeriod} {item.reviewYear}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Pending Skip-Level Review */}
        <TabsContent value="skip-level">
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="flex gap-2 flex-wrap items-center">
                <Select value={skipForwardTarget} onValueChange={setSkipForwardTarget}>
                  <SelectTrigger className="h-8 w-[160px]">
                    <SelectValue placeholder="Forward to..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hr_pms_review">HR PMS</SelectItem>
                    <SelectItem value="audit">Audit</SelectItem>
                    <SelectItem value="management_review">Management</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => handlePushForwardSelected(overdueSkipLevel, selectedSkipLevel, setSelectedSkipLevel, skipForwardTarget, 'Skip-Level Review')} disabled={selectedSkipLevel.size === 0 || bulkPushForward.isPending}>
                  {bulkPushForward.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FastForward className="h-3.5 w-3.5 mr-1" />}
                  Push Selected ({selectedSkipLevel.size})
                </Button>
                <Button size="sm" variant="outline" onClick={() => handlePushForwardAll(overdueSkipLevel, skipForwardTarget, 'Skip-Level Review')} disabled={overdueSkipLevel.length === 0 || bulkPushForward.isPending}>
                  <FastForward className="h-3.5 w-3.5 mr-1" />
                  Push All ({overdueSkipLevel.length})
                </Button>
                <div className="h-6 w-px bg-border mx-1" />
                <Button size="sm" variant="outline" onClick={() => handleExportExcel('Skip Level', 'Skip-Level Manager', overdueSkipLevel)} disabled={overdueSkipLevel.length === 0}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Export Excel
                </Button>
              </div>

              {skipLevelLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : overdueSkipLevel.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No pending skip-level review KPIs found.</p>
              ) : (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={selectedSkipLevel.size === overdueSkipLevel.length && overdueSkipLevel.length > 0}
                            onCheckedChange={() => toggleAll(overdueSkipLevel, selectedSkipLevel, setSelectedSkipLevel)}
                          />
                        </TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={() => handleSortClick('code')}>
                          <span className="inline-flex items-center gap-1">Code {getSortIcon('code')}</span>
                        </TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>KPI</TableHead>
                         <TableHead>Pending With</TableHead>
                         <TableHead className="cursor-pointer select-none" onClick={() => handleSortClick('reviewer')}>
                           <span className="inline-flex items-center gap-1">Reviewer {getSortIcon('reviewer')}</span>
                         </TableHead>
                         <TableHead>Period</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortItems(overdueSkipLevel, 'skip').map(item => (
                        <TableRow key={item.kpiId}>
                          <TableCell>
                            <Checkbox
                              checked={selectedSkipLevel.has(item.kpiId)}
                              onCheckedChange={() => toggleSelection(selectedSkipLevel, setSelectedSkipLevel, item.kpiId)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{item.employeeName}</TableCell>
                          <TableCell>{item.employeeCode}</TableCell>
                          <TableCell>{item.departmentName}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5 flex-wrap">
                              {item.kpiName}
                              {item.frequency === 'Bi-Monthly' && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-violet-300 text-violet-700">Bi-Monthly</Badge>}
                              {item.frequency === 'Quarterly' && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-teal-300 text-teal-700">Quarterly</Badge>}
                            </span>
                          </TableCell>
                           <TableCell><Badge variant="outline">Skip-Level Manager</Badge></TableCell>
                           <TableCell>{item.skipLevelManagerName || '-'}</TableCell>
                           <TableCell>{item.reviewPeriod} {item.reviewYear}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Sent Back KPIs */}
        <TabsContent value="sent-back">
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" onClick={handleSendReminderSelected} disabled={selectedSentBack.size === 0 || sendReminder.isPending}>
                  {sendReminder.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  <Mail className="h-3.5 w-3.5 mr-1" />
                  Send Reminder ({selectedSentBack.size})
                </Button>
                <div className="h-6 w-px bg-border mx-1" />
                <Button size="sm" variant="outline" onClick={handleExportRollback} disabled={autoScoredKpis.length === 0 && penalizedKpis.length === 0}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Export Excel
                </Button>
                <Button size="sm" variant="secondary" onClick={handleSendReminderAll} disabled={sentBackKpis.length === 0 || sendReminder.isPending}>
                  Send Reminder All ({sentBackKpis.length})
                </Button>
                <div className="h-6 w-px bg-border mx-1" />
                <Button size="sm" variant="outline" onClick={handleExportSentBack} disabled={sentBackKpis.length === 0}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Export Excel
                </Button>
              </div>

              {sentBackLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : sentBackKpis.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No sent-back KPIs found.</p>
              ) : (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={selectedSentBack.size === sentBackKpis.length && sentBackKpis.length > 0}
                            onCheckedChange={() => toggleAll(sentBackKpis, selectedSentBack, setSelectedSentBack)}
                          />
                        </TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>KPI</TableHead>
                        <TableHead>Current Status</TableHead>
                        <TableHead>Sent Back By</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sentBackKpis.map(item => {
                        const statusLabel: Record<string, string> = {
                          kra_set: 'With Employee',
                          self_review: 'With Manager',
                          manager_check: 'With Skip-Level',
                          skip_level_check: 'With Skip-Level',
                          audit: 'With Auditor',
                          management_review: 'With Management',
                        };
                        return (
                        <TableRow key={item.kpiId}>
                          <TableCell>
                            <Checkbox
                              checked={selectedSentBack.has(item.kpiId)}
                              onCheckedChange={() => toggleSelection(selectedSentBack, setSelectedSentBack, item.kpiId)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{item.employeeName}</TableCell>
                          <TableCell>{item.employeeCode}</TableCell>
                          <TableCell>{item.departmentName}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5 flex-wrap">
                              {item.kpiName}
                              {item.frequency === 'Bi-Monthly' && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-violet-300 text-violet-700">Bi-Monthly</Badge>}
                              {item.frequency === 'Quarterly' && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-teal-300 text-teal-700">Quarterly</Badge>}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{statusLabel[item.currentStatus] || item.currentStatus}</Badge>
                          </TableCell>
                          <TableCell>{item.sentBackBy}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{item.reason}</TableCell>
                          <TableCell>{format(new Date(item.sentBackDate), 'dd MMM yyyy')}</TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Rollback */}
        <TabsContent value="rollback" className="space-y-6">
          {/* Auto-Scored Rollback */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <RotateCcw className="h-4 w-4" />
                Auto-Scored KPIs ({autoScoredKpis.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={handleRollbackAutoScoreSelected} disabled={selectedAutoScored.size === 0 || rollbackAutoScore.isPending}>
                  {rollbackAutoScore.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Rollback Selected ({selectedAutoScored.size})
                </Button>
                <Button size="sm" variant="destructive" onClick={handleRollbackAutoScoreAll} disabled={autoScoredKpis.length === 0 || rollbackAutoScore.isPending}>
                  Rollback All ({autoScoredKpis.length})
                </Button>
              </div>

              {autoScoredLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : autoScoredKpis.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No auto-scored KPIs available for rollback.</p>
              ) : (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={selectedAutoScored.size === autoScoredKpis.length && autoScoredKpis.length > 0}
                            onCheckedChange={() => toggleAll(autoScoredKpis, selectedAutoScored, setSelectedAutoScored)}
                          />
                        </TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>KPI</TableHead>
                        <TableHead>KRA</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Scored At</TableHead>
                        <TableHead>Scored By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {autoScoredKpis.map(item => (
                        <TableRow key={item.kpiId}>
                          <TableCell>
                            <Checkbox
                              checked={selectedAutoScored.has(item.kpiId)}
                              onCheckedChange={() => toggleSelection(selectedAutoScored, setSelectedAutoScored, item.kpiId)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{item.employeeName}</TableCell>
                          <TableCell>{item.employeeCode}</TableCell>
                          <TableCell>{item.departmentName}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5 flex-wrap">
                              {item.kpiName}
                              {item.frequency === 'Bi-Monthly' && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-violet-300 text-violet-700">Bi-Monthly</Badge>}
                              {item.frequency === 'Quarterly' && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-teal-300 text-teal-700">Quarterly</Badge>}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">{item.kraName}</TableCell>
                          <TableCell>{item.reviewPeriod} {item.reviewYear}</TableCell>
                          <TableCell>{format(new Date(item.scoredAt), 'dd MMM yyyy HH:mm')}</TableCell>
                          <TableCell>{item.scoredBy}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Manager Penalty Rollback */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <RotateCcw className="h-4 w-4" />
                Manager Penalty KPIs ({penalizedKpis.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={handleRollbackPenaltySelected} disabled={selectedPenalized.size === 0 || rollbackManagerPenalty.isPending}>
                  {rollbackManagerPenalty.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Rollback Selected ({selectedPenalized.size})
                </Button>
                <Button size="sm" variant="destructive" onClick={handleRollbackPenaltyAll} disabled={penalizedKpis.length === 0 || rollbackManagerPenalty.isPending}>
                  Rollback All ({penalizedKpis.length})
                </Button>
              </div>

              {penalizedLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : penalizedKpis.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No penalized manager KPIs available for rollback.</p>
              ) : (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={selectedPenalized.size === penalizedKpis.length && penalizedKpis.length > 0}
                            onCheckedChange={() => toggleAll(penalizedKpis, selectedPenalized, setSelectedPenalized)}
                          />
                        </TableHead>
                        <TableHead>Manager</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>KPI</TableHead>
                        <TableHead>KRA</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Previous Status</TableHead>
                        <TableHead>Scored At</TableHead>
                        <TableHead>Scored By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {penalizedKpis.map(item => (
                        <TableRow key={item.kpiId}>
                          <TableCell>
                            <Checkbox
                              checked={selectedPenalized.has(item.kpiId)}
                              onCheckedChange={() => toggleSelection(selectedPenalized, setSelectedPenalized, item.kpiId)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{item.managerName}</TableCell>
                          <TableCell>{item.managerCode}</TableCell>
                          <TableCell>{item.departmentName}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5 flex-wrap">
                              {item.kpiName}
                              {item.frequency === 'Bi-Monthly' && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-violet-300 text-violet-700">Bi-Monthly</Badge>}
                              {item.frequency === 'Quarterly' && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-teal-300 text-teal-700">Quarterly</Badge>}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">{item.kraName}</TableCell>
                          <TableCell>{item.reviewPeriod} {item.reviewYear}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{item.oldStatus.replace(/_/g, ' ')}</Badge>
                          </TableCell>
                          <TableCell>{format(new Date(item.scoredAt), 'dd MMM yyyy HH:mm')}</TableCell>
                          <TableCell>{item.scoredBy}</TableCell>
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
