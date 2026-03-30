import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProductionTargetGrid } from './ProductionTargetGrid';
import { VesselDataEntryGrid } from './VesselDataEntryGrid';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Program {
  id: string;
  name: string;
  is_active: boolean;
  incentive_base: string;
  min_kra_score: number;
}

export function UnifiedProductionDataTab({ programs }: { programs: Program[] }) {
  const now = new Date();
  const activePrograms = programs.filter(p => p.is_active);
  const [selectedProgramId, setSelectedProgramId] = useState('');

  const selectedProgram = activePrograms.find(p => p.id === selectedProgramId);
  const isVesselProgram = selectedProgram?.incentive_base === 'fixed';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Select Program" />
              </SelectTrigger>
              <SelectContent>
                {activePrograms.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      {!selectedProgramId ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Select a program above to enter production or vessel data.
          </CardContent>
        </Card>
      ) : isVesselProgram ? (
        <VesselDataEntryGrid
          programs={[{
            id: selectedProgram!.id,
            name: selectedProgram!.name,
            min_kra_score: selectedProgram!.min_kra_score,
          }]}
        />
      ) : (
        <ProductionTargetGrid controlledProgramId={selectedProgramId} />
      )}
    </div>
  );
}
