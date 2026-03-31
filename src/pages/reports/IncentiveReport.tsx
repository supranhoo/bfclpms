import { PageHeader } from '@/components/layout/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MonthlyIncentiveTable } from '@/components/incentive/MonthlyIncentiveTable';
import { RetroactiveAdjustmentTable } from '@/components/incentive/RetroactiveAdjustmentTable';
import { IncentiveReportExport } from '@/components/incentive/IncentiveReportExport';

export default function IncentiveReport() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Incentive Report"
        description="Monthly incentive computation results, filters, and comprehensive Excel export"
      />

      <Tabs defaultValue="report">
        <TabsList>
          <TabsTrigger value="report">Incentive Report</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Report</TabsTrigger>
          <TabsTrigger value="retroactive">Retroactive Adjustments</TabsTrigger>
        </TabsList>

        <TabsContent value="report">
          <IncentiveReportExport />
        </TabsContent>

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
