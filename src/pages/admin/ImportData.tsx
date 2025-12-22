import { useState, useCallback } from 'react';
import { useProfiles, useKraCategories, useDepartments } from '@/hooks/useOrganization';
import { useCreateKpi } from '@/hooks/useKpis';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface KpiImportRow {
  employee_email: string;
  category_name: string;
  kra_name: string;
  kpi_name: string;
  target_value: number;
  uom: string;
  weightage: number;
  criteria: string;
}

export default function ImportData() {
  const { data: profiles } = useProfiles();
  const { data: categories } = useKraCategories();
  const { data: departments } = useDepartments();
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
          if (!row.employee_email) {
            validationErrors.push(`Row ${index + 2}: Missing employee email`);
          }
          if (!row.category_name) {
            validationErrors.push(`Row ${index + 2}: Missing category name`);
          }
          if (!row.kra_name) {
            validationErrors.push(`Row ${index + 2}: Missing KRA name`);
          }
          if (!row.kpi_name) {
            validationErrors.push(`Row ${index + 2}: Missing KPI name`);
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
        // Find employee by email
        const employee = profiles?.find(p => p.email.toLowerCase() === row.employee_email.toLowerCase());
        if (!employee) {
          importErrors.push(`Employee not found: ${row.employee_email}`);
          continue;
        }

        // Find category by name
        const category = categories?.find(c => c.name.toLowerCase() === row.category_name.toLowerCase());
        if (!category) {
          importErrors.push(`Category not found: ${row.category_name}`);
          continue;
        }

        await createKpi.mutateAsync({
          employee_id: employee.id,
          category_id: category.id,
          kra_name: row.kra_name,
          kpi_name: row.kpi_name,
          target_value: row.target_value || null,
          uom: row.uom || null,
          weightage: row.weightage || 0,
          criteria: row.criteria || null,
          status: 'kra_set',
          review_period: null,
          review_year: new Date().getFullYear(),
        });

        successCount++;
      } catch (error: any) {
        importErrors.push(`Failed to import KPI for ${row.employee_email}: ${error.message}`);
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
        employee_email: 'john@example.com',
        category_name: 'Financial Performance',
        kra_name: 'Revenue Growth',
        kpi_name: 'Monthly Revenue Target',
        target_value: 100000,
        uom: 'USD',
        weightage: 25,
        criteria: 'Achieve monthly revenue target',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KPI Template');
    XLSX.writeFile(wb, 'kpi_import_template.xlsx');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Import Data</h1>
        <p className="text-muted-foreground">Bulk import KPIs and employee data from Excel</p>
      </div>

      <Tabs defaultValue="kpis">
        <TabsList>
          <TabsTrigger value="kpis">Import KPIs</TabsTrigger>
        </TabsList>

        <TabsContent value="kpis" className="space-y-6">
          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                KPI Import
              </CardTitle>
              <CardDescription>Upload an Excel file to bulk import KPIs for employees</CardDescription>
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
                  <li><code>employee_email</code> - Employee's email address</li>
                  <li><code>category_name</code> - KRA category name (must exist)</li>
                  <li><code>kra_name</code> - Key Result Area name</li>
                  <li><code>kpi_name</code> - KPI name/description</li>
                  <li><code>target_value</code> - Numeric target</li>
                  <li><code>uom</code> - Unit of measurement</li>
                  <li><code>weightage</code> - KPI weightage (0-100)</li>
                  <li><code>criteria</code> - Evaluation criteria</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Errors */}
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

          {/* Success */}
          {importSuccess > 0 && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Import Complete</AlertTitle>
              <AlertDescription>
                Successfully imported {importSuccess} KPIs.
              </AlertDescription>
            </Alert>
          )}

          {/* Preview */}
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
                        <TableHead>Employee</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>KRA</TableHead>
                        <TableHead>KPI</TableHead>
                        <TableHead>Target</TableHead>
                        <TableHead>UOM</TableHead>
                        <TableHead>Weightage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importData.slice(0, 10).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell>{row.employee_email}</TableCell>
                          <TableCell>{row.category_name}</TableCell>
                          <TableCell>{row.kra_name}</TableCell>
                          <TableCell>{row.kpi_name}</TableCell>
                          <TableCell>{row.target_value}</TableCell>
                          <TableCell>{row.uom}</TableCell>
                          <TableCell>{row.weightage}%</TableCell>
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
