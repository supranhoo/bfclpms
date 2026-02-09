import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDivisions, useBusinessUnits, useDepartments, useSubBranches, useDesignations, usePmsGrades } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Building2, Download, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { sanitizeText } from '@/lib/importValidation';

interface OrgImportRow {
  division?: string;
  divisionCode?: string;
  divisionLevel?: string;
  businessUnit?: string;
  businessUnitCode?: string;
  businessUnitLevel?: string;
  department?: string;
  departmentCode?: string;
  departmentLevel?: string;
  subBranch?: string;
  subBranchCode?: string;
  subBranchLevel?: string;
  designation?: string;
  designationCode?: string;
  designationLevel?: string;
  pmsGrade?: string;
  pmsGradeCode?: string;
  pmsGradeLevel?: string;
}

export default function OrgStructureImport() {
  const queryClient = useQueryClient();
  const { data: divisions } = useDivisions();
  const { data: businessUnits } = useBusinessUnits();
  const { data: departments } = useDepartments();
  const { data: subBranches } = useSubBranches();
  const { data: designations } = useDesignations();
  const { data: pmsGrades } = usePmsGrades();
  const { toast } = useToast();

  const [importData, setImportData] = useState<OrgImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    divisions: number;
    businessUnits: number;
    departments: number;
    subBranches: number;
    designations: number;
    pmsGrades: number;
  } | null>(null);

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['division', 'divisionCode', 'divisionLevel', 'businessUnit', 'businessUnitCode', 'businessUnitLevel', 'department', 'departmentCode', 'departmentLevel', 'subBranch', 'subBranchCode', 'subBranchLevel', 'designation', 'designationCode', 'designationLevel', 'pmsGrade', 'pmsGradeCode', 'pmsGradeLevel'],
      ['Head Office', 'HO', 'L1', 'Technology', 'TECH', 'L2', 'Software Development', 'SD', 'L3', 'Frontend Team', 'FE', 'L4', 'Senior Engineer', 'SE', 'Senior', 'Grade A', 'GA', 'A'],
      ['Head Office', 'HO', 'L1', 'Technology', 'TECH', 'L2', 'QA', 'QA', 'L3', '', '', '', 'Junior Engineer', 'JE', 'Junior', 'Grade B', 'GB', 'B'],
      ['Regional', 'REG', 'L1', 'Sales', 'SALES', 'L2', 'North Region', 'NR', 'L3', '', '', '', 'Manager', 'MGR', 'Mid', '', '', ''],
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Org Structure');

    // Set column widths
    ws['!cols'] = Array(18).fill({ wch: 18 });

    XLSX.writeFile(wb, 'org_structure_template.xlsx');
  };

  const exportCurrentData = () => {
    const rows: any[][] = [
      ['division', 'divisionCode', 'businessUnit', 'businessUnitCode', 'department', 'departmentCode', 'subBranch', 'subBranchCode', 'designation', 'designationCode', 'pmsGrade', 'pmsGradeCode'],
    ];

    // Build hierarchy rows
    departments?.forEach(dept => {
      const bu = businessUnits?.find(b => b.id === dept.business_unit_id);
      const div = bu ? divisions?.find(d => d.id === bu.division_id) : null;
      const subs = subBranches?.filter(s => s.department_id === dept.id) || [];

      if (subs.length > 0) {
        subs.forEach(sub => {
          rows.push([
            div?.name || '', div?.code || '',
            bu?.name || '', bu?.code || '',
            dept.name, dept.code || '',
            sub.name, sub.code || '',
            '', '', '', '',
          ]);
        });
      } else {
        rows.push([
          div?.name || '', div?.code || '',
          bu?.name || '', bu?.code || '',
          dept.name, dept.code || '',
          '', '', '', '', '', '',
        ]);
      }
    });

    // Add standalone designations and grades as separate rows if not already covered
    const maxRows = Math.max(rows.length - 1, designations?.length || 0, pmsGrades?.length || 0);
    for (let i = 0; i < maxRows; i++) {
      const rowIdx = i + 1; // +1 for header
      if (rowIdx >= rows.length) {
        rows.push(['', '', '', '', '', '', '', '', '', '', '', '']);
      }
      if (designations && i < designations.length) {
        rows[rowIdx][8] = designations[i].name;
        rows[rowIdx][9] = designations[i].code || '';
      }
      if (pmsGrades && i < pmsGrades.length) {
        rows[rowIdx][10] = pmsGrades[i].name;
        rows[rowIdx][11] = pmsGrades[i].code || '';
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = Array(12).fill({ wch: 20 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Org Structure');
    XLSX.writeFile(wb, 'org_structure_export.xlsx');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrors([]);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const wb = XLSX.read(event.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

        if (rawData.length === 0) {
          setErrors(['File is empty or has no data rows.']);
          return;
        }

        const getValue = (row: Record<string, any>, possibleNames: string[]): string => {
          for (const name of possibleNames) {
            for (const key of Object.keys(row)) {
              if (key.toLowerCase().replace(/[\s_-]/g, '') === name.toLowerCase().replace(/[\s_-]/g, '')) {
                return String(row[key] || '').trim();
              }
            }
          }
          return '';
        };

        const parsed: OrgImportRow[] = rawData.map(row => ({
          division: getValue(row, ['division', 'divisionName']),
          divisionCode: getValue(row, ['divisionCode', 'divCode']),
          divisionLevel: getValue(row, ['divisionLevel', 'divLevel']),
          businessUnit: getValue(row, ['businessUnit', 'businessUnitName', 'bu', 'buName']),
          businessUnitCode: getValue(row, ['businessUnitCode', 'buCode']),
          businessUnitLevel: getValue(row, ['businessUnitLevel', 'buLevel']),
          department: getValue(row, ['department', 'departmentName', 'dept', 'deptName']),
          departmentCode: getValue(row, ['departmentCode', 'deptCode']),
          departmentLevel: getValue(row, ['departmentLevel', 'deptLevel']),
          subBranch: getValue(row, ['subBranch', 'subBranchName', 'branch']),
          subBranchCode: getValue(row, ['subBranchCode', 'branchCode']),
          subBranchLevel: getValue(row, ['subBranchLevel', 'branchLevel']),
          designation: getValue(row, ['designation', 'designationName', 'title', 'jobTitle']),
          designationCode: getValue(row, ['designationCode', 'desigCode']),
          designationLevel: getValue(row, ['designationLevel', 'desigLevel']),
          pmsGrade: getValue(row, ['pmsGrade', 'pmsGradeName', 'grade']),
          pmsGradeCode: getValue(row, ['pmsGradeCode', 'gradeCode']),
          pmsGradeLevel: getValue(row, ['pmsGradeLevel', 'gradeLevel']),
        }));

        // Filter out completely empty rows
        const filtered = parsed.filter(row =>
          row.division || row.businessUnit || row.department || row.subBranch || row.designation || row.pmsGrade
        );

        if (filtered.length === 0) {
          setErrors(['No valid data rows found. Please check column names match the template.']);
          return;
        }

        // Validate hierarchy: BU needs division, dept needs BU, sub-branch needs dept
        const validationErrors: string[] = [];
        filtered.forEach((row, i) => {
          if (row.businessUnit && !row.division) {
            validationErrors.push(`Row ${i + 2}: Business Unit "${row.businessUnit}" requires a Division`);
          }
          if (row.department && !row.businessUnit) {
            validationErrors.push(`Row ${i + 2}: Department "${row.department}" requires a Business Unit`);
          }
          if (row.subBranch && !row.department) {
            validationErrors.push(`Row ${i + 2}: Sub-Branch "${row.subBranch}" requires a Department`);
          }
        });

        setErrors(validationErrors);
        setImportData(filtered);
      } catch (err: any) {
        setErrors([`Failed to parse file: ${err.message}`]);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleImport = async () => {
    setIsImporting(true);
    setImportResult(null);

    const result = { divisions: 0, businessUnits: 0, departments: 0, subBranches: 0, designations: 0, pmsGrades: 0 };

    try {
      // Collect unique entries
      const uniqueDivisions = new Map<string, { code: string; level: string }>();
      const uniqueBUs = new Map<string, { code: string; level: string; division: string }>();
      const uniqueDepts = new Map<string, { code: string; level: string; businessUnit: string }>(); 
      const uniqueSubBranches = new Map<string, { code: string; level: string; department: string }>();
      const uniqueDesignations = new Map<string, { code: string; level: string }>();
      const uniquePmsGrades = new Map<string, { code: string; level: string }>();

      for (const row of importData) {
        if (row.division) uniqueDivisions.set(row.division, { code: row.divisionCode || '', level: row.divisionLevel || '' });
        if (row.businessUnit && row.division) uniqueBUs.set(row.businessUnit, { code: row.businessUnitCode || '', level: row.businessUnitLevel || '', division: row.division });
        if (row.department && row.businessUnit) uniqueDepts.set(row.department, { code: row.departmentCode || '', level: row.departmentLevel || '', businessUnit: row.businessUnit });
        if (row.subBranch && row.department) uniqueSubBranches.set(row.subBranch, { code: row.subBranchCode || '', level: row.subBranchLevel || '', department: row.department });
        if (row.designation) uniqueDesignations.set(row.designation, { code: row.designationCode || '', level: row.designationLevel || '' });
        if (row.pmsGrade) uniquePmsGrades.set(row.pmsGrade, { code: row.pmsGradeCode || '', level: row.pmsGradeLevel || '' });
      }

      // 1. Create divisions
      const divisionMap = new Map<string, string>(); // name -> id
      divisions?.forEach(d => divisionMap.set(d.name.toLowerCase(), d.id));

      for (const [name, { code, level }] of uniqueDivisions) {
        if (!divisionMap.has(name.toLowerCase())) {
          const { data, error } = await supabase.from('divisions').insert({ name: sanitizeText(name), code: code || null, level: level || null }).select('id').single();
          if (error) throw new Error(`Failed to create division "${name}": ${error.message}`);
          divisionMap.set(name.toLowerCase(), data.id);
          result.divisions++;
        } else {
          const updates: any = {};
          if (code) updates.code = code;
          if (level) updates.level = level;
          if (Object.keys(updates).length > 0) await supabase.from('divisions').update(updates).eq('id', divisionMap.get(name.toLowerCase())!);
        }
      }

      // 2. Create business units
      const buMap = new Map<string, string>();
      businessUnits?.forEach(b => buMap.set(b.name.toLowerCase(), b.id));

      for (const [name, { code, level, division }] of uniqueBUs) {
        if (!buMap.has(name.toLowerCase())) {
          const divId = divisionMap.get(division.toLowerCase());
          if (!divId) continue;
          const { data, error } = await supabase.from('business_units').insert({ name: sanitizeText(name), code: code || null, level: level || null, division_id: divId }).select('id').single();
          if (error) throw new Error(`Failed to create business unit "${name}": ${error.message}`);
          buMap.set(name.toLowerCase(), data.id);
          result.businessUnits++;
        } else {
          const updates: any = {};
          if (code) updates.code = code;
          if (level) updates.level = level;
          if (Object.keys(updates).length > 0) await supabase.from('business_units').update(updates).eq('id', buMap.get(name.toLowerCase())!);
        }
      }

      // 3. Create departments
      const deptMap = new Map<string, string>();
      departments?.forEach(d => deptMap.set(d.name.toLowerCase(), d.id));

      for (const [name, { code, level, businessUnit }] of uniqueDepts) {
        if (!deptMap.has(name.toLowerCase())) {
          const buId = buMap.get(businessUnit.toLowerCase());
          if (!buId) continue;
          const { data, error } = await supabase.from('departments').insert({ name: sanitizeText(name), code: code || null, level: level || null, business_unit_id: buId }).select('id').single();
          if (error) throw new Error(`Failed to create department "${name}": ${error.message}`);
          deptMap.set(name.toLowerCase(), data.id);
          result.departments++;
        } else {
          const updates: any = {};
          if (code) updates.code = code;
          if (level) updates.level = level;
          if (Object.keys(updates).length > 0) await supabase.from('departments').update(updates).eq('id', deptMap.get(name.toLowerCase())!);
        }
      }

      // 4. Create sub-branches
      const subMap = new Map<string, string>();
      subBranches?.forEach(s => subMap.set(s.name.toLowerCase(), s.id));

      for (const [name, { code, level, department }] of uniqueSubBranches) {
        if (!subMap.has(name.toLowerCase())) {
          const deptId = deptMap.get(department.toLowerCase());
          if (!deptId) continue;
          const { data, error } = await supabase.from('sub_branches').insert({ name: sanitizeText(name), code: code || null, level: level || null, department_id: deptId }).select('id').single();
          if (error) throw new Error(`Failed to create sub-branch "${name}": ${error.message}`);
          subMap.set(name.toLowerCase(), data.id);
          result.subBranches++;
        } else {
          const updates: any = {};
          if (code) updates.code = code;
          if (level) updates.level = level;
          if (Object.keys(updates).length > 0) await supabase.from('sub_branches').update(updates).eq('id', subMap.get(name.toLowerCase())!);
        }
      }

      // 5. Create designations
      const desigMap = new Map<string, string>();
      designations?.forEach(d => desigMap.set(d.name.toLowerCase(), d.id));

      for (const [name, { code, level }] of uniqueDesignations) {
        if (!desigMap.has(name.toLowerCase())) {
          const { error } = await supabase.from('designations').insert({ name: sanitizeText(name), code: code || null, level: level || null });
          if (error) throw new Error(`Failed to create designation "${name}": ${error.message}`);
          result.designations++;
        } else {
          const updates: any = {};
          if (code) updates.code = code;
          if (level) updates.level = level;
          if (Object.keys(updates).length > 0) await supabase.from('designations').update(updates).eq('id', desigMap.get(name.toLowerCase())!);
        }
      }

      // 6. Create PMS grades
      const gradeMap = new Map<string, string>();
      pmsGrades?.forEach(g => gradeMap.set(g.name.toLowerCase(), g.id));

      for (const [name, { code, level }] of uniquePmsGrades) {
        if (!gradeMap.has(name.toLowerCase())) {
          const { error } = await supabase.from('pms_grades').insert({ name: sanitizeText(name), code: code || null, level: level || null });
          if (error) throw new Error(`Failed to create PMS grade "${name}": ${error.message}`);
          result.pmsGrades++;
        } else {
          const updates: any = {};
          if (code) updates.code = code;
          if (level) updates.level = level;
          if (Object.keys(updates).length > 0) await supabase.from('pms_grades').update(updates).eq('id', gradeMap.get(name.toLowerCase())!);
        }
      }

      // Refresh all caches
      queryClient.invalidateQueries({ queryKey: ['divisions'] });
      queryClient.invalidateQueries({ queryKey: ['business-units'] });
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      queryClient.invalidateQueries({ queryKey: ['sub-branches'] });
      queryClient.invalidateQueries({ queryKey: ['designations'] });
      queryClient.invalidateQueries({ queryKey: ['pms-grades'] });

      setImportResult(result);
      const total = Object.values(result).reduce((a, b) => a + b, 0);
      toast({
        title: 'Import Complete',
        description: total > 0
          ? `Created ${total} organization entries.`
          : 'All entries already exist. Codes updated where provided.',
      });
    } catch (err: any) {
      toast({ title: 'Import Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsImporting(false);
    }
  };

  // Compute preview summary
  const summary = importData.length > 0 ? {
    divisions: new Set(importData.map(r => r.division).filter(Boolean)).size,
    businessUnits: new Set(importData.map(r => r.businessUnit).filter(Boolean)).size,
    departments: new Set(importData.map(r => r.department).filter(Boolean)).size,
    subBranches: new Set(importData.map(r => r.subBranch).filter(Boolean)).size,
    designations: new Set(importData.map(r => r.designation).filter(Boolean)).size,
    pmsGrades: new Set(importData.map(r => r.pmsGrade).filter(Boolean)).size,
  } : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Organization Structure Import
          </CardTitle>
          <CardDescription>Upload an Excel file to bulk import divisions, business units, departments, sub-branches, designations and PMS grades</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
            <Button variant="secondary" onClick={exportCurrentData}>
              <Download className="h-4 w-4 mr-2" />
              Export Current Data
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
            <p className="font-medium mb-2">Columns (all optional — include whichever you need):</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
              <div>
                <p className="font-medium mt-2 text-foreground">Hierarchy</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><code>division</code> / <code>divisionCode</code></li>
                  <li><code>businessUnit</code> / <code>businessUnitCode</code></li>
                  <li><code>department</code> / <code>departmentCode</code></li>
                  <li><code>subBranch</code> / <code>subBranchCode</code></li>
                </ul>
              </div>
              <div>
                <p className="font-medium mt-2 text-foreground">Classifications</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><code>designation</code> / <code>designationCode</code></li>
                  <li><code>pmsGrade</code> / <code>pmsGradeCode</code></li>
                </ul>
              </div>
            </div>
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Hierarchy rules:</strong> Business Unit requires a Division, Department requires a Business Unit, Sub-Branch requires a Department.
                Existing entries are skipped (matched by name). Codes are updated if provided.
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
              {errors.map((err, i) => <li key={i}>{err}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {importResult && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Import Complete</AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap gap-2 mt-1">
              {importResult.divisions > 0 && <Badge>{importResult.divisions} Divisions</Badge>}
              {importResult.businessUnits > 0 && <Badge>{importResult.businessUnits} Business Units</Badge>}
              {importResult.departments > 0 && <Badge>{importResult.departments} Departments</Badge>}
              {importResult.subBranches > 0 && <Badge>{importResult.subBranches} Sub-Branches</Badge>}
              {importResult.designations > 0 && <Badge>{importResult.designations} Designations</Badge>}
              {importResult.pmsGrades > 0 && <Badge>{importResult.pmsGrades} PMS Grades</Badge>}
              {Object.values(importResult).every(v => v === 0) && <span>All entries already exist.</span>}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {importData.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Preview</CardTitle>
              <CardDescription>
                {importData.length} rows parsed
                {summary && (
                  <span className="ml-2">
                    — {summary.divisions} divisions, {summary.businessUnits} BUs, {summary.departments} depts, {summary.subBranches} sub-branches, {summary.designations} designations, {summary.pmsGrades} grades
                  </span>
                )}
              </CardDescription>
            </div>
            <Button onClick={handleImport} disabled={isImporting || errors.length > 0}>
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                `Import Organization Data`
              )}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Division</TableHead>
                    <TableHead>Div Code</TableHead>
                    <TableHead>Div Level</TableHead>
                    <TableHead>Business Unit</TableHead>
                    <TableHead>BU Code</TableHead>
                    <TableHead>BU Level</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Dept Code</TableHead>
                    <TableHead>Dept Level</TableHead>
                    <TableHead>Sub-Branch</TableHead>
                    <TableHead>SB Code</TableHead>
                    <TableHead>SB Level</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Des Code</TableHead>
                    <TableHead>Des Level</TableHead>
                    <TableHead>PMS Grade</TableHead>
                    <TableHead>Grade Code</TableHead>
                    <TableHead>Grade Level</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importData.slice(0, 20).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{row.division || '-'}</TableCell>
                      <TableCell>{row.divisionCode || '-'}</TableCell>
                      <TableCell>{row.divisionLevel || '-'}</TableCell>
                      <TableCell>{row.businessUnit || '-'}</TableCell>
                      <TableCell>{row.businessUnitCode || '-'}</TableCell>
                      <TableCell>{row.businessUnitLevel || '-'}</TableCell>
                      <TableCell>{row.department || '-'}</TableCell>
                      <TableCell>{row.departmentCode || '-'}</TableCell>
                      <TableCell>{row.departmentLevel || '-'}</TableCell>
                      <TableCell>{row.subBranch || '-'}</TableCell>
                      <TableCell>{row.subBranchCode || '-'}</TableCell>
                      <TableCell>{row.subBranchLevel || '-'}</TableCell>
                      <TableCell>{row.designation || '-'}</TableCell>
                      <TableCell>{row.designationCode || '-'}</TableCell>
                      <TableCell>{row.designationLevel || '-'}</TableCell>
                      <TableCell>{row.pmsGrade || '-'}</TableCell>
                      <TableCell>{row.pmsGradeCode || '-'}</TableCell>
                      <TableCell>{row.pmsGradeLevel || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {importData.length > 20 && (
                <p className="text-sm text-muted-foreground mt-2">
                  Showing first 20 of {importData.length} rows
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
