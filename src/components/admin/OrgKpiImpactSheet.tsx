import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Users, TrendingUp, TrendingDown, Minus, Building2 } from 'lucide-react';
import { useOrgKpiImpact } from '@/hooks/useOrgKpiImpact';
import { Loader2 } from 'lucide-react';

interface OrgKpiImpactSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  kraName: string;
  kpiName: string;
  reviewPeriod: string;
  reviewYear: number;
  currentAchievedValue?: number | null;
  /**
   * Canonical employee ids for this KPI (from the card's `mappedEmpIdsByKey`).
   * When provided, the Impact sheet:
   *   - intersects its query with this set, and
   *   - displays its length as "Total Affected" so the sheet can never
   *     disagree with the card badge (ADR-064 addendum).
   */
  expectedEmployeeIds?: string[];
}

export function OrgKpiImpactSheet({
  open,
  onOpenChange,
  categoryId,
  kraName,
  kpiName,
  reviewPeriod,
  reviewYear,
  currentAchievedValue,
  expectedEmployeeIds,
}: OrgKpiImpactSheetProps) {
  const [simulatedValue, setSimulatedValue] = useState<number | null>(currentAchievedValue ?? null);

  const { data: impact, isLoading } = useOrgKpiImpact(
    categoryId, kraName, kpiName, reviewPeriod, reviewYear,
    simulatedValue,
    open,
    expectedEmployeeIds,
  );

  const expectedCount = expectedEmployeeIds?.length ?? null;
  const displayedTotal = expectedCount ?? impact?.totalEmployees ?? 0;
  const hiddenCount = expectedCount !== null && impact
    ? Math.max(0, expectedCount - impact.employees.length)
    : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Impact Analysis
          </SheetTitle>
          <SheetDescription>
            <span className="font-medium">{kpiName}</span> — {kraName}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Simulate Value */}
          <div className="space-y-2">
            <Label>Simulate Achieved Value</Label>
            <Input
              type="number"
              value={simulatedValue ?? ''}
              onChange={(e) => setSimulatedValue(e.target.value === '' ? null : parseFloat(e.target.value))}
              placeholder="Enter a value to simulate score impact"
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !impact ? null : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      <span className="text-sm text-muted-foreground">Total Affected</span>
                    </div>
                    <p className="text-2xl font-bold mt-1">{impact.totalEmployees}</p>
                    {hiddenCount > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {hiddenCount} hidden by access policy
                      </p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      <span className="text-sm text-muted-foreground">Departments</span>
                    </div>
                    <p className="text-2xl font-bold mt-1">{Object.keys(impact.byDepartment).length}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Score Change Summary (only when simulating) */}
              {simulatedValue !== null && (
                <div className="flex gap-3">
                  <Badge variant="outline" className="gap-1 text-primary border-primary/30">
                    <TrendingUp className="h-3 w-3" />
                    {impact.increased} improved
                  </Badge>
                  <Badge variant="outline" className="gap-1 text-destructive border-destructive/30">
                    <TrendingDown className="h-3 w-3" />
                    {impact.decreased} declined
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <Minus className="h-3 w-3" />
                    {impact.unchanged} unchanged
                  </Badge>
                </div>
              )}

              {/* Department Breakdown */}
              <div>
                <h4 className="text-sm font-medium mb-2">By Department</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(impact.byDepartment).map(([deptId, { count, departmentName }]) => (
                    <Badge key={deptId} variant="secondary">
                      {departmentName}: {count}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Employee Table */}
              <div>
                <h4 className="text-sm font-medium mb-2">Affected Employees ({displayedTotal})</h4>
                <div className="border rounded-md max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead className="text-center">Weight</TableHead>
                        <TableHead className="text-center">Current</TableHead>
                        {simulatedValue !== null && (
                          <>
                            <TableHead className="text-center">New</TableHead>
                            <TableHead className="text-center">Change</TableHead>
                          </>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {impact.employees.map((emp) => (
                        <TableRow key={emp.kpiId}>
                          <TableCell>
                            <div>
                              <span className="font-medium text-sm">{emp.fullName}</span>
                              {emp.employeeCode && (
                                <span className="text-xs text-muted-foreground ml-1">({emp.employeeCode})</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{emp.departmentName}</TableCell>
                          <TableCell className="text-center text-sm">{emp.weightage}%</TableCell>
                          <TableCell className="text-center">
                            {emp.currentScore !== null ? (
                              <Badge variant="outline">{emp.currentScore.toFixed(1)}</Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          {simulatedValue !== null && (
                            <>
                              <TableCell className="text-center">
                                {emp.simulatedScore !== null ? (
                                  <Badge variant="secondary">{emp.simulatedScore.toFixed(1)}</Badge>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                {emp.scoreChange !== null ? (
                                  <span className={`text-sm font-medium ${
                                    emp.scoreChange > 0 ? 'text-primary' : 
                                    emp.scoreChange < 0 ? 'text-destructive' : 'text-muted-foreground'
                                  }`}>
                                    {emp.scoreChange > 0 ? '+' : ''}{emp.scoreChange.toFixed(1)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
