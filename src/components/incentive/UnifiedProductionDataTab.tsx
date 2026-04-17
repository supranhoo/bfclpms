import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ProductionTargetGrid } from './ProductionTargetGrid';
import { VesselDataEntryGrid } from './VesselDataEntryGrid';
import { ProductionDailyGrid } from './ProductionDailyGrid';
import { IncentiveDataExport } from './IncentiveDataExport';
import { CompanyFilter } from '@/components/reports/CompanyFilter';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';

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
  const [currentMonth, setCurrentMonth] = useState(['January','February','March','April','May','June','July','August','September','October','November','December'][now.getMonth()]);
  const [currentYear, setCurrentYear] = useState(now.getFullYear());

  const selectedProgram = activePrograms.find(p => p.id === selectedProgramId);
  const { companies, selectedCompanyId, setSelectedCompanyId, filterByCompany } = useCompanyFilter();

  const { data: vesselRateCount, isLoading: vesselCountLoading } = useQuery({
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

  const { data: productionRateCount, isLoading: prodCountLoading } = useQuery({
    queryKey: ['production-rate-count', selectedProgramId],
    enabled: !!selectedProgramId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('incentive_production_rates')
        .select('id', { count: 'exact', head: true })
        .eq('program_id', selectedProgramId);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const isVesselProgram = (vesselRateCount ?? 0) > 0;
  const isProductionRateProgram = (productionRateCount ?? 0) > 0;
  const countLoading = vesselCountLoading || prodCountLoading;

  const programType: 'vessel' | 'daily' | 'target' = isVesselProgram ? 'vessel' : isProductionRateProgram ? 'daily' : 'target';

  const handleMonthYearChange = (m: string, y: number) => {
    setCurrentMonth(m);
    setCurrentYear(y);
  };

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
            <CompanyFilter
              companies={companies}
              selectedCompanyId={selectedCompanyId}
              onCompanyChange={setSelectedCompanyId}
              className="w-[200px]"
            />
            {selectedProgramId && !countLoading && selectedProgram && (
              <IncentiveDataExport
                programId={selectedProgramId}
                programName={selectedProgram.name}
                programType={programType}
                month={currentMonth}
                year={currentYear}
              />
            )}
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
          onMonthYearChange={handleMonthYearChange}
          filterByCompany={filterByCompany}
        />
      ) : isProductionRateProgram ? (
        <ProductionDailyGrid
          programId={selectedProgramId}
          programName={selectedProgram?.name}
          onMonthYearChange={handleMonthYearChange}
          filterByCompany={filterByCompany}
        />
      ) : (
        <ProductionTargetGrid controlledProgramId={selectedProgramId} onMonthYearChange={handleMonthYearChange} />
      )}
    </div>
  );
}
