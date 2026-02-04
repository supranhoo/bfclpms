import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Calendar, Copy, Save, Loader2, Info } from 'lucide-react';
import { 
  useEmployeeWorkingDays, 
  useSaveEmployeeWorkingDays, 
  useCopyWorkingDaysFromPreviousYear,
  MONTHS 
} from '@/hooks/useEmployeeWorkingDays';
import { useWorkingDaysPerMonth } from '@/hooks/useWorkflowSettings';

interface EmployeeWorkingDaysDialogProps {
  isOpen: boolean;
  onClose: () => void;
  employee: {
    id: string;
    full_name: string | null;
    email: string;
    employee_code: string | null;
  } | null;
}

export function EmployeeWorkingDaysDialog({ 
  isOpen, 
  onClose, 
  employee 
}: EmployeeWorkingDaysDialogProps) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [monthlyDays, setMonthlyDays] = useState<Record<string, number>>({});
  const [bulkValue, setBulkValue] = useState<string>('');
  
  const { data: existingDays, isLoading } = useEmployeeWorkingDays(employee?.id || null, selectedYear);
  const defaultWorkingDays = useWorkingDaysPerMonth();
  const saveDays = useSaveEmployeeWorkingDays();
  const copyFromPrevYear = useCopyWorkingDaysFromPreviousYear();

  // Initialize monthly days when data loads or year changes
  useEffect(() => {
    if (existingDays) {
      const daysMap: Record<string, number> = {};
      existingDays.forEach(d => {
        daysMap[d.month] = d.working_days;
      });
      setMonthlyDays(daysMap);
    } else {
      setMonthlyDays({});
    }
  }, [existingDays]);

  const handleDaysChange = (month: string, value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 1 || numValue > 31) return;
    setMonthlyDays(prev => ({ ...prev, [month]: numValue }));
  };

  const handleBulkApply = () => {
    const numValue = parseInt(bulkValue, 10);
    if (isNaN(numValue) || numValue < 1 || numValue > 31) return;
    
    const newDays: Record<string, number> = {};
    MONTHS.forEach(month => {
      newDays[month] = numValue;
    });
    setMonthlyDays(newDays);
    setBulkValue('');
  };

  const handleCopyFromPreviousYear = () => {
    if (!employee?.id) return;
    copyFromPrevYear.mutate({
      employeeId: employee.id,
      targetYear: selectedYear,
    });
  };

  const handleSave = () => {
    if (!employee?.id) return;
    saveDays.mutate({
      employeeId: employee.id,
      year: selectedYear,
      monthlyDays,
    }, {
      onSuccess: () => onClose(),
    });
  };

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  if (!employee) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Working Days Configuration
          </DialogTitle>
          <DialogDescription>
            Configure monthly working days for {employee.full_name || employee.email}
            {employee.employee_code && ` (${employee.employee_code})`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Year Selector & Quick Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Label>Year:</Label>
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Bulk set"
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                className="w-24"
                min={1}
                max={31}
              />
              <Button variant="outline" size="sm" onClick={handleBulkApply} disabled={!bulkValue}>
                Apply All
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleCopyFromPreviousYear}
                    disabled={copyFromPrevYear.isPending}
                  >
                    {copyFromPrevYear.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy from {selectedYear - 1}</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Default Indicator */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded">
            <Info className="h-4 w-4" />
            <span>
              Default: <strong>{defaultWorkingDays} days</strong> (used when not configured)
            </span>
          </div>

          {/* Monthly Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-center">Working Days</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MONTHS.map(month => {
                  const currentValue = monthlyDays[month];
                  const hasValue = currentValue !== undefined;
                  
                  return (
                    <TableRow key={month}>
                      <TableCell className="font-medium">{month}</TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          value={currentValue ?? ''}
                          onChange={(e) => handleDaysChange(month, e.target.value)}
                          placeholder={defaultWorkingDays.toString()}
                          className="w-20 mx-auto text-center"
                          min={1}
                          max={31}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        {hasValue ? (
                          <Badge variant="default" className="text-xs">
                            {currentValue} days
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Default ({defaultWorkingDays})
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            onClick={handleSave} 
            disabled={saveDays.isPending || Object.keys(monthlyDays).length === 0}
          >
            {saveDays.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
