import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuditAssignments } from '@/hooks/useAuditAssignments';
import { useProfiles } from '@/hooks/useOrganization';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Users, ArrowRightLeft } from 'lucide-react';
import { AssignTabContent } from './AssignTabContent';
import { ReassignTabContent } from './ReassignTabContent';

interface AuditAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuditAssignmentDialog({ open, onOpenChange }: AuditAssignmentDialogProps) {
  const { data: assignments, isLoading: assignmentsLoading } = useAuditAssignments();
  const { data: allProfiles } = useProfiles();

  const [selectedAuditor, setSelectedAuditor] = useState<string>('');

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Manage Audit Assignments
          </DialogTitle>
          <DialogDescription>
            Assign or reassign employees between auditors.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="assign" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="w-full">
            <TabsTrigger value="assign" className="flex-1 gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Assign
            </TabsTrigger>
            <TabsTrigger value="reassign" className="flex-1 gap-1.5">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Reassign
            </TabsTrigger>
          </TabsList>

          <TabsContent value="assign" className="flex-1 overflow-hidden flex flex-col space-y-4">
            {/* Auditor Selector */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Select Auditor</label>
              <Select value={selectedAuditor} onValueChange={v => setSelectedAuditor(v)}>
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

            {selectedAuditor ? (
              <AssignTabContent
                selectedAuditor={selectedAuditor}
                assignmentsByAuditor={assignmentsByAuditor}
                allProfiles={allProfiles}
                auditors={auditors}
              />
            ) : !assignmentsLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Select an auditor above to manage their assignments</p>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="reassign" className="flex-1 overflow-hidden">
            <ReassignTabContent
              assignmentsByAuditor={assignmentsByAuditor}
              auditors={auditors}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
