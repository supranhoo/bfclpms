import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProfiles, useKraCategories, useDepartments, useDivisions, useBusinessUnits } from '@/hooks/useOrganization';
import { useCreateKpi } from '@/hooks/useKpis';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { FileSpreadsheet, AlertCircle, CheckCircle2, Download, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
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

interface EmployeeImportRow {
  employeeCode: string;
  fullName: string;
  email: string;
  designation?: string;
  division?: string;
  businessUnit?: string;
  department?: string;
  pmsGrade?: string;
  managerEmployeeId?: string;
  managerName?: string;
}

export default function ImportData() {
  const queryClient = useQueryClient();
  const { data: profiles, refetch: refetchProfiles } = useProfiles();
  const { data: categories, refetch: refetchCategories } = useKraCategories();
  const { data: divisions } = useDivisions();
  const { data: businessUnits } = useBusinessUnits();
  const { data: departments } = useDepartments();
  const createKpi = useCreateKpi();
  const { toast } = useToast();

  // KPI Import State
  const [importData, setImportData] = useState<KpiImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(0);

  // Employee Import State
  const [employeeData, setEmployeeData] = useState<EmployeeImportRow[]>([]);
  const [employeeErrors, setEmployeeErrors] = useState<string[]>([]);
  const [isImportingEmployees, setIsImportingEmployees] = useState(false);
  const [employeeImportSuccess, setEmployeeImportSuccess] = useState(0);

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

  const handleEmployeeFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<EmployeeImportRow>(worksheet);

        // Validate data
        const validationErrors: string[] = [];
        jsonData.forEach((row, index) => {
          if (!row.employeeCode) {
            validationErrors.push(`Row ${index + 2}: Missing employee code`);
          }
          if (!row.fullName) {
            validationErrors.push(`Row ${index + 2}: Missing full name`);
          }
          if (!row.email) {
            validationErrors.push(`Row ${index + 2}: Missing email`);
          } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
            validationErrors.push(`Row ${index + 2}: Invalid email format`);
          }
        });

        setEmployeeErrors(validationErrors);
        setEmployeeData(jsonData);
        setEmployeeImportSuccess(0);
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
    let categoriesCreated = 0;
    const importErrors: string[] = [];

    // Cache for newly created categories during this import
    const categoryCache = new Map<string, string>();
    
    // Pre-populate cache with existing categories
    categories?.forEach(cat => {
      categoryCache.set(cat.name.toLowerCase(), cat.id);
    });

    // Generate random color for new categories
    const getRandomColor = () => {
      const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
      return colors[Math.floor(Math.random() * colors.length)];
    };

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

        // Find category by name, or create it if it doesn't exist
        let categoryId = categoryCache.get(row.category?.toLowerCase());
        
        if (!categoryId && row.category) {
          // Create new category
          const { data: newCategory, error: categoryError } = await supabase
            .from('kra_categories')
            .insert({
              name: row.category,
              weightage: 0,
              color: getRandomColor(),
              description: `Auto-created from import`,
            })
            .select()
            .single();

          if (categoryError) {
            importErrors.push(`Failed to create category "${row.category}": ${categoryError.message}`);
            continue;
          }

          categoryId = newCategory.id;
          categoryCache.set(row.category.toLowerCase(), categoryId);
          categoriesCreated++;
        }

        if (!categoryId) {
          importErrors.push(`Category not found or could not be created: ${row.category}`);
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
          category_id: categoryId,
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

    // Refresh categories if any were created
    if (categoriesCreated > 0) {
      refetchCategories();
      queryClient.invalidateQueries({ queryKey: ['kra-categories'] });
    }

    if (successCount > 0) {
      let message = `Successfully imported ${successCount} KPIs`;
      if (categoriesCreated > 0) {
        message += ` and created ${categoriesCreated} new categories`;
      }
      toast({ title: message });
    }
  };

  const handleEmployeeImport = async () => {
    if (employeeData.length === 0) return;

    setIsImportingEmployees(true);
    let successCount = 0;
    const importErrors: string[] = [];

    for (const row of employeeData) {
      try {
        // Check if employee already exists by email or code
        const existingEmployee = profiles?.find(p => 
          p.email.toLowerCase() === row.email.toLowerCase() ||
          (p.employee_code && p.employee_code === String(row.employeeCode))
        );

        if (existingEmployee) {
          // Update existing profile
          const departmentId = departments?.find(d => 
            d.name.toLowerCase() === row.department?.toLowerCase()
          )?.id || null;

          const managerId = profiles?.find(p => 
            p.employee_code === row.managerEmployeeId ||
            (row.managerName && p.full_name?.toLowerCase() === row.managerName?.toLowerCase())
          )?.id || null;

          const { error } = await supabase
            .from('profiles')
            .update({
              employee_code: String(row.employeeCode),
              full_name: row.fullName,
              designation: row.designation || null,
              department_id: departmentId,
              pms_grade: row.pmsGrade || null,
              reporting_manager_id: managerId,
            })
            .eq('id', existingEmployee.id);

          if (error) throw error;
          successCount++;
        } else {
          // Create new user via auth (this will trigger the profile creation)
          const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: row.email,
            password: `Welcome@${row.employeeCode}`, // Default password
            email_confirm: true,
            user_metadata: {
              full_name: row.fullName,
            },
          });

          let newUserId: string | null = null;

          if (authError) {
            // If admin API fails, try regular signup
            const { data: signupData, error: signupError } = await supabase.auth.signUp({
              email: row.email,
              password: `Welcome@${row.employeeCode}`,
              options: {
                data: {
                  full_name: row.fullName,
                },
              },
            });
            if (signupError) throw signupError;
            newUserId = signupData.user?.id || null;
          } else {
            newUserId = authData.user?.id || null;
          }

          // Wait a moment for the trigger to create the profile
          await new Promise(resolve => setTimeout(resolve, 500));

          // Update the profile with additional details
          const departmentId = departments?.find(d => 
            d.name.toLowerCase() === row.department?.toLowerCase()
          )?.id || null;

          const managerId = profiles?.find(p => 
            p.employee_code === row.managerEmployeeId ||
            (row.managerName && p.full_name?.toLowerCase() === row.managerName?.toLowerCase())
          )?.id || null;

          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              employee_code: String(row.employeeCode),
              designation: row.designation || null,
              department_id: departmentId,
              pms_grade: row.pmsGrade || null,
              reporting_manager_id: managerId,
            })
            .eq('email', row.email);

          if (updateError) throw updateError;

          // Assign default 'employee' role to new user
          if (newUserId) {
            // Check if role already exists
            const { data: existingRole } = await supabase
              .from('user_roles')
              .select('id')
              .eq('user_id', newUserId)
              .maybeSingle();

            if (!existingRole) {
              const { error: roleError } = await supabase
                .from('user_roles')
                .insert({
                  user_id: newUserId,
                  role: 'employee',
                });

              if (roleError) {
                console.error('Failed to assign role:', roleError);
              }
            }
          }

          successCount++;
        }
      } catch (error: any) {
        importErrors.push(`Failed to import ${row.fullName} (${row.email}): ${error.message}`);
      }
    }

    // Second pass: Identify managers from import data and assign 'manager' role
    // Collect all manager employee IDs/names from the import data
    const managerIdentifiers = new Set<string>();
    employeeData.forEach(row => {
      if (row.managerEmployeeId) managerIdentifiers.add(row.managerEmployeeId.toLowerCase());
      if (row.managerName) managerIdentifiers.add(row.managerName.toLowerCase());
    });

    // Refetch profiles to get latest data including newly created users
    const { data: updatedProfiles } = await supabase
      .from('profiles')
      .select('id, employee_code, full_name, email');

    if (updatedProfiles && managerIdentifiers.size > 0) {
      for (const profile of updatedProfiles) {
        const isManager = 
          (profile.employee_code && managerIdentifiers.has(profile.employee_code.toLowerCase())) ||
          (profile.full_name && managerIdentifiers.has(profile.full_name.toLowerCase()));

        if (isManager) {
          // Check current role
          const { data: existingRole } = await supabase
            .from('user_roles')
            .select('id, role')
            .eq('user_id', profile.id)
            .maybeSingle();

          if (existingRole) {
            // Update to manager if currently employee
            if (existingRole.role === 'employee') {
              await supabase
                .from('user_roles')
                .update({ role: 'manager' })
                .eq('id', existingRole.id);
            }
          } else {
            // Insert manager role
            await supabase
              .from('user_roles')
              .insert({ user_id: profile.id, role: 'manager' });
          }
        }
      }
    }

    setEmployeeImportSuccess(successCount);
    setEmployeeErrors(importErrors);
    setIsImportingEmployees(false);
    refetchProfiles();

    if (successCount > 0) {
      toast({ title: `Successfully imported ${successCount} employees` });
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

  const downloadEmployeeTemplate = () => {
    const template = [
      {
        employeeCode: '100001',
        fullName: 'John Doe',
        email: 'john.doe@company.com',
        designation: 'Manager',
        division: 'Operations',
        businessUnit: 'Plant',
        department: 'HR',
        pmsGrade: 'A',
        managerEmployeeId: '100002',
        managerName: 'Jane Smith',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employee Template');
    XLSX.writeFile(wb, 'employee_import_template.xlsx');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Import Data</h1>
        <p className="text-muted-foreground">Bulk import Employees and KRAs from Excel</p>
      </div>

      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="employees">Import Employees</TabsTrigger>
          <TabsTrigger value="kpis">Import PMS Data</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Employee Bulk Import
              </CardTitle>
              <CardDescription>Upload an Excel file to bulk import employees</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <Button variant="outline" onClick={downloadEmployeeTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
                <div className="relative">
                  <Input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleEmployeeFileUpload}
                    className="cursor-pointer"
                  />
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-2">Required columns:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><code>employeeCode</code> - Unique Employee Code</li>
                  <li><code>fullName</code> - Employee Full Name</li>
                  <li><code>email</code> - Employee Email (used for login)</li>
                </ul>
                <p className="font-medium mt-4 mb-2">Optional columns:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><code>designation</code> - Job Title</li>
                  <li><code>division</code> - Division Name</li>
                  <li><code>businessUnit</code> - Business Unit Name</li>
                  <li><code>department</code> - Department Name (must exist in system)</li>
                  <li><code>pmsGrade</code> - PMS Grade</li>
                  <li><code>managerEmployeeId</code> - Manager's Employee Code</li>
                  <li><code>managerName</code> - Manager's Full Name</li>
                </ul>
                <Alert className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    New employees will be created with default password: <code>Welcome@[EmployeeCode]</code>
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>

          {employeeErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Validation Errors</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside mt-2 max-h-32 overflow-auto">
                  {employeeErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {employeeImportSuccess > 0 && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Import Complete</AlertTitle>
              <AlertDescription>
                Successfully imported {employeeImportSuccess} employees.
              </AlertDescription>
            </Alert>
          )}

          {employeeData.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Preview</CardTitle>
                  <CardDescription>{employeeData.length} employees to import</CardDescription>
                </div>
                <Button onClick={handleEmployeeImport} disabled={isImportingEmployees || employeeErrors.length > 0}>
                  {isImportingEmployees ? 'Importing...' : `Import ${employeeData.length} Employees`}
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Designation</TableHead>
                        <TableHead>Division</TableHead>
                        <TableHead>Business Unit</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead>Manager ID</TableHead>
                        <TableHead>Manager Name</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employeeData.slice(0, 10).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell>{row.employeeCode}</TableCell>
                          <TableCell>{row.fullName}</TableCell>
                          <TableCell>{row.email}</TableCell>
                          <TableCell>{row.designation || '-'}</TableCell>
                          <TableCell>{row.division || '-'}</TableCell>
                          <TableCell>{row.businessUnit || '-'}</TableCell>
                          <TableCell>{row.department || '-'}</TableCell>
                          <TableCell>{row.pmsGrade || '-'}</TableCell>
                          <TableCell>{row.managerEmployeeId || '-'}</TableCell>
                          <TableCell>{row.managerName || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {employeeData.length > 10 && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Showing first 10 of {employeeData.length} rows
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

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
                  <li><code>category</code> - KRA Category (will be auto-created if doesn't exist)</li>
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
                <Alert className="mt-4">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    New categories will be automatically created if they don't exist in the system.
                  </AlertDescription>
                </Alert>
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
