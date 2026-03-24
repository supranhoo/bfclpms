import { PageHeader } from '@/components/layout/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MonthlyIncentiveTable } from '@/components/incentive/MonthlyIncentiveTable';
import { RetroactiveAdjustmentTable } from '@/components/incentive/RetroactiveAdjustmentTable';

export default function IncentiveReport() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Incentive Report"
        description="Monthly incentive computation results and retroactive adjustment tracking"
      />

      <Tabs defaultValue="monthly">
        <TabsList>
          <TabsTrigger value="monthly">Monthly Report</TabsTrigger>
          <TabsTrigger value="retroactive">Retroactive Adjustments</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly">
          <MonthlyIncentiveTable />
        </TabsContent>

        <TabsContent value="retroactive">
          <RetroactiveAdjustmentTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
