import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAssignAuditEmployee, useRemoveAuditAssignment, useUpdateAuditAssignment } from '@/hooks/useAuditAssignments';
import { Search, X, UserPlus, Loader2, ArrowRightLeft } from 'lucide-react';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

interface AssignTabProps {
  selectedAuditor: string;
  assignmentsByAuditor: Map<string, any[]>;
  allProfiles: any[] | undefined;
  auditors: any[] | undefined;
}

export function AssignTabContent({ selectedAuditor, assignmentsByAuditor, allProfiles, auditors }: AssignTabProps) {
  const [employeeSearch, setEmployeeSearch] = useState('');
  const assignMutation = useAssignAuditEmployee();
  const removeMutation = useRemoveAuditAssignment();
  const updateMutation = useUpdateAuditAssignment();
  const [reassignPopoverId, setReassignPopoverId] = useState<string | null>(null);

  const assignedEmployeeIds = useMemo(() => {
    if (!selectedAuditor) return new Set<string>();
    return new Set((assignmentsByAuditor.get(selectedAuditor) || []).map((a: any) => a.employee_id));
  }, [selectedAuditor, assignmentsByAuditor]);

  const availableEmployees = useMemo(() => {
    if (!allProfiles || !selectedAuditor) return [];
    return allProfiles
      .filter(p => p.id !== selectedAuditor && !assignedEmployeeIds.has(p.id))
      .filter(p =>
        !employeeSearch ||
        p.full_name?.toLowerCase().includes(employeeSearch.toLowerCase()) ||
        p.email?.toLowerCase().includes(employeeSearch.toLowerCase()) ||
        p.employee_code?.toLowerCase().includes(employeeSearch.toLowerCase())
      );
  }, [allProfiles, selectedAuditor, assignedEmployeeIds, employeeSearch]);

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const otherAuditors = useMemo(() => {
    return (auditors || []).filter(a => a.id !== selectedAuditor);
  }, [auditors, selectedAuditor]);

  if (!selectedAuditor) return null;

  const currentAssignments = assignmentsByAuditor.get(selectedAuditor) || [];

  return (
    <>
      {/* Current assignments */}
      <div>
        <h4 className="text-sm font-medium text-foreground mb-2">
          Currently Assigned ({currentAssignments.length})
        </h4>
        <ScrollArea className="max-h-40">
          <div className="space-y-1">
            {currentAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No employees assigned yet.</p>
            ) : (
              currentAssignments.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-xs">{getInitials(a.employee?.full_name || null)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{a.employee?.full_name || a.employee?.email}</p>
                      {a.employee?.employee_code && (
                        <p className="text-xs text-muted-foreground">{a.employee.employee_code}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Inline reassign popover */}
                    <Popover
                      open={reassignPopoverId === a.id}
                      onOpenChange={(open) => setReassignPopoverId(open ? a.id : null)}
                    >
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" title="Reassign to another auditor">
                          <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-2" align="end">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Reassign to:</p>
                        <Select
                          onValueChange={(newAuditorId) => {
                            updateMutation.mutate({
                              assignmentId: a.id,
                              newAuditorId,
                              employeeId: a.employee_id,
                            });
                            setReassignPopoverId(null);
                          }}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Select auditor..." />
                          </SelectTrigger>
                          <SelectContent>
                            {otherAuditors.map(aud => (
                              <SelectItem key={aud.id} value={aud.id}>
                                {aud.full_name || aud.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </PopoverContent>
                    </Popover>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMutation.mutate(a.id)}
                      disabled={removeMutation.isPending}
                    >
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <Separator />

      {/* Add employees */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <h4 className="text-sm font-medium text-foreground mb-2">Add Employees</h4>
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search employees..."
            value={employeeSearch}
            onChange={e => setEmployeeSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <ScrollArea className="flex-1 max-h-48">
          <div className="space-y-1">
            {availableEmployees.slice(0, 50).map(emp => (
              <div key={emp.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                <div className="flex items-center gap-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs">{getInitials(emp.full_name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm">{emp.full_name || emp.email}</p>
                    <p className="text-xs text-muted-foreground">{emp.employee_code || emp.email}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => assignMutation.mutate({ auditorId: selectedAuditor, employeeId: emp.id })}
                  disabled={assignMutation.isPending}
                >
                  {assignMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                </Button>
              </div>
            ))}
            {availableEmployees.length === 0 && (
              <p className="text-sm text-muted-foreground py-2 text-center">
                {employeeSearch ? 'No matching employees found' : 'All employees are assigned'}
              </p>
            )}
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
