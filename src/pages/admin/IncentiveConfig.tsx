import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Plus, Edit, Trash2, Users, Layers, ShieldAlert, ChevronRight } from 'lucide-react';
import {
  useIncentivePrograms,
  useCreateProgram,
  useUpdateProgram,
  useDeleteProgram,
  useSlabCount,
  useDqRuleCount,
  useMappingCount,
} from '@/hooks/useIncentivePrograms';
import { IncentiveSlabEditor } from '@/components/incentive/IncentiveSlabEditor';
import { DisqualificationRulesEditor } from '@/components/incentive/DisqualificationRulesEditor';
import { EligibilityDataEntry } from '@/components/incentive/EligibilityDataEntry';
import { ProgramEmployeeMapping } from '@/components/incentive/ProgramEmployeeMapping';
import { EligibilityFieldsConfig } from '@/components/incentive/EligibilityFieldsConfig';

/* ── Summary badges for each program card ── */
function ProgramSummaryBadges({ programId }: { programId: string }) {
  const { data: mappingCount = 0 } = useMappingCount(programId);
  const { data: slabCount = 0 } = useSlabCount(programId);
  const { data: dqCount = 0 } = useDqRuleCount(programId);

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <Users className="h-3.5 w-3.5" /> {mappingCount} mappings
      </span>
      <span className="flex items-center gap-1">
        <Layers className="h-3.5 w-3.5" /> {slabCount} slabs
      </span>
      <span className="flex items-center gap-1">
        <ShieldAlert className="h-3.5 w-3.5" /> {dqCount} DQ rules
      </span>
    </div>
  );
}

export default function IncentiveConfig() {
  const { data: programs = [], isLoading } = useIncentivePrograms();
  const createProgram = useCreateProgram();
  const updateProgram = useUpdateProgram();
  const deleteProgram = useDeleteProgram();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newProgram, setNewProgram] = useState({ name: '', program_type: 'support', description: '' });
  const [innerTab, setInnerTab] = useState<Record<string, string>>({});

  const handleCreate = () => {
    createProgram.mutate(newProgram, {
      onSuccess: () => {
        setShowCreateDialog(false);
        setNewProgram({ name: '', program_type: 'support', description: '' });
      },
    });
  };

  const getInnerTab = (id: string) => innerTab[id] || 'mapping';
  const setInnerTabFor = (id: string, tab: string) => setInnerTab(prev => ({ ...prev, [id]: tab }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Incentive Configuration"
        description="Configure incentive programs, slabs, disqualification rules, and employee eligibility data"
      />

      <Tabs defaultValue="programs">
        <TabsList>
          <TabsTrigger value="programs">Programs</TabsTrigger>
          <TabsTrigger value="eligibility">Eligibility Data</TabsTrigger>
        </TabsList>

        <TabsContent value="programs" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Program
            </Button>
          </div>

          {isLoading ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Loading programs...</CardContent></Card>
          ) : programs.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No programs created yet. Click "New Program" to get started.</CardContent></Card>
          ) : (
            <Accordion type="single" collapsible className="space-y-3">
              {programs.map((p: any) => (
                <AccordionItem key={p.id} value={p.id} className="border rounded-lg bg-card shadow-sm">
                  <AccordionTrigger className="px-4 py-3 hover:no-underline [&[data-state=open]>svg]:rotate-90">
                    <div className="flex flex-1 items-center justify-between pr-2">
                      <div className="flex flex-col items-start gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-base">{p.name}</span>
                          <Badge variant={p.program_type === 'production' ? 'default' : 'secondary'} className="text-xs">
                            {p.program_type}
                          </Badge>
                          <Badge variant={p.is_active ? 'default' : 'outline'} className="text-xs">
                            {p.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <ProgramSummaryBadges programId={p.id} />
                      </div>
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <span className="text-xs text-muted-foreground mr-2">
                          {p.effective_from || '—'} to {p.effective_to || 'ongoing'}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => updateProgram.mutate({ id: p.id, is_active: !p.is_active })}
                          title={p.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteProgram.mutate(p.id)}
                          title="Delete program"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200" />
                  </AccordionTrigger>

                  <AccordionContent className="px-4 pb-4">
                    <Tabs value={getInnerTab(p.id)} onValueChange={v => setInnerTabFor(p.id, v)}>
                      <TabsList className="mb-3">
                        <TabsTrigger value="mapping">Mapping</TabsTrigger>
                        <TabsTrigger value="slabs">Slabs</TabsTrigger>
                        <TabsTrigger value="rules">DQ Rules</TabsTrigger>
                      </TabsList>

                      <TabsContent value="mapping">
                        <ProgramEmployeeMapping programId={p.id} />
                      </TabsContent>

                      <TabsContent value="slabs">
                        <IncentiveSlabEditor
                          programId={p.id}
                          programType={p.program_type as 'production' | 'support'}
                        />
                      </TabsContent>

                      <TabsContent value="rules">
                        <DisqualificationRulesEditor programId={p.id} />
                      </TabsContent>
                    </Tabs>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
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
