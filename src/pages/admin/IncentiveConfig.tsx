import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Edit, Trash2 } from 'lucide-react';
import {
  useIncentivePrograms,
  useCreateProgram,
  useUpdateProgram,
  useDeleteProgram,
} from '@/hooks/useIncentivePrograms';
import { IncentiveSlabEditor } from '@/components/incentive/IncentiveSlabEditor';
import { DisqualificationRulesEditor } from '@/components/incentive/DisqualificationRulesEditor';
import { EligibilityDataEntry } from '@/components/incentive/EligibilityDataEntry';
import { ProgramEmployeeMapping } from '@/components/incentive/ProgramEmployeeMapping';

export default function IncentiveConfig() {
  const { data: programs = [], isLoading } = useIncentivePrograms();
  const createProgram = useCreateProgram();
  const updateProgram = useUpdateProgram();
  const deleteProgram = useDeleteProgram();

  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newProgram, setNewProgram] = useState({ name: '', program_type: 'support', description: '' });

  const selectedProgram = programs.find((p: any) => p.id === selectedProgramId);

  const handleCreate = () => {
    createProgram.mutate(newProgram, {
      onSuccess: () => {
        setShowCreateDialog(false);
        setNewProgram({ name: '', program_type: 'support', description: '' });
      },
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Incentive Configuration"
        description="Configure incentive programs, slabs, disqualification rules, and employee eligibility data"
      />

      <Tabs defaultValue="programs">
        <TabsList>
          <TabsTrigger value="programs">Programs</TabsTrigger>
          <TabsTrigger value="slabs" disabled={!selectedProgramId}>Slabs</TabsTrigger>
          <TabsTrigger value="rules" disabled={!selectedProgramId}>DQ Rules</TabsTrigger>
          <TabsTrigger value="eligibility">Eligibility Data</TabsTrigger>
        </TabsList>

        <TabsContent value="programs">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Incentive Programs</CardTitle>
                <CardDescription>Create and manage incentive programs for Production and Support tracks</CardDescription>
              </div>
              <Button onClick={() => setShowCreateDialog(true)}><Plus className="h-4 w-4 mr-1" /> New Program</Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Effective Period</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                    ) : programs.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No programs created yet</TableCell></TableRow>
                    ) : (
                      programs.map((p: any) => (
                        <TableRow
                          key={p.id}
                          className={selectedProgramId === p.id ? 'bg-muted/50' : 'cursor-pointer hover:bg-muted/30'}
                          onClick={() => setSelectedProgramId(p.id)}
                        >
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>
                            <Badge variant={p.program_type === 'production' ? 'default' : 'secondary'}>
                              {p.program_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={p.is_active ? 'default' : 'outline'}>
                              {p.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {p.effective_from || '—'} to {p.effective_to || 'ongoing'}
                          </TableCell>
                          <TableCell className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => { e.stopPropagation(); updateProgram.mutate({ id: p.id, is_active: !p.is_active }); }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => { e.stopPropagation(); deleteProgram.mutate(p.id); }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {selectedProgramId && (
                <p className="text-sm text-muted-foreground mt-2">
                  Selected: <strong>{selectedProgram?.name}</strong> — switch to Slabs or DQ Rules tab to configure
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="slabs">
          {selectedProgramId && selectedProgram && (
            <IncentiveSlabEditor
              programId={selectedProgramId}
              programType={selectedProgram.program_type as 'production' | 'support'}
            />
          )}
        </TabsContent>

        <TabsContent value="rules">
          {selectedProgramId && (
            <DisqualificationRulesEditor programId={selectedProgramId} />
          )}
        </TabsContent>

        <TabsContent value="eligibility">
          <EligibilityDataEntry />
        </TabsContent>
      </Tabs>

      {/* Create Program Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Incentive Program</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Program Name</Label>
              <Input value={newProgram.name} onChange={e => setNewProgram(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Support Functions FY 2025-26" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={newProgram.program_type} onValueChange={v => setNewProgram(p => ({ ...p, program_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="support">Support Functions</SelectItem>
                  <SelectItem value="production">Production & Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Input value={newProgram.description} onChange={e => setNewProgram(p => ({ ...p, description: e.target.value }))} placeholder="Optional description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newProgram.name || createProgram.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
