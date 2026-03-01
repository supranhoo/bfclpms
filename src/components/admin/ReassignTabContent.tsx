import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { useReassignEmployees } from '@/hooks/useAuditReassignment';
import { ArrowRight, Loader2 } from 'lucide-react';

interface ReassignTabProps {
  assignmentsByAuditor: Map<string, any[]>;
  auditors: any[] | undefined;
}

export function ReassignTabContent({ assignmentsByAuditor, auditors }: ReassignTabProps) {
  const [sourceAuditor, setSourceAuditor] = useState('');
  const [targetAuditor, setTargetAuditor] = useState('');
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const reassignMutation = useReassignEmployees();

  const sourceAssignments = useMemo(() => {
    return assignmentsByAuditor.get(sourceAuditor) || [];
  }, [sourceAuditor, assignmentsByAuditor]);

  const allSelected = sourceAssignments.length > 0 && selectedEmployees.size === sourceAssignments.length;

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const toggleEmployee = (empId: string) => {
    setSelectedEmployees(prev => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId);
      else next.add(empId);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedEmployees(new Set());
    } else {
      setSelectedEmployees(new Set(sourceAssignments.map((a: any) => a.employee_id)));
    }
  };

  const handleReassign = () => {
    if (!sourceAuditor || !targetAuditor || selectedEmployees.size === 0) return;
    reassignMutation.mutate(
      { sourceAuditorId: sourceAuditor, targetAuditorId: targetAuditor, employeeIds: Array.from(selectedEmployees) },
      {
        onSuccess: () => {
          setSelectedEmployees(new Set());
          setSourceAuditor('');
          setTargetAuditor('');
        },
      }
    );
  };

  const availableTargets = useMemo(() => {
    return (auditors || []).filter(a => a.id !== sourceAuditor);
  }, [auditors, sourceAuditor]);

  return (
    <div className="space-y-4">
      {/* Source & Target selectors */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">From Auditor</label>
          <Select value={sourceAuditor} onValueChange={v => { setSourceAuditor(v); setTargetAuditor(''); setSelectedEmployees(new Set()); }}>
            <SelectTrigger>
              <SelectValue placeholder="Source..." />
            </SelectTrigger>
            <SelectContent>
              {auditors?.map(a => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="flex items-center gap-2">
                    {a.full_name || a.email}
                    <Badge variant="secondary" className="text-xs">
                      {assignmentsByAuditor.get(a.id)?.length || 0}
                    </Badge>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">To Auditor</label>
          <Select value={targetAuditor} onValueChange={setTargetAuditor} disabled={!sourceAuditor}>
            <SelectTrigger>
              <SelectValue placeholder="Target..." />
            </SelectTrigger>
            <SelectContent>
              {availableTargets.map(a => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="flex items-center gap-2">
                    {a.full_name || a.email}
                    <Badge variant="secondary" className="text-xs">
                      {assignmentsByAuditor.get(a.id)?.length || 0}
                    </Badge>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Employee list */}
      {sourceAuditor && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-foreground">
              Employees ({sourceAssignments.length})
            </h4>
            {sourceAssignments.length > 0 && (
              <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs h-7">
                {allSelected ? 'Deselect All' : 'Select All'}
              </Button>
            )}
          </div>
          <ScrollArea className="max-h-52">
            <div className="space-y-1">
              {sourceAssignments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No employees assigned to this auditor.</p>
              ) : (
                sourceAssignments.map((a: any) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedEmployees.has(a.employee_id)}
                      onCheckedChange={() => toggleEmployee(a.employee_id)}
                    />
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-xs">{getInitials(a.employee?.full_name || null)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.employee?.full_name || a.employee?.email}</p>
                      {a.employee?.employee_code && (
                        <p className="text-xs text-muted-foreground">{a.employee.employee_code}</p>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Reassign button */}
      {sourceAuditor && targetAuditor && selectedEmployees.size > 0 && (
        <Button
          onClick={handleReassign}
          disabled={reassignMutation.isPending}
          className="w-full"
        >
          {reassignMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <ArrowRight className="h-4 w-4 mr-2" />
          )}
          Reassign {selectedEmployees.size} Employee{selectedEmployees.size > 1 ? 's' : ''}
        </Button>
      )}
    </div>
  );
}
