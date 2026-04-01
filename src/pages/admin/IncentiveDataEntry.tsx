import { PageHeader } from '@/components/layout/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIncentivePrograms } from '@/hooks/useIncentivePrograms';
import { UnifiedProductionDataTab } from '@/components/incentive/UnifiedProductionDataTab';
import { EligibilityDataEntry } from '@/components/incentive/EligibilityDataEntry';

export default function IncentiveDataEntry() {
  const { data: programs = [] } = useIncentivePrograms();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Incentive Data Entry"
        description="Enter production data and employee eligibility data for incentive programs"
      />

      <Tabs defaultValue="production">
        <TabsList>
          <TabsTrigger value="production">Production Data</TabsTrigger>
          <TabsTrigger value="eligibility">Eligibility Data</TabsTrigger>
        </TabsList>

        <TabsContent value="production" className="space-y-6">
          <UnifiedProductionDataTab programs={programs as any[]} />
        </TabsContent>

        <TabsContent value="eligibility">
          <EligibilityDataEntry />
        </TabsContent>
      </Tabs>
    </div>
  );
}
