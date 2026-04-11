import { useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Download, RotateCcw, ShieldAlert, Settings } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdateSystemSetting } from '@/hooks/useSystemSettings';
import { useToast } from '@/hooks/use-toast';
import {
  useCompliancePenaltySettings,
  useNonCompliantEmployees,
  useBulkCompliancePenalty,
  useCompliancePenalizedKpis,
  useRollbackCompliancePenalty,
  NonCompliantEmployee,
  CompliancePenalizedKpi,
} from '@/hooks/useCompliancePenalty';

interface CompliancePenaltyTabProps {
  selectedMonth: string;
  selectedYear: number;
}

export function CompliancePenaltyTab({ selectedMonth, selectedYear }: CompliancePenaltyTabProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const settings = useCompliancePenaltySettings();
  const updateSetting = useUpdateSystemSetting();

  const { data: nonCompliant = [], isLoading: scanLoading } = useNonCompliantEmployees(
    selectedMonth, selectedYear, settings.exclusions
  );
  const { data: penalizedKpis = [], isLoading: penalizedLoading } = useCompliancePenalizedKpis(
    selectedMonth, selectedYear
  );

  const bulkPenalty = useBulkCompliancePenalty();
  const rollback = useRollbackCompliancePenalty();

  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [selectedRollback, setSelectedRollback] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Edit state for settings
  const [editEnabled, setEditEnabled] = useState(settings.enabled);
  const [editDeadline, setEditDeadline] = useState(String(settings.deadlineDay));
  const [editRemark, setEditRemark] = useState(settings.remark);
  const [editExclusions, setEditExclusions] = useState(settings.exclusions);

  const readyEmployees = nonCompliant.filter(e => e.status === 'ready');

  const handleOpenSettings = () => {
    setEditEnabled(settings.enabled);
    setEditDeadline(String(settings.deadlineDay));
    setEditRemark(settings.remark);
    setEditExclusions({ ...settings.exclusions });
    setSettingsOpen(true);
  };

  const handleSaveSettings = async () => {
    try {
      await Promise.all([
        updateSetting.mutateAsync({ key: 'compliance_penalty_enabled', value: String(editEnabled) }),
        updateSetting.mutateAsync({ key: 'compliance_penalty_deadline_day', value: editDeadline }),
        updateSetting.mutateAsync({ key: 'compliance_penalty_auto_remark', value: editRemark }),
        updateSetting.mutateAsync({ key: 'compliance_exclude_org_kpi', value: String(editExclusions.excludeOrgKpi) }),
        updateSetting.mutateAsync({ key: 'compliance_exclude_sent_back', value: String(editExclusions.excludeSentBack) }),
        updateSetting.mutateAsync({ key: 'compliance_exclude_quarterly_not_due', value: String(editExclusions.excludeQuarterlyNotDue) }),
        updateSetting.mutateAsync({ key: 'compliance_exclude_bimonthly_not_due', value: String(editExclusions.excludeBimonthlyNotDue) }),
        updateSetting.mutateAsync({ key: 'compliance_exclude_halfyearly_not_due', value: String(editExclusions.excludeHalfyearlyNotDue) }),
        updateSetting.mutateAsync({ key: 'compliance_exclude_yearly_not_due', value: String(editExclusions.excludeYearlyNotDue) }),
      ]);
      toast({ title: 'Compliance Penalty Settings Saved' });
      setSettingsOpen(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handlePenalizeSelected = () => {
    if (!user?.id || selectedEmployees.size === 0) return;
    const items = readyEmployees.filter(e => selectedEmployees.has(e.employeeId));
    bulkPenalty.mutate({
      employees: items,
      remark: settings.remark,
      adminId: user.id,
      reviewPeriod: selectedMonth,
      reviewYear: selectedYear,
    });
    setSelectedEmployees(new Set());
  };

  const handlePenalizeAll = () => {
    if (!user?.id || readyEmployees.length === 0) return;
    bulkPenalty.mutate({
      employees: readyEmployees,
      remark: settings.remark,
      adminId: user.id,
      reviewPeriod: selectedMonth,
      reviewYear: selectedYear,
    });
    setSelectedEmployees(new Set());
  };

  const handleRollbackSelected = () => {
    if (!user?.id || selectedRollback.size === 0) return;
    const items = penalizedKpis.filter(k => selectedRollback.has(k.kpiId));
    rollback.mutate({ items, adminId: user.id });
    setSelectedRollback(new Set());
  };

  const handleRollbackAll = () => {
    if (!user?.id || penalizedKpis.length === 0) return;
    rollback.mutate({ items: penalizedKpis, adminId: user.id });
    setSelectedRollback(new Set());
  };

  const toggleEmployeeSelection = (id: string) => {
    const next = new Set(selectedEmployees);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedEmployees(next);
  };

  const toggleRollbackSelection = (id: string) => {
    const next = new Set(selectedRollback);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedRollback(next);
  };

  const handleExportNonCompliant = () => {
    if (nonCompliant.length === 0) return;
    const rows = nonCompliant.map(e => ({
      'Employee': e.employeeName,
      'Code': e.employeeCode,
      'Department': e.departmentName,
      'Pending KPIs': e.pendingKpiCount,
      'Status': e.status === 'ready' ? 'Ready' : e.status === 'penalized' ? 'Penalized' : 'No Compliance KPI',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 25 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Compliance Penalty');
    XLSX.writeFile(wb, `Compliance_Penalty_${selectedMonth}_${selectedYear}.xlsx`);
  };

  const statusBadge = (status: NonCompliantEmployee['status']) => {
    if (status === 'ready') return <Badge variant="outline" className="text-orange-700 border-orange-300">Ready</Badge>;
    if (status === 'penalized') return <Badge variant="outline" className="text-red-700 border-red-300">Penalized</Badge>;
    return <Badge variant="outline" className="text-muted-foreground">No Compliance KPI</Badge>;
  };

  if (settings.isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Settings Card */}
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => settingsOpen ? setSettingsOpen(false) : handleOpenSettings()}>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4" />
            Compliance Penalty Settings
            <Badge variant={settings.enabled ? 'default' : 'secondary'} className="ml-2">
              {settings.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
            <Badge variant="outline" className="ml-1">Deadline: {settings.deadlineDay}th</Badge>
          </CardTitle>
        </CardHeader>
        {settingsOpen && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={editEnabled} onCheckedChange={setEditEnabled} />
                <Label>Enable Compliance Penalty</Label>
              </div>
              <div className="space-y-1.5">
                <Label>Deadline Day (of following month)</Label>
                <Input type="number" min={1} max={28} value={editDeadline} onChange={e => setEditDeadline(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>System Remark</Label>
                <Input value={editRemark} onChange={e => setEditRemark(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-semibold">Exclusions</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {([
                  { key: 'excludeOrgKpi' as const, label: 'Exclude Org-level KPIs' },
                  { key: 'excludeSentBack' as const, label: 'Exclude Sent-back KPIs' },
                  { key: 'excludeQuarterlyNotDue' as const, label: 'Exclude Quarterly KPIs (not due)' },
                  { key: 'excludeBimonthlyNotDue' as const, label: 'Exclude Bi-Monthly KPIs (not due)' },
                  { key: 'excludeHalfyearlyNotDue' as const, label: 'Exclude Half-Yearly KPIs (not due)' },
                  { key: 'excludeYearlyNotDue' as const, label: 'Exclude Yearly KPIs (not due)' },
                ]).map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <Checkbox
                      checked={editExclusions[key]}
                      onCheckedChange={(v) => setEditExclusions(prev => ({ ...prev, [key]: !!v }))}
                    />
                    <Label className="text-sm">{label}</Label>
                  </div>
                ))}
              </div>
            </div>

            <Button size="sm" onClick={handleSaveSettings} disabled={updateSetting.isPending}>
              {updateSetting.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save Settings
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Non-Compliant Employees */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            Non-Compliant Employees ({nonCompliant.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap items-center">
            <Button size="sm" onClick={handlePenalizeSelected} disabled={selectedEmployees.size === 0 || bulkPenalty.isPending}>
              {bulkPenalty.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Penalize Selected ({selectedEmployees.size})
            </Button>
            <Button size="sm" variant="destructive" onClick={handlePenalizeAll} disabled={readyEmployees.length === 0 || bulkPenalty.isPending}>
              Penalize All ({readyEmployees.length})
            </Button>
            <div className="h-6 w-px bg-border mx-1" />
            <Button size="sm" variant="outline" onClick={handleExportNonCompliant} disabled={nonCompliant.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1" />
              Export Excel
            </Button>
          </div>

          {scanLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : nonCompliant.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No non-compliant employees found for {selectedMonth} {selectedYear}.</p>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedEmployees.size === readyEmployees.length && readyEmployees.length > 0}
                        onCheckedChange={() => {
                          if (selectedEmployees.size === readyEmployees.length) {
                            setSelectedEmployees(new Set());
                          } else {
                            setSelectedEmployees(new Set(readyEmployees.map(e => e.employeeId)));
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Pending KPIs</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nonCompliant.map(emp => (
                    <TableRow key={emp.employeeId}>
                      <TableCell>
                        <Checkbox
                          checked={selectedEmployees.has(emp.employeeId)}
                          disabled={emp.status !== 'ready'}
                          onCheckedChange={() => toggleEmployeeSelection(emp.employeeId)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{emp.employeeName}</TableCell>
                      <TableCell>{emp.employeeCode}</TableCell>
                      <TableCell>{emp.departmentName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{emp.pendingKpiCount} KPI{emp.pendingKpiCount !== 1 ? 's' : ''}</Badge>
                      </TableCell>
                      <TableCell>{statusBadge(emp.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rollback Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            Compliance Penalty Rollback ({penalizedKpis.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={handleRollbackSelected} disabled={selectedRollback.size === 0 || rollback.isPending}>
              {rollback.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Rollback Selected ({selectedRollback.size})
            </Button>
            <Button size="sm" variant="destructive" onClick={handleRollbackAll} disabled={penalizedKpis.length === 0 || rollback.isPending}>
              Rollback All ({penalizedKpis.length})
            </Button>
          </div>

          {penalizedLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : penalizedKpis.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No compliance-penalized KPIs available for rollback.</p>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedRollback.size === penalizedKpis.length && penalizedKpis.length > 0}
                        onCheckedChange={() => {
                          if (selectedRollback.size === penalizedKpis.length) {
                            setSelectedRollback(new Set());
                          } else {
                            setSelectedRollback(new Set(penalizedKpis.map(k => k.kpiId)));
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>KPI</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Previous Status</TableHead>
                    <TableHead>Scored At</TableHead>
                    <TableHead>Scored By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {penalizedKpis.map(item => (
                    <TableRow key={`${item.kpiId}-${item.auditLogId}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedRollback.has(item.kpiId)}
                          onCheckedChange={() => toggleRollbackSelection(item.kpiId)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{item.employeeName}</TableCell>
                      <TableCell>{item.employeeCode}</TableCell>
                      <TableCell>{item.departmentName}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{item.kpiName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {item.penaltyType === 'compliance_kpi_zero' ? 'Compliance KPI' : 'Pending KPI'}
                        </Badge>
                      </TableCell>
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
    </div>
  );
}
