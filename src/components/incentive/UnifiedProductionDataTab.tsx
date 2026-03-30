import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductionTargetGrid } from './ProductionTargetGrid';
import { VesselDataEntryGrid } from './VesselDataEntryGrid';

interface Program {
  id: string;
  name: string;
  is_active: boolean;
  incentive_base: string;
  min_kra_score: number;
}

export function UnifiedProductionDataTab({ programs }: { programs: Program[] }) {
  const activePrograms = programs.filter(p => p.is_active);
  const [selectedProgramId, setSelectedProgramId] = useState('');

  const selectedProgram = activePrograms.find(p => p.id === selectedProgramId);

  const { data: vesselRateCount, isLoading: countLoading } = useQuery({
    queryKey: ['vessel-rate-count', selectedProgramId],
    enabled: !!selectedProgramId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('incentive_vessel_rates')
        .select('id', { count: 'exact', head: true })
        .eq('program_id', selectedProgramId);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const isVesselProgram = (vesselRateCount ?? 0) > 0;

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
      ) : countLoading ? (
        <Card>
          <CardContent className="py-6 space-y-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-32 w-full" />
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
