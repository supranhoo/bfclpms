import { useState, useCallback } from 'react';
import { useProfiles, useKraCategories } from '@/hooks/useOrganization';
import { useCreateKpi } from '@/hooks/useKpis';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { FileSpreadsheet, AlertCircle, CheckCircle2, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface KpiImportRow {
  sNo?: number;
  month?: string;
  reviewStatus?: string;
  newCode: string;
  fullName: string;
  category: string;
  kra: string;
  kpi: string;
  target: string | number;
  targetAchieved?: string | number;
  achievedWeight?: string;
  rating?: number;
  kpiWeightageScore?: number;
  employeeTargetAchieved?: string | number;
  employeeRating?: number;
  employeeRemarks?: string;
  managerTargetAchieved?: string | number;
  managerRating?: number;
  managerRemarks?: string;
  auditTargetAchieved?: string | number;
  auditRating?: number;
  auditRemarks?: string;
  sourceOfData?: string;
  kpiStatus?: string;
}

export default function ImportData() {
  const { data: profiles } = useProfiles();
  const { data: categories } = useKraCategories();
  const createKpi = useCreateKpi();
  const { toast } = useToast();

  const [importData, setImportData] = useState<KpiImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(0);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<KpiImportRow>(worksheet);

        // Validate data
        const validationErrors: string[] = [];
        jsonData.forEach((row, index) => {
          if (!row.newCode && !row.fullName) {
            validationErrors.push(`Row ${index + 2}: Missing employee code or name`);
          }
          if (!row.category) {
            validationErrors.push(`Row ${index + 2}: Missing category`);
          }
          if (!row.kra) {
            validationErrors.push(`Row ${index + 2}: Missing KRA`);
          }
          if (!row.kpi) {
            validationErrors.push(`Row ${index + 2}: Missing KPI`);
          }
        });

        setErrors(validationErrors);
        setImportData(jsonData);
        setImportSuccess(0);
      } catch (error) {
        toast({ title: 'Failed to parse file', description: 'Please upload a valid Excel file', variant: 'destructive' });
      }
    };
    reader.readAsArrayBuffer(file);
  }, [toast]);

  const handleImport = async () => {
    if (importData.length === 0) return;

    setIsImporting(true);
    let successCount = 0;
    const importErrors: string[] = [];

    for (const row of importData) {
      try {
        // Find employee by code or name
        const employee = profiles?.find(p => 
          (p.employee_code && p.employee_code === String(row.newCode)) ||
          (p.full_name && p.full_name.toLowerCase() === row.fullName?.toLowerCase())
        );
        if (!employee) {
          importErrors.push(`Employee not found: ${row.newCode} - ${row.fullName}`);
          continue;
        }

        // Find category by name
        const category = categories?.find(c => c.name.toLowerCase() === row.category?.toLowerCase());
        if (!category) {
          importErrors.push(`Category not found: ${row.category}`);
          continue;
        }

        // Parse target value
        const targetValue = typeof row.target === 'number' ? row.target : 
          row.target ? parseFloat(String(row.target).replace('%', '')) : null;

        // Parse review period from month (e.g., "Sep-25" -> "September")
        const reviewPeriod = row.month || null;

        // Parse review year from month
        let reviewYear = new Date().getFullYear();
        if (row.month) {
          const yearPart = row.month.split('-')[1];
          if (yearPart) {
            reviewYear = 2000 + parseInt(yearPart);
          }
        }

        await createKpi.mutateAsync({
          employee_id: employee.id,
          category_id: category.id,
          kra_name: row.kra,
          kpi_name: row.kpi,
          target_value: targetValue,
          uom: null,
          weightage: row.kpiWeightageScore || 0,
          criteria: null,
          status: 'kra_set',
          review_period: reviewPeriod,
          review_year: reviewYear,
        });

        successCount++;
      } catch (error: any) {
        importErrors.push(`Failed to import KPI for ${row.fullName}: ${error.message}`);
      }
    }

    setImportSuccess(successCount);
    setErrors(importErrors);
    setIsImporting(false);

    if (successCount > 0) {
      toast({ title: `Successfully imported ${successCount} KPIs` });
    }
  };

  const downloadTemplate = () => {
    const template = [
      {
        sNo: 1,
        month: 'Dec-25',
        reviewStatus: 'Pending',
        newCode: '100001',
        fullName: 'John Doe',
        category: 'Financial Performance',
        kra: 'Revenue Growth',
        kpi: 'Monthly Revenue Target',
        target: '100000',
        targetAchieved: '',
        achievedWeight: '',
        rating: '',
        kpiWeightageScore: 25,
        employeeTargetAchieved: '',
        employeeRating: '',
        employeeRemarks: '',
        managerTargetAchieved: '',
        managerRating: '',
        managerRemarks: '',
        auditTargetAchieved: '',
        auditRating: '',
        auditRemarks: '',
        sourceOfData: '',
        kpiStatus: '',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PMS Import Template');
    XLSX.writeFile(wb, 'pms_import_template.xlsx');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Import Data</h1>
        <p className="text-muted-foreground">Bulk import Employee KRAs and Performance Data from Excel</p>
      </div>

      <Tabs defaultValue="kpis">
        <TabsList>
          <TabsTrigger value="kpis">Import PMS Data</TabsTrigger>
        </TabsList>

        <TabsContent value="kpis" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                PMS Scorecard Import
              </CardTitle>
              <CardDescription>Upload an Excel file to bulk import employee KRAs and KPIs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
                <div className="relative">
                  <Input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileUpload}
                    className="cursor-pointer"
                  />
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-2">Required columns:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><code>newCode</code> - Employee Code</li>
                  <li><code>fullName</code> - Employee Full Name</li>
                  <li><code>category</code> - KRA Category (must exist in system)</li>
                  <li><code>kra</code> - Key Result Area</li>
                  <li><code>kpi</code> - KPI / Target Description</li>
                  <li><code>target</code> - Target Value</li>
                  <li><code>month</code> - Review Period (e.g., Sep-25)</li>
                </ul>
                <p className="font-medium mt-4 mb-2">Optional columns:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><code>kpiWeightageScore</code> - KPI Weightage</li>
                  <li><code>targetAchieved</code>, <code>rating</code> - Achievement data</li>
                  <li><code>employeeRemarks</code>, <code>managerRemarks</code>, <code>auditRemarks</code></li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Validation Errors</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside mt-2 max-h-32 overflow-auto">
                  {errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {importSuccess > 0 && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Import Complete</AlertTitle>
              <AlertDescription>
                Successfully imported {importSuccess} KPIs.
              </AlertDescription>
            </Alert>
          )}

          {importData.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Preview</CardTitle>
                  <CardDescription>{importData.length} rows to import</CardDescription>
                </div>
                <Button onClick={handleImport} disabled={isImporting || errors.length > 0}>
                  {isImporting ? 'Importing...' : `Import ${importData.length} KPIs`}
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>KRA</TableHead>
                        <TableHead>KPI</TableHead>
                        <TableHead>Target</TableHead>
                        <TableHead>Month</TableHead>
                        <TableHead>Weightage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importData.slice(0, 10).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell>{row.newCode}</TableCell>
                          <TableCell>{row.fullName}</TableCell>
                          <TableCell>{row.category}</TableCell>
                          <TableCell>{row.kra}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{row.kpi}</TableCell>
                          <TableCell>{row.target}</TableCell>
                          <TableCell>{row.month}</TableCell>
                          <TableCell>{row.kpiWeightageScore || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {importData.length > 10 && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Showing first 10 of {importData.length} rows
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
