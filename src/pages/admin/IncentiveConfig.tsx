import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import { useIncentiveProgramTypes } from '@/hooks/useIncentiveProgramTypes';
import { IncentiveSlabEditor } from '@/components/incentive/IncentiveSlabEditor';
import { DisqualificationRulesEditor } from '@/components/incentive/DisqualificationRulesEditor';
import { EligibilityDataEntry } from '@/components/incentive/EligibilityDataEntry';
import { ProgramEmployeeMapping } from '@/components/incentive/ProgramEmployeeMapping';
import { EligibilityFieldsConfig } from '@/components/incentive/EligibilityFieldsConfig';
import { ProgramTypeSelector } from '@/components/incentive/ProgramTypeSelector';
import { ProductionTargetGrid } from '@/components/incentive/ProductionTargetGrid';
import { ProductionRatesTab } from '@/components/incentive/ProductionRatesTab';
import { BusinessUnitManager } from '@/components/incentive/BusinessUnitManager';
import { AllocationRulesEditor } from '@/components/incentive/AllocationRulesEditor';
import { VesselRateEditor } from '@/components/incentive/VesselRateEditor';
import { VesselDataEntryGrid } from '@/components/incentive/VesselDataEntryGrid';
import { UnifiedProductionDataTab } from '@/components/incentive/UnifiedProductionDataTab';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCustomTabs, useUpsertCustomTab, useDeleteCustomTab } from '@/hooks/useIncentiveCustomTabs';
import { CustomTabManager } from '@/components/incentive/CustomTabManager';
import { CustomTabDataGrid } from '@/components/incentive/CustomTabDataGrid';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

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

/* ── Inner tabs for each program (core + dynamic custom tabs) ── */
function ProgramInnerTabs({ program }: { program: any }) {
  const p = program;
  const { data: customTabs = [] } = useCustomTabs(p.id);
  const upsertTab = useUpsertCustomTab();
  const deleteTab = useDeleteCustomTab();

  const [activeTab, setActiveTab] = useState('mapping');
  const [showTabManager, setShowTabManager] = useState(false);
  const [editingTab, setEditingTab] = useState<any>(null);

  const handleSaveTab = (tabData: any) => {
    upsertTab.mutate(
      { ...tabData, program_id: p.id },
      { onSuccess: () => { setShowTabManager(false); setEditingTab(null); } }
    );
  };

  const handleDeleteTab = (tab: any) => {
    if (!confirm(`Delete tab "${tab.tab_label}"? All data in this tab will be lost.`)) return;
    deleteTab.mutate({ id: tab.id, programId: p.id });
    if (activeTab === `custom-${tab.id}`) setActiveTab('mapping');
  };

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center gap-2 mb-3">
          <TabsList className="flex-wrap">
            <TabsTrigger value="mapping">Mapping</TabsTrigger>
            <TabsTrigger value="slabs">Slabs</TabsTrigger>
            <TabsTrigger value="rules">DQ Rules</TabsTrigger>
            <TabsTrigger value="fields">Fields</TabsTrigger>
            <TabsTrigger value="sub-units">BU Sub-Units</TabsTrigger>
            <TabsTrigger value="allocation">Allocation</TabsTrigger>
            <TabsTrigger value="vessel-rates">Vessel Rates</TabsTrigger>
            <TabsTrigger value="production-rates">Production Rates</TabsTrigger>
            {customTabs.map((ct) => (
              <TabsTrigger key={ct.id} value={`custom-${ct.id}`}>
                {ct.tab_label}
              </TabsTrigger>
            ))}
          </TabsList>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setEditingTab(null); setShowTabManager(true); }}
            className="shrink-0"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Tab
          </Button>
        </div>

        <TabsContent value="mapping">
          <ProgramEmployeeMapping programId={p.id} />
        </TabsContent>
        <TabsContent value="slabs">
          <IncentiveSlabEditor programId={p.id} programType={p.program_type as 'production' | 'support'} />
        </TabsContent>
        <TabsContent value="rules">
          <DisqualificationRulesEditor programId={p.id} />
        </TabsContent>
        <TabsContent value="fields">
          <EligibilityFieldsConfig programId={p.id} />
        </TabsContent>
        <TabsContent value="sub-units">
          <BusinessUnitManager />
        </TabsContent>
        <TabsContent value="allocation">
          <AllocationRulesEditor programId={p.id} />
        </TabsContent>
        <TabsContent value="vessel-rates">
          <VesselRateEditor programId={p.id} minKraScore={p.min_kra_score} />
        </TabsContent>
        <TabsContent value="production-rates">
          <ProductionRatesTab programId={p.id} />
        </TabsContent>

        {customTabs.map((ct) => (
          <TabsContent key={ct.id} value={`custom-${ct.id}`}>
            <CustomTabDataGrid
              tab={ct}
              programId={p.id}
              onEditTab={() => { setEditingTab(ct); setShowTabManager(true); }}
              onDeleteTab={() => handleDeleteTab(ct)}
            />
          </TabsContent>
        ))}
      </Tabs>

      <CustomTabManager
        open={showTabManager}
        onOpenChange={setShowTabManager}
        onSave={handleSaveTab}
        editingTab={editingTab}
        isPending={upsertTab.isPending}
      />
    </>
  );
}

