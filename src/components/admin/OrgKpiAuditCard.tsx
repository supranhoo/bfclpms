import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Check, CheckCheck, Users, AlertCircle, Target, Building2, FileText, Paperclip, User } from 'lucide-react';
import { OrgKpiAuditGroup, OrgKpiAuditEmployee } from '@/hooks/useOrgKpiAuditReview';
import { openStorageFile, buildEvidenceFileName } from '@/lib/storageDownload';

interface OrgKpiAuditCardProps {
  group: OrgKpiAuditGroup;
  onSubmitScore: (kpiId: string, score: number, remarks: string, approve: boolean, workflowStages: string[]) => Promise<void>;
  onBulkApprove: (employees: OrgKpiAuditEmployee[], score: number, remarks: string) => Promise<void>;
  isSubmitting: boolean;
}

export function OrgKpiAuditCard({ group, onSubmitScore, onBulkApprove, isSubmitting }: OrgKpiAuditCardProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [bulkScore, setBulkScore] = useState('');
  const [bulkRemarks, setBulkRemarks] = useState('');
  const [fillValue, setFillValue] = useState('');
  const [submittingKpiId, setSubmittingKpiId] = useState<string | null>(null);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  const pendingEmployees = useMemo(
    () => group.employees.filter(e => e.isAuditPending),
    [group.employees]
  );

  // Group employees by department
  const employeesByDept = useMemo(() => {
    const map = new Map<string, OrgKpiAuditEmployee[]>();
    group.employees.forEach(emp => {
      const dept = emp.departmentName || 'Unassigned';
      const arr = map.get(dept) || [];
      arr.push(emp);
      map.set(dept, arr);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [group.employees]);

  // Consistency check
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

  const handleFillAll = () => {
    const val = fillValue.trim();
    if (!val) return;
    const newScores: Record<string, string> = { ...scores };
    pendingEmployees.forEach(emp => {
      newScores[emp.kpiId] = val;
    });
    setScores(newScores);
  };

  const handleFillEmpty = () => {
    const val = fillValue.trim();
    if (!val) return;
    const newScores: Record<string, string> = { ...scores };
    pendingEmployees.forEach(emp => {
      if (!newScores[emp.kpiId]) {
        newScores[emp.kpiId] = val;
      }
    });
    setScores(newScores);
  };

  // Parse criteria for description/formula/scoring
  const criteriaLines = useMemo(() => {
    if (!group.criteria) return { description: null, formula: null, scoring: null };
    const text = group.criteria;
    const lines = text.split('\n').filter(Boolean);
    let description: string | null = null;
    let formula: string | null = null;
    let scoring: string | null = null;
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.startsWith('description:') || lower.startsWith('desc:')) {
        description = line.substring(line.indexOf(':') + 1).trim();
      } else if (lower.startsWith('formula:')) {
        formula = line.substring(line.indexOf(':') + 1).trim();
      } else if (lower.startsWith('scoring') || lower.startsWith('rating')) {
        scoring = line.substring(line.indexOf(':') + 1).trim();
      }
    }
    if (!description && !formula && !scoring) {
      description = text;
    }
    return { description, formula, scoring };
  }, [group.criteria]);

  return (
    <Card className="border-l-4" style={{ borderLeftColor: group.categoryColor }}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <div className="cursor-pointer hover:bg-muted/30 transition-colors p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0 flex-1">
                {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 mt-1 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 mt-1 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-foreground leading-snug">{group.kpiName}</h3>
                  {criteriaLines.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{criteriaLines.description}</p>
                  )}
                  {criteriaLines.formula && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="font-medium text-foreground/70">Formula:</span> {criteriaLines.formula}
                    </p>
                  )}
                  {criteriaLines.scoring && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="font-medium text-foreground/70">Scoring:</span> {criteriaLines.scoring}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">
                      <span className="font-medium">KRA:</span> {group.kraName}
                    </span>
                    {group.targetValue !== null && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Target className="h-3 w-3" /> Target: {group.targetValue} {group.uom || ''}
                      </span>
                    )}
                    {group.achievedValue !== null && (
                      <Badge variant="outline" className="text-xs h-5">
                        Achieved: {group.achievedValue} {group.uom || ''}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs h-5">
                      {group.categoryName}
                    </Badge>
                  </div>
                  {/* Data entry details */}
                  {(group.dataEntryRemarks || group.enteredByName || group.dataSource || group.evidenceUrl || group.evidenceUrls?.length) && (
                    <div className="mt-2 p-2 rounded bg-muted/40 border border-border/50 space-y-1">
                      <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                        {group.enteredByName && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span className="font-medium">Entered by:</span> {group.enteredByName}
                          </span>
                        )}
                        {group.dataSource && (
                          <span>
                            <span className="font-medium">Source:</span> {group.dataSource}
                          </span>
                        )}
                      </div>
                      {group.dataEntryRemarks && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium">Remarks:</span> {group.dataEntryRemarks}
                        </p>
                      )}
                      {/* Attachments */}
                      {(() => {
                        const urls: string[] = [];
                        if (group.evidenceUrls?.length) {
                          urls.push(...(group.evidenceUrls as string[]));
                        } else if (group.evidenceUrl) {
                          urls.push(group.evidenceUrl);
                        }
                        if (urls.length === 0) return null;
                        return (
                          <div className="flex items-center gap-2 flex-wrap">
                            <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                            {urls.map((url, i) => {
                              const filename = url.split('/').pop() || `File ${i + 1}`;
                              return (
                                <button
                                  key={i}
                                  className="text-xs text-primary hover:underline flex items-center gap-0.5"
                                  onClick={(e) => { e.stopPropagation(); openStorageFile(url, buildEvidenceFileName(url, group.kpiTitle, 'Org_KPI', i, urls.length)); }}
                                >
                                  <FileText className="h-3 w-3" />
                                  {filename.length > 25 ? filename.slice(0, 22) + '...' : filename}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
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
                  <span className="text-muted-foreground">{group.auditedCount}/{group.totalCount}</span>
                </div>
                {group.pendingCount > 0 ? (
                  <Badge variant="destructive" className="text-xs">{group.pendingCount} pending</Badge>
                ) : group.totalCount > 0 ? (
                  <Badge className="bg-emerald-500 text-white text-xs">
                    <CheckCheck className="h-3 w-3 mr-1" />Complete
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 px-4 pb-4">
            {/* Fill controls */}
            {pendingEmployees.length > 0 && (
              <div className="flex items-center gap-2 mb-3 text-xs">
                <span className="text-muted-foreground font-medium">
                  {group.employees.length} Employees ({group.auditedCount}/{group.totalCount} audited)
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="text-muted-foreground">Fill score:</span>
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    step={0.1}
                    className="w-14 h-6 text-xs text-center"
                    value={fillValue}
                    onChange={(e) => setFillValue(e.target.value)}
                    placeholder="0-5"
                  />
                  <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={handleFillAll} disabled={!fillValue}>
                    Fill all
                  </Button>
                  <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={handleFillEmpty} disabled={!fillValue}>
                    Fill empty
                  </Button>
                </div>
              </div>
            )}

            {/* Employee table grouped by department */}
            <div className="overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-1.5 px-1.5 font-medium">Employee</th>
                    <th className="text-left py-1.5 px-1.5 font-medium">Code</th>
                    <th className="text-center py-1.5 px-0.5 font-medium">Self</th>
                    <th className="text-center py-1.5 px-0.5 font-medium">Mgr</th>
                    <th className="text-center py-1.5 px-0.5 font-medium">Auditor</th>
                    <th className="text-left py-1.5 px-1.5 font-medium min-w-[200px]">Remarks</th>
                    <th className="text-center py-1.5 px-0.5 font-medium">Status</th>
                    <th className="text-center py-1.5 px-0.5 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {employeesByDept.map(([deptName, deptEmployees]) => (
                    <DepartmentGroup
                      key={deptName}
                      deptName={deptName}
                      employees={deptEmployees}
                      scores={scores}
                      remarks={remarks}
                      isSubmitting={isSubmitting}
                      submittingKpiId={submittingKpiId}
                      onScoreChange={(kpiId, val) => setScores(prev => ({ ...prev, [kpiId]: val }))}
                      onRemarkChange={(kpiId, val) => setRemarks(prev => ({ ...prev, [kpiId]: val }))}
                      onSubmit={handleSubmit}
                    />
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

// Sub-component for department grouping
function DepartmentGroup({
  deptName,
  employees,
  scores,
  remarks,
  isSubmitting,
  submittingKpiId,
  onScoreChange,
  onRemarkChange,
  onSubmit,
}: {
  deptName: string;
  employees: OrgKpiAuditEmployee[];
  scores: Record<string, string>;
  remarks: Record<string, string>;
  isSubmitting: boolean;
  submittingKpiId: string | null;
  onScoreChange: (kpiId: string, val: string) => void;
  onRemarkChange: (kpiId: string, val: string) => void;
  onSubmit: (emp: OrgKpiAuditEmployee, approve: boolean) => Promise<void>;
}) {
  return (
    <>
      {/* Department header row */}
      <tr className="bg-muted/40">
        <td colSpan={8} className="py-1 px-1.5 text-xs font-medium text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3 w-3" />
            {deptName}
            <span className="text-muted-foreground/60">({employees.length})</span>
          </div>
        </td>
      </tr>
      {employees.map(emp => (
        <tr key={emp.kpiId} className="border-b last:border-0 hover:bg-muted/20">
          <td className="py-1.5 px-1.5 max-w-[160px]">
            <div className="truncate text-sm font-medium">{emp.employeeName}</div>
            {emp.designationName && (
              <div className="text-[10px] text-muted-foreground truncate">{emp.designationName}</div>
            )}
          </td>
          <td className="py-1.5 px-1.5 text-muted-foreground text-xs font-mono">{emp.employeeCode || '-'}</td>
          <td className="py-1.5 px-0.5 text-center text-xs">{emp.selfScore?.toFixed(1) ?? '-'}</td>
          <td className="py-1.5 px-0.5 text-center text-xs">{emp.managerScore?.toFixed(1) ?? '-'}</td>
          <td className="py-1.5 px-0.5 text-center">
            {emp.isAuditPending ? (
              <Input
                type="number"
                min={0}
                max={5}
                step={0.1}
                className="w-14 h-7 text-center mx-auto text-xs"
                placeholder="0-5"
                value={scores[emp.kpiId] || ''}
                onChange={(e) => onScoreChange(emp.kpiId, e.target.value)}
                disabled={isSubmitting}
              />
            ) : (
              <span className="font-medium text-xs">{emp.auditorScore?.toFixed(1) ?? '-'}</span>
            )}
          </td>
          <td className="py-1.5 px-1.5 min-w-[200px]">
            {emp.isAuditPending ? (
              <Input
                className="h-7 text-xs"
                placeholder="Remarks..."
                value={remarks[emp.kpiId] || ''}
                onChange={(e) => onRemarkChange(emp.kpiId, e.target.value)}
                disabled={isSubmitting}
              />
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs text-muted-foreground line-clamp-2 block">{emp.auditorRemarks || '-'}</span>
                </TooltipTrigger>
                {emp.auditorRemarks && (
                  <TooltipContent className="max-w-xs">{emp.auditorRemarks}</TooltipContent>
                )}
              </Tooltip>
            )}
          </td>
          <td className="py-1.5 px-0.5 text-center">
            {emp.isAudited ? (
              <Badge className="bg-emerald-500/10 text-emerald-600 text-xs"><Check className="h-3 w-3" /></Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-amber-600">Pending</Badge>
            )}
          </td>
          <td className="py-1.5 px-0.5 text-center">
            {emp.isAuditPending && (
              <div className="flex gap-1 justify-center">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px] px-1.5"
                  onClick={() => onSubmit(emp, false)}
                  disabled={!scores[emp.kpiId] || isSubmitting || submittingKpiId === emp.kpiId}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  className="h-6 text-[10px] px-1.5"
                  onClick={() => onSubmit(emp, true)}
                  disabled={!scores[emp.kpiId] || isSubmitting || submittingKpiId === emp.kpiId}
                >
                  Approve
                </Button>
              </div>
            )}
          </td>
        </tr>
      ))}
    </>
  );
}
