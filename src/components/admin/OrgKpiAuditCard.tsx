import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Check, CheckCheck, Users, AlertCircle } from 'lucide-react';
import { OrgKpiAuditGroup, OrgKpiAuditEmployee } from '@/hooks/useOrgKpiAuditReview';

interface OrgKpiAuditCardProps {
  group: OrgKpiAuditGroup;
  onSubmitScore: (kpiId: string, score: number, remarks: string, approve: boolean, workflowStages: string[]) => Promise<void>;
  onBulkApprove: (employees: OrgKpiAuditEmployee[], score: number, remarks: string) => Promise<void>;
  isSubmitting: boolean;
}

export function OrgKpiAuditCard({ group, onSubmitScore, onBulkApprove, isSubmitting }: OrgKpiAuditCardProps) {
  const [isOpen, setIsOpen] = useState(group.pendingCount > 0);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [bulkScore, setBulkScore] = useState('');
  const [bulkRemarks, setBulkRemarks] = useState('');
  const [submittingKpiId, setSubmittingKpiId] = useState<string | null>(null);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  const pendingEmployees = useMemo(
    () => group.employees.filter(e => e.isAuditPending),
    [group.employees]
  );

  // Consistency check: all scores the same?
  const auditorScores = group.employees
    .filter(e => e.auditorScore !== null)
    .map(e => e.auditorScore!);
  const isConsistent = auditorScores.length > 1 && auditorScores.every(s => s === auditorScores[0]);

  const handleSubmit = async (emp: OrgKpiAuditEmployee, approve: boolean) => {
    const scoreVal = parseFloat(scores[emp.kpiId] || '');
    if (isNaN(scoreVal) || scoreVal < 0 || scoreVal > 5) return;
    setSubmittingKpiId(emp.kpiId);
    try {
      await onSubmitScore(emp.kpiId, scoreVal, remarks[emp.kpiId] || '', approve, emp.workflowStages);
      setScores(prev => { const n = { ...prev }; delete n[emp.kpiId]; return n; });
      setRemarks(prev => { const n = { ...prev }; delete n[emp.kpiId]; return n; });
    } finally {
      setSubmittingKpiId(null);
    }
  };

  const handleBulkApprove = async () => {
    const scoreVal = parseFloat(bulkScore);
    if (isNaN(scoreVal) || scoreVal < 0 || scoreVal > 5 || pendingEmployees.length === 0) return;
    setIsBulkSubmitting(true);
    try {
      await onBulkApprove(pendingEmployees, scoreVal, bulkRemarks);
      setBulkScore('');
      setBulkRemarks('');
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  return (
    <Card className="border-l-4" style={{ borderLeftColor: group.categoryColor }}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <div className="min-w-0">
                  <CardTitle className="text-sm font-medium truncate">{group.kraName}</CardTitle>
                  <p className="text-xs text-muted-foreground truncate">{group.kpiName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {group.achievedValue !== null && (
                  <Badge variant="outline" className="text-xs">
                    Achieved: {group.achievedValue} {group.uom || ''}
                  </Badge>
                )}
                {group.targetValue !== null && (
                  <Badge variant="secondary" className="text-xs">
                    Target: {group.targetValue}
                  </Badge>
                )}
                {isConsistent && auditorScores.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge className="bg-emerald-500/10 text-emerald-600 text-xs">
                        <Check className="h-3 w-3 mr-1" />Consistent
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>All auditor scores are identical ({auditorScores[0]})</TooltipContent>
                  </Tooltip>
                )}
                <div className="flex items-center gap-1 text-xs">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {group.auditedCount}/{group.totalCount}
                  </span>
                </div>
                {group.pendingCount > 0 && (
                  <Badge variant="destructive" className="text-xs">{group.pendingCount} pending</Badge>
                )}
                {group.pendingCount === 0 && group.totalCount > 0 && (
                  <Badge className="bg-emerald-500 text-white text-xs">
                    <CheckCheck className="h-3 w-3 mr-1" />Complete
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 px-4 pb-4">
            {/* Employee grid */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">Employee</th>
                    <th className="text-left py-2 px-2 font-medium">Code</th>
                    <th className="text-center py-2 px-1 font-medium">Self</th>
                    <th className="text-center py-2 px-1 font-medium">Manager</th>
                    <th className="text-center py-2 px-1 font-medium">Auditor Score</th>
                    <th className="text-left py-2 px-2 font-medium">Remarks</th>
                    <th className="text-center py-2 px-1 font-medium">Status</th>
                    <th className="text-center py-2 px-1 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {group.employees.map(emp => (
                    <tr key={emp.kpiId} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="py-2 px-2 truncate max-w-[160px]">{emp.employeeName}</td>
                      <td className="py-2 px-2 text-muted-foreground text-xs">{emp.employeeCode}</td>
                      <td className="py-2 px-1 text-center">{emp.selfScore?.toFixed(1) ?? '-'}</td>
                      <td className="py-2 px-1 text-center">{emp.managerScore?.toFixed(1) ?? '-'}</td>
                      <td className="py-2 px-1 text-center">
                        {emp.isAuditPending ? (
                          <Input
                            type="number"
                            min={0}
                            max={5}
                            step={0.1}
                            className="w-16 h-7 text-center mx-auto"
                            placeholder="0-5"
                            value={scores[emp.kpiId] || ''}
                            onChange={(e) => setScores(prev => ({ ...prev, [emp.kpiId]: e.target.value }))}
                            disabled={isSubmitting}
                          />
                        ) : (
                          <span className="font-medium">{emp.auditorScore?.toFixed(1) ?? '-'}</span>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {emp.isAuditPending ? (
                          <Input
                            className="h-7 text-xs"
                            placeholder="Remarks..."
                            value={remarks[emp.kpiId] || ''}
                            onChange={(e) => setRemarks(prev => ({ ...prev, [emp.kpiId]: e.target.value }))}
                            disabled={isSubmitting}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">{emp.auditorRemarks || '-'}</span>
                        )}
                      </td>
                      <td className="py-2 px-1 text-center">
                        {emp.isAudited ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 text-xs"><Check className="h-3 w-3" /></Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-amber-600">Pending</Badge>
                        )}
                      </td>
                      <td className="py-2 px-1 text-center">
                        {emp.isAuditPending && (
                          <div className="flex gap-1 justify-center">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => handleSubmit(emp, false)}
                              disabled={!scores[emp.kpiId] || isSubmitting || submittingKpiId === emp.kpiId}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleSubmit(emp, true)}
                              disabled={!scores[emp.kpiId] || isSubmitting || submittingKpiId === emp.kpiId}
                            >
                              Approve
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bulk approve section */}
            {pendingEmployees.length > 1 && (
              <div className="mt-4 p-3 rounded-lg border border-dashed border-primary/30 bg-primary/5">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Bulk Approve ({pendingEmployees.length} pending)</span>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Score:</span>
                    <Input
                      type="number"
                      min={0}
                      max={5}
                      step={0.1}
                      className="w-20 h-8"
                      placeholder="0-5"
                      value={bulkScore}
                      onChange={(e) => setBulkScore(e.target.value)}
                      disabled={isBulkSubmitting}
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <span className="text-xs text-muted-foreground">Remarks:</span>
                    <Input
                      className="h-8 text-xs flex-1"
                      placeholder="Bulk remarks..."
                      value={bulkRemarks}
                      onChange={(e) => setBulkRemarks(e.target.value)}
                      disabled={isBulkSubmitting}
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={handleBulkApprove}
                    disabled={!bulkScore || isBulkSubmitting}
                  >
                    <CheckCheck className="h-4 w-4 mr-1" />
                    Approve All
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