export default function IncentiveConfig() {
  const { data: programs = [], isLoading } = useIncentivePrograms();
  const { data: programTypes = [] } = useIncentiveProgramTypes();
  const createProgram = useCreateProgram();
  const updateProgram = useUpdateProgram();
  const deleteProgram = useDeleteProgram();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newProgram, setNewProgram] = useState({ name: '', program_type: 'support', description: '' });
  const [editProgram, setEditProgram] = useState<any>(null);

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
        description="Configure incentive programs, slabs, disqualification rules, and mappings"
      />

      <div className="space-y-4">
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
                            {programTypes.find((t: any) => t.value === p.program_type)?.label || p.program_type}
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
                          onClick={() => setEditProgram(p)}
                          title="Edit program"
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
                    <ProgramInnerTabs program={p} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
      </div>

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
              <ProgramTypeSelector value={newProgram.program_type} onValueChange={v => setNewProgram(p => ({ ...p, program_type: v }))} />
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
      {/* Edit Program Dialog */}
      <Dialog open={!!editProgram} onOpenChange={open => { if (!open) setEditProgram(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Incentive Program</DialogTitle>
          </DialogHeader>
          {editProgram && (
            <EditProgramForm
              program={editProgram}
              onSave={(values) => {
                updateProgram.mutate({ id: editProgram.id, ...values }, {
                  onSuccess: () => setEditProgram(null),
                });
              }}
              onCancel={() => setEditProgram(null)}
              isPending={updateProgram.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Edit Program Form (extracted for clean state reset) ── */
function EditProgramForm({ program, onSave, onCancel, isPending }: {
  program: any;
  onSave: (values: any) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(program.name || '');
  const [programType, setProgramType] = useState(program.program_type || 'support');
  const [description, setDescription] = useState(program.description || '');
  const [effectiveFrom, setEffectiveFrom] = useState(program.effective_from || '');
  const [effectiveTo, setEffectiveTo] = useState(program.effective_to || '');
  const [isActive, setIsActive] = useState(program.is_active ?? true);
  const [incentiveBase, setIncentiveBase] = useState(program.incentive_base || 'basic_salary');
  const [minKraScore, setMinKraScore] = useState(String(program.min_kra_score ?? 3));
  const [noKraEligible, setNoKraEligible] = useState(program.no_kra_eligible ?? true);

  return (
    <>
      <div className="space-y-4">
        <div>
          <Label>Program Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Program name" />
        </div>
        <div>
          <Label>Type</Label>
          <ProgramTypeSelector value={programType} onValueChange={setProgramType} />
        </div>
        <div>
          <Label>Description</Label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Effective From</Label>
            <Input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} />
          </div>
          <div>
            <Label>Effective To</Label>
            <Input type="date" value={effectiveTo} onChange={e => setEffectiveTo(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <Label>Active</Label>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>
        <div>
          <Label>Incentive Base</Label>
          <Select value={incentiveBase} onValueChange={setIncentiveBase}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="basic_salary">Basic Salary</SelectItem>
              <SelectItem value="gross_salary">Gross Salary</SelectItem>
              <SelectItem value="ctc">CTC</SelectItem>
              <SelectItem value="fixed">Fixed Amount</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Min KRA Score</Label>
            <Input type="number" step="0.1" value={minKraScore} onChange={e => setMinKraScore(e.target.value)} />
          </div>
          <div className="flex items-center justify-between pt-6">
            <Label className="text-sm">No-KRA Eligible</Label>
            <Switch checked={noKraEligible} onCheckedChange={setNoKraEligible} />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button
          onClick={() => onSave({
            name,
            program_type: programType,
            description: description || null,
            effective_from: effectiveFrom || null,
            effective_to: effectiveTo || null,
            is_active: isActive,
            incentive_base: incentiveBase,
            min_kra_score: parseFloat(minKraScore) || 3,
            no_kra_eligible: noKraEligible,
          })}
          disabled={!name || isPending}
        >
          Save Changes
        </Button>
      </DialogFooter>
    </>
  );
}
