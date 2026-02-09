import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDivisions, useBusinessUnits, useDepartments, useSubBranches, useDesignations, usePmsGrades, useLevels } from '@/hooks/useOrganization';
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
  businessUnit?: string;
  businessUnitCode?: string;
  department?: string;
  departmentCode?: string;
  subBranch?: string;
  subBranchCode?: string;
  designation?: string;
  designationCode?: string;
  pmsGrade?: string;
  pmsGradeCode?: string;
  level?: string;
  levelCode?: string;
}

export default function OrgStructureImport() {
  const queryClient = useQueryClient();
  const { data: divisions } = useDivisions();
  const { data: businessUnits } = useBusinessUnits();
  const { data: departments } = useDepartments();
  const { data: subBranches } = useSubBranches();
  const { data: designations } = useDesignations();
  const { data: pmsGrades } = usePmsGrades();
  const { data: levels } = useLevels();
  const { toast } = useToast();

  const [importData, setImportData] = useState<OrgImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    divisions: number;
    businessUnits: number;
    departments: number;
    subBranches: number;
    designations: number;
    pmsGrades: number;
    levels: number;
  } | null>(null);

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['division', 'divisionCode', 'businessUnit', 'businessUnitCode', 'department', 'departmentCode', 'subBranch', 'subBranchCode', 'designation', 'designationCode', 'pmsGrade', 'pmsGradeCode', 'level', 'levelCode'],
      ['Head Office', 'HO', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['Regional', 'REG', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['', '', 'Technology', 'TECH', '', '', '', '', '', '', '', '', '', ''],
      ['', '', 'Sales', 'SALES', '', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', 'Software Dev', 'SD', '', '', '', '', '', '', '', ''],
      ['', '', '', '', 'QA', 'QA', '', '', '', '', '', '', '', ''],
      ['Head Office', 'HO', 'Technology', 'TECH', 'Frontend', 'FE', 'Team A', 'TA', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', 'Senior Engineer', 'SE', 'Grade A', 'GA', 'Level 1', 'L1'],
      ['', '', '', '', '', '', '', '', 'Manager', 'MGR', 'Grade B', 'GB', 'Level 2', 'L2'],
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Org Structure');

    // Set column widths
    ws['!cols'] = Array(14).fill({ wch: 20 });

    XLSX.writeFile(wb, 'org_structure_template.xlsx');
  };

  const exportCurrentData = () => {
    const rows: any[][] = [
      ['division', 'divisionCode', 'businessUnit', 'businessUnitCode', 'department', 'departmentCode', 'subBranch', 'subBranchCode', 'designation', 'designationCode', 'pmsGrade', 'pmsGradeCode', 'level', 'levelCode'],
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
            '', '', '', '', '', '',
          ]);
        });
      } else {
        rows.push([
          div?.name || '', div?.code || '',
          bu?.name || '', bu?.code || '',
          dept.name, dept.code || '',
          '', '', '', '', '', '', '', '',
        ]);
      }
    });

    // Add standalone designations and grades as separate rows if not already covered
    const maxRows = Math.max(rows.length - 1, designations?.length || 0, pmsGrades?.length || 0, levels?.length || 0);
    for (let i = 0; i < maxRows; i++) {
      const rowIdx = i + 1; // +1 for header
      if (rowIdx >= rows.length) {
        rows.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '']);
      }
      if (designations && i < designations.length) {
        rows[rowIdx][8] = designations[i].name;
        rows[rowIdx][9] = designations[i].code || '';
      }
      if (pmsGrades && i < pmsGrades.length) {
        rows[rowIdx][10] = pmsGrades[i].name;
        rows[rowIdx][11] = pmsGrades[i].code || '';
      }
      if (levels && i < levels.length) {
        rows[rowIdx][12] = levels[i].name;
        rows[rowIdx][13] = levels[i].code || '';
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = Array(14).fill({ wch: 20 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Org Structure');
    XLSX.writeFile(wb, 'org_structure_export.xlsx');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrors([]);
    setWarnings([]);
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
          businessUnit: getValue(row, ['businessUnit', 'businessUnitName', 'bu', 'buName']),
          businessUnitCode: getValue(row, ['businessUnitCode', 'buCode']),
          department: getValue(row, ['department', 'departmentName', 'dept', 'deptName']),
          departmentCode: getValue(row, ['departmentCode', 'deptCode']),
          subBranch: getValue(row, ['subBranch', 'subBranchName', 'branch']),
          subBranchCode: getValue(row, ['subBranchCode', 'branchCode']),
          designation: getValue(row, ['designation', 'designationName', 'title', 'jobTitle']),
          designationCode: getValue(row, ['designationCode', 'desigCode']),
          pmsGrade: getValue(row, ['pmsGrade', 'pmsGradeName', 'grade']),
          pmsGradeCode: getValue(row, ['pmsGradeCode', 'gradeCode']),
          level: getValue(row, ['level', 'levelName', 'employeeLevel']),
          levelCode: getValue(row, ['levelCode', 'lvlCode']),
        }));

        // Filter out completely empty rows
        const filtered = parsed.filter(row =>
          row.division || row.businessUnit || row.department || row.subBranch || row.designation || row.pmsGrade || row.level
        );

        if (filtered.length === 0) {
          setErrors(['No valid data rows found. Please check column names match the template.']);
          return;
        }

        // Smart parent resolution: collect all entities from file, then check DB for unresolved parents
        const fileDivisions = new Set(filtered.map(r => r.division?.toLowerCase()).filter(Boolean) as string[]);
        const fileBUs = new Set(filtered.map(r => r.businessUnit?.toLowerCase()).filter(Boolean) as string[]);
        const fileDepts = new Set(filtered.map(r => r.department?.toLowerCase()).filter(Boolean) as string[]);
        const dbDivisions = divisions?.map(d => d.name.toLowerCase()) || [];
        const dbBUs = businessUnits?.map(b => b.name.toLowerCase()) || [];
        const dbDepts = departments?.map(d => d.name.toLowerCase()) || [];
        const allDivisions = new Set([...fileDivisions, ...dbDivisions]);
        const allBUs = new Set([...fileBUs, ...dbBUs]);
        const allDepts = new Set([...fileDepts, ...dbDepts]);

        const importWarnings: string[] = [];

        // BUs without same-row division: check if parent can be resolved
        const busWithoutDiv = new Set<string>();
        filtered.forEach(row => {
          if (row.businessUnit && !row.division) {
            if (!businessUnits?.some(b => b.name.toLowerCase() === row.businessUnit!.toLowerCase())) {
              // New BU without same-row parent
              if (allDivisions.size === 1) {
                // Auto-assign — will be handled in import logic
              } else if (allDivisions.size === 0) {
                busWithoutDiv.add(row.businessUnit);
              } else {
                busWithoutDiv.add(row.businessUnit);
              }
            }
          }
        });
        if (busWithoutDiv.size > 0 && allDivisions.size !== 1) {
          importWarnings.push(`Business Units without a Division specified: ${[...busWithoutDiv].join(', ')}. ${allDivisions.size === 0 ? 'No divisions found — these will be skipped.' : 'Multiple divisions exist — these will be skipped unless only one division is available.'}`);
        }

        // Depts without same-row BU
        const deptsWithoutBU = new Set<string>();
        filtered.forEach(row => {
          if (row.department && !row.businessUnit) {
            if (!departments?.some(d => d.name.toLowerCase() === row.department!.toLowerCase())) {
              if (allBUs.size !== 1) deptsWithoutBU.add(row.department);
            }
          }
        });
        if (deptsWithoutBU.size > 0 && allBUs.size !== 1) {
          importWarnings.push(`Departments without a Business Unit specified: ${[...deptsWithoutBU].join(', ')}. ${allBUs.size === 0 ? 'No business units found — these will be skipped.' : 'Multiple business units exist — these will be skipped unless only one BU is available.'}`);
        }

        // Sub-branches without same-row dept
        const subsWithoutDept = new Set<string>();
        filtered.forEach(row => {
          if (row.subBranch && !row.department) {
            if (!subBranches?.some(s => s.name.toLowerCase() === row.subBranch!.toLowerCase())) {
              if (allDepts.size !== 1) subsWithoutDept.add(row.subBranch);
            }
          }
        });
        if (subsWithoutDept.size > 0 && allDepts.size !== 1) {
          importWarnings.push(`Sub-Branches without a Department specified: ${[...subsWithoutDept].join(', ')}. ${allDepts.size === 0 ? 'No departments found — these will be skipped.' : 'Multiple departments exist — these will be skipped unless only one department is available.'}`);
        }

        setWarnings(importWarnings);
        setErrors([]);
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

    const result = { divisions: 0, businessUnits: 0, departments: 0, subBranches: 0, designations: 0, pmsGrades: 0, levels: 0 };

    try {
      // Collect unique entries
      const uniqueDivisions = new Map<string, string>(); // name -> code
      const uniqueBUs = new Map<string, { code: string; division: string }>(); // name -> {code, division}
      const uniqueDepts = new Map<string, { code: string; businessUnit: string }>(); 
      const uniqueSubBranches = new Map<string, { code: string; department: string }>();
      const uniqueDesignations = new Map<string, string>();
      const uniquePmsGrades = new Map<string, string>();
      const uniqueLevels = new Map<string, string>();
      // First pass: collect all divisions from file
      for (const row of importData) {
        if (row.division) uniqueDivisions.set(row.division, row.divisionCode || '');
        if (row.designation) uniqueDesignations.set(row.designation, row.designationCode || '');
        if (row.pmsGrade) uniquePmsGrades.set(row.pmsGrade, row.pmsGradeCode || '');
        if (row.level) uniqueLevels.set(row.level, row.levelCode || '');
      }

      // Build division lookup (file + DB) for parent resolution
      const allDivNames = new Set<string>();
      uniqueDivisions.forEach((_, name) => allDivNames.add(name.toLowerCase()));
      divisions?.forEach(d => allDivNames.add(d.name.toLowerCase()));

      const allBUNames = new Set<string>();
      const allDeptNames = new Set<string>();

      // Second pass: collect BUs with smart parent resolution
      for (const row of importData) {
        if (row.businessUnit) {
          let resolvedDivision = row.division || '';
          if (!resolvedDivision) {
            // Try auto-assign if exactly one division exists
            if (allDivNames.size === 1) {
              const singleDiv = [...allDivNames][0];
              // Find original-case name from file or DB
              resolvedDivision = [...uniqueDivisions.keys()].find(n => n.toLowerCase() === singleDiv) ||
                divisions?.find(d => d.name.toLowerCase() === singleDiv)?.name || '';
            }
          }
          if (resolvedDivision) {
            uniqueBUs.set(row.businessUnit, { code: row.businessUnitCode || '', division: resolvedDivision });
          }
          allBUNames.add(row.businessUnit.toLowerCase());
        }
      }
      businessUnits?.forEach(b => allBUNames.add(b.name.toLowerCase()));

      // Third pass: collect Depts with smart parent resolution
      for (const row of importData) {
        if (row.department) {
          let resolvedBU = row.businessUnit || '';
          if (!resolvedBU) {
            if (allBUNames.size === 1) {
              const singleBU = [...allBUNames][0];
              resolvedBU = [...uniqueBUs.keys()].find(n => n.toLowerCase() === singleBU) ||
                businessUnits?.find(b => b.name.toLowerCase() === singleBU)?.name || '';
            }
          }
          if (resolvedBU) {
            uniqueDepts.set(row.department, { code: row.departmentCode || '', businessUnit: resolvedBU });
          }
          allDeptNames.add(row.department.toLowerCase());
        }
      }
      departments?.forEach(d => allDeptNames.add(d.name.toLowerCase()));

      // Fourth pass: collect Sub-Branches with smart parent resolution
      for (const row of importData) {
        if (row.subBranch) {
          let resolvedDept = row.department || '';
          if (!resolvedDept) {
            if (allDeptNames.size === 1) {
              const singleDept = [...allDeptNames][0];
              resolvedDept = [...uniqueDepts.keys()].find(n => n.toLowerCase() === singleDept) ||
                departments?.find(d => d.name.toLowerCase() === singleDept)?.name || '';
            }
          }
          if (resolvedDept) {
            uniqueSubBranches.set(row.subBranch, { code: row.subBranchCode || '', department: resolvedDept });
          }
        }
      }

      // 1. Create divisions
      const divisionMap = new Map<string, string>(); // name -> id
      divisions?.forEach(d => divisionMap.set(d.name.toLowerCase(), d.id));

      for (const [name, code] of uniqueDivisions) {
        if (!divisionMap.has(name.toLowerCase())) {
          const { data, error } = await supabase.from('divisions').insert({ name: sanitizeText(name), code: code || null }).select('id').single();
          if (error) throw new Error(`Failed to create division "${name}": ${error.message}`);
          divisionMap.set(name.toLowerCase(), data.id);
          result.divisions++;
        } else if (code) {
          // Update code if provided
          await supabase.from('divisions').update({ code }).eq('id', divisionMap.get(name.toLowerCase())!);
        }
      }

      // 2. Create business units
      const buMap = new Map<string, string>();
      businessUnits?.forEach(b => buMap.set(b.name.toLowerCase(), b.id));

      for (const [name, { code, division }] of uniqueBUs) {
        if (!buMap.has(name.toLowerCase())) {
          const divId = divisionMap.get(division.toLowerCase());
          if (!divId) continue;
          const { data, error } = await supabase.from('business_units').insert({ name: sanitizeText(name), code: code || null, division_id: divId }).select('id').single();
          if (error) throw new Error(`Failed to create business unit "${name}": ${error.message}`);
          buMap.set(name.toLowerCase(), data.id);
          result.businessUnits++;
        } else if (code) {
          await supabase.from('business_units').update({ code }).eq('id', buMap.get(name.toLowerCase())!);
        }
      }

      // 3. Create departments
      const deptMap = new Map<string, string>();
      departments?.forEach(d => deptMap.set(d.name.toLowerCase(), d.id));

      for (const [name, { code, businessUnit }] of uniqueDepts) {
        if (!deptMap.has(name.toLowerCase())) {
          const buId = buMap.get(businessUnit.toLowerCase());
          if (!buId) continue;
          const { data, error } = await supabase.from('departments').insert({ name: sanitizeText(name), code: code || null, business_unit_id: buId }).select('id').single();
          if (error) throw new Error(`Failed to create department "${name}": ${error.message}`);
          deptMap.set(name.toLowerCase(), data.id);
          result.departments++;
        } else if (code) {
          await supabase.from('departments').update({ code }).eq('id', deptMap.get(name.toLowerCase())!);
        }
      }

      // 4. Create sub-branches
      const subMap = new Map<string, string>();
      subBranches?.forEach(s => subMap.set(s.name.toLowerCase(), s.id));

      for (const [name, { code, department }] of uniqueSubBranches) {
        if (!subMap.has(name.toLowerCase())) {
          const deptId = deptMap.get(department.toLowerCase());
          if (!deptId) continue;
          const { data, error } = await supabase.from('sub_branches').insert({ name: sanitizeText(name), code: code || null, department_id: deptId }).select('id').single();
          if (error) throw new Error(`Failed to create sub-branch "${name}": ${error.message}`);
          subMap.set(name.toLowerCase(), data.id);
          result.subBranches++;
        } else if (code) {
          await supabase.from('sub_branches').update({ code }).eq('id', subMap.get(name.toLowerCase())!);
        }
      }

      // 5. Create designations
      const desigMap = new Map<string, string>();
      designations?.forEach(d => desigMap.set(d.name.toLowerCase(), d.id));

      for (const [name, code] of uniqueDesignations) {
        if (!desigMap.has(name.toLowerCase())) {
          const { error } = await supabase.from('designations').insert({ name: sanitizeText(name), code: code || null });
          if (error) throw new Error(`Failed to create designation "${name}": ${error.message}`);
          result.designations++;
        } else if (code) {
          await supabase.from('designations').update({ code }).eq('id', desigMap.get(name.toLowerCase())!);
        }
      }

      // 6. Create PMS grades
      const gradeMap = new Map<string, string>();
      pmsGrades?.forEach(g => gradeMap.set(g.name.toLowerCase(), g.id));

      for (const [name, code] of uniquePmsGrades) {
        if (!gradeMap.has(name.toLowerCase())) {
          const { error } = await supabase.from('pms_grades').insert({ name: sanitizeText(name), code: code || null });
          if (error) throw new Error(`Failed to create PMS grade "${name}": ${error.message}`);
          result.pmsGrades++;
        } else if (code) {
          await supabase.from('pms_grades').update({ code }).eq('id', gradeMap.get(name.toLowerCase())!);
        }
      }

      // 7. Create levels
      const levelMap = new Map<string, string>();
      levels?.forEach((l: any) => levelMap.set(l.name.toLowerCase(), l.id));

      for (const [name, code] of uniqueLevels) {
        if (!levelMap.has(name.toLowerCase())) {
          const { error } = await supabase.from('levels' as any).insert({ name: sanitizeText(name), code: code || null });
          if (error) throw new Error(`Failed to create level "${name}": ${error.message}`);
          result.levels++;
        } else if (code) {
          await supabase.from('levels' as any).update({ code }).eq('id', levelMap.get(name.toLowerCase())!);
        }
      }

      // Refresh all caches
      queryClient.invalidateQueries({ queryKey: ['divisions'] });
      queryClient.invalidateQueries({ queryKey: ['business-units'] });
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      queryClient.invalidateQueries({ queryKey: ['sub-branches'] });
      queryClient.invalidateQueries({ queryKey: ['designations'] });
      queryClient.invalidateQueries({ queryKey: ['pms-grades'] });
      queryClient.invalidateQueries({ queryKey: ['levels'] });

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
    levels: new Set(importData.map(r => r.level).filter(Boolean)).size,
  } : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Organization Structure Import
          </CardTitle>
          <CardDescription>Upload an Excel file to bulk import divisions, business units, departments, sub-branches, designations, PMS grades and levels. Each column can be filled independently — rows don't need to be connected across all columns.</CardDescription>
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
                  <li><code>level</code> / <code>levelCode</code></li>
                </ul>
              </div>
            </div>
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Flexible import:</strong> You can add all Divisions in separate rows, all Business Units in other rows, etc. — they don't need to be on the same row.
                If a child entity (e.g. Business Unit) doesn't have a parent on the same row, it will be auto-assigned if only one parent exists. Existing entries are matched by name and codes are updated if provided.
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

      {warnings.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Warnings (import will proceed without these items)</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside mt-2 max-h-32 overflow-auto">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
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
              {importResult.levels > 0 && <Badge>{importResult.levels} Levels</Badge>}
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
                    — {summary.divisions} divisions, {summary.businessUnits} BUs, {summary.departments} depts, {summary.subBranches} sub-branches, {summary.designations} designations, {summary.pmsGrades} grades, {summary.levels} levels
                  </span>
                )}
              </CardDescription>
            </div>
            <Button onClick={handleImport} disabled={isImporting}>
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
                    <TableHead>Business Unit</TableHead>
                    <TableHead>BU Code</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Dept Code</TableHead>
                    <TableHead>Sub-Branch</TableHead>
                    <TableHead>SB Code</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead>Des Code</TableHead>
                    <TableHead>PMS Grade</TableHead>
                    <TableHead>Grade Code</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Level Code</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importData.slice(0, 20).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{row.division || '-'}</TableCell>
                      <TableCell>{row.divisionCode || '-'}</TableCell>
                      <TableCell>{row.businessUnit || '-'}</TableCell>
                      <TableCell>{row.businessUnitCode || '-'}</TableCell>
                      <TableCell>{row.department || '-'}</TableCell>
                      <TableCell>{row.departmentCode || '-'}</TableCell>
                      <TableCell>{row.subBranch || '-'}</TableCell>
                      <TableCell>{row.subBranchCode || '-'}</TableCell>
                      <TableCell>{row.designation || '-'}</TableCell>
                      <TableCell>{row.designationCode || '-'}</TableCell>
                      <TableCell>{row.pmsGrade || '-'}</TableCell>
                      <TableCell>{row.pmsGradeCode || '-'}</TableCell>
                      <TableCell>{row.level || '-'}</TableCell>
                      <TableCell>{row.levelCode || '-'}</TableCell>
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
