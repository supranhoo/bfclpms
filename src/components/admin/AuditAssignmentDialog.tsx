import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useAuditAssignments, useAssignAuditEmployee, useRemoveAuditAssignment } from '@/hooks/useAuditAssignments';
import { useProfiles } from '@/hooks/useOrganization';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Search, X, UserPlus, Users, Loader2 } from 'lucide-react';

interface AuditAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuditAssignmentDialog({ open, onOpenChange }: AuditAssignmentDialogProps) {
  const { data: assignments, isLoading: assignmentsLoading } = useAuditAssignments();
  const { data: allProfiles } = useProfiles();
  const assignMutation = useAssignAuditEmployee();
  const removeMutation = useRemoveAuditAssignment();

  const [selectedAuditor, setSelectedAuditor] = useState<string>('');
  const [employeeSearch, setEmployeeSearch] = useState('');

  // Fetch auditors (users with auditor role)
  const { data: auditors } = useQuery({
    queryKey: ['auditor-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'auditor');
      if (error) throw error;
      const auditorIds = data.map(r => r.user_id);
      if (auditorIds.length === 0) return [];
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, employee_code')
        .in('id', auditorIds)
        .order('full_name');
      if (pErr) throw pErr;
      return profiles;
    },
    enabled: open,
  });

  // Group assignments by auditor
  const assignmentsByAuditor = useMemo(() => {
    const map = new Map<string, typeof assignments>();
    assignments?.forEach(a => {
      const existing = map.get(a.auditor_id) || [];
      existing.push(a);
      map.set(a.auditor_id, existing);
    });
    return map;
  }, [assignments]);

  // Employees already assigned to the selected auditor
  const assignedEmployeeIds = useMemo(() => {
    if (!selectedAuditor) return new Set<string>();
    return new Set((assignmentsByAuditor.get(selectedAuditor) || []).map(a => a.employee_id));
  }, [selectedAuditor, assignmentsByAuditor]);

  // Available employees for assignment (not already assigned to this auditor)
  const availableEmployees = useMemo(() => {
    if (!allProfiles || !selectedAuditor) return [];
    return allProfiles
      .filter(p => p.id !== selectedAuditor && !assignedEmployeeIds.has(p.id))
      .filter(p =>
        !employeeSearch ||
        p.full_name?.toLowerCase().includes(employeeSearch.toLowerCase()) ||
        p.email.toLowerCase().includes(employeeSearch.toLowerCase()) ||
        p.employee_code?.toLowerCase().includes(employeeSearch.toLowerCase())
      );
  }, [allProfiles, selectedAuditor, assignedEmployeeIds, employeeSearch]);

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleAssign = (employeeId: string) => {
    if (!selectedAuditor) return;
    assignMutation.mutate({ auditorId: selectedAuditor, employeeId });
  };

  const handleRemove = (assignmentId: string) => {
    removeMutation.mutate(assignmentId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Manage Audit Assignments
          </DialogTitle>
          <DialogDescription>
            Assign employees to auditors. Each auditor will see their assigned employees highlighted in the Audit Panel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Auditor Selector */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Select Auditor</label>
            <Select value={selectedAuditor} onValueChange={v => { setSelectedAuditor(v); setEmployeeSearch(''); }}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an auditor..." />
              </SelectTrigger>
              <SelectContent>
                {auditors?.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="flex items-center gap-2">
                      {a.full_name || a.email}
                      <Badge variant="secondary" className="text-xs">
                        {assignmentsByAuditor.get(a.id)?.length || 0} assigned
                      </Badge>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedAuditor && (
            <>
              {/* Current assignments for this auditor */}
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">
                  Currently Assigned ({assignmentsByAuditor.get(selectedAuditor)?.length || 0})
                </h4>
                <ScrollArea className="max-h-40">
                  <div className="space-y-1">
                    {(assignmentsByAuditor.get(selectedAuditor) || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">No employees assigned yet.</p>
                    ) : (
                      (assignmentsByAuditor.get(selectedAuditor) || []).map(a => (
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemove(a.id)}
                            disabled={removeMutation.isPending}
                          >
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
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
                          onClick={() => handleAssign(emp.id)}
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
          )}

          {!selectedAuditor && !assignmentsLoading && (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Select an auditor above to manage their assignments</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
