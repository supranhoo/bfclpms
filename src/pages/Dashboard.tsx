import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { FILTER_PARAM_NAMES } from '@/hooks/useUrlFilterState';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useSkipLevelTeamMembers } from '@/hooks/useOrganization';
import { DashboardSkeleton } from '@/components/ui/LoadingSkeletons';
import { useDefaultPeriodSelection, type PeriodSelection } from '@/components/ui/ReviewPeriodSelectorEnhanced';
import { MentionedKpiSheet } from '@/components/review/MentionedKpiSheet';
import { ViewModeToggle, ViewMode } from '@/components/review/ViewModeToggle';
import { EmployeeSelectorGrid } from '@/components/review/EmployeeSelectorGrid';
import { UnifiedScorecard } from '@/components/review/UnifiedScorecard';
import { AlertCircle, RefreshCw, LogOut, Plus } from 'lucide-react';
import { useDashboardKraPermissions } from '@/hooks/useDashboardKraPermissions';
import { AdminKpiCreateDialog } from '@/components/admin/AdminKpiCreateDialog';

interface EmployeeProfile {
  id: string;
  full_name: string | null;
  email: string;
  designation: string | null;
  employee_code: string | null;
  avatar_url: string | null;
  department_id: string | null;
  reporting_manager_id: string | null;
  relationship?: 'direct' | 'indirect';
  departments?: { id: string; name: string; code: string | null } | null;
}

/**
 * Resolve the relationship between the current user and an employee
 * by checking the actual reporting chain in the database.
 * Returns the employee with the `relationship` field set.
 */
async function resolveRelationship(
  employee: EmployeeProfile,
  currentUserId: string
): Promise<EmployeeProfile> {
  // Already tagged by grid — trust it
  if (employee.relationship) return employee;

  // Direct manager check
  if (employee.reporting_manager_id === currentUserId) {
    return { ...employee, relationship: 'direct' };
  }

  // Skip-level check: fetch the employee's manager's reporting_manager_id
  if (employee.reporting_manager_id) {
    const { data: managerProfile } = await supabase
      .from('profiles')
      .select('reporting_manager_id')
      .eq('id', employee.reporting_manager_id)
      .single();

    if (managerProfile?.reporting_manager_id === currentUserId) {
      return { ...employee, relationship: 'indirect' };
    }
  }

  // Default: treat as direct (admin/hr viewing non-chain employee)
  return { ...employee, relationship: 'direct' };
}

export default function Dashboard() {
  const { profile, effectiveRole: role, loading, profileError, signOut, fetchProfile, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const defaultPeriodSelection = useDefaultPeriodSelection();
  const [periodSelection, setPeriodSelection] = useState<PeriodSelection>(defaultPeriodSelection);

  // View mode state for unified dashboard
  const [viewMode, setViewMode] = useState<ViewMode>('self');
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfile | null>(null);
  const [autoOpenKpiId, setAutoOpenKpiId] = useState<string | null>(null);
  const [mentionedKpi, setMentionedKpi] = useState<{ kpiId: string; employeeId: string } | null>(null);
  const deepLinkProcessedRef = useRef(false);
  const [addKraOpen, setAddKraOpen] = useState(false);
  const { canAdd: canAddKra } = useDashboardKraPermissions();

  // Detect skip-level subordinates
  const { data: skipLevelMembers } = useSkipLevelTeamMembers(profile?.id);
  const hasSkipLevelSubordinates = (skipLevelMembers?.length || 0) > 0;

  // Calculate available modes based on role
  const availableModes = useMemo(() => {
    const modes: ViewMode[] = ['self'];
    if (['manager', 'admin', 'management'].includes(role || '') || hasSkipLevelSubordinates) modes.push('team');
    if (role === 'hr_pms' || role === 'admin') {
      modes.push('pending_self_review', 'pending_manager_review', 'pending_skip_review');
    }
    if (role === 'hr_pms' || role === 'admin') modes.push('hr_pms');
    if (['auditor', 'admin'].includes(role || '')) modes.push('audit');
    if (['management', 'admin'].includes(role || '')) modes.push('management');
    return modes;
  }, [role, hasSkipLevelSubordinates]);

  // Handle mentioned_kpi deep-link (read-only @mention access)
  useEffect(() => {
    const mentionedKpiParam = searchParams.get('mentioned_kpi');
    const mentionedEmployeeParam = searchParams.get('mentioned_employee');
    if (mentionedKpiParam && mentionedEmployeeParam) {
      setMentionedKpi({ kpiId: mentionedKpiParam, employeeId: mentionedEmployeeParam });
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('mentioned_kpi');
        next.delete('mentioned_employee');
        return next;
      }, { replace: true });
    }
  }, [searchParams]);

  // Initialize from URL query param
  const viewParam = searchParams.get('view');
  const exploreParam = searchParams.get('explore');
  const exploreMode = (viewMode === 'audit' || viewMode === 'management') && exploreParam === '1';
  useEffect(() => {
    if (!viewParam) return;
    const mappedMode = (viewParam === 'skip_level' ? 'team' : viewParam) as ViewMode;
    if (availableModes.includes(mappedMode) && mappedMode !== viewMode) {
      setViewMode(mappedMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewParam, availableModes]);

  // Deep-link: auto-open KPI from URL params (runs once per mount)
  useEffect(() => {
    if (deepLinkProcessedRef.current) return;

    const kpiParam = searchParams.get('kpi');
    const panelParam = searchParams.get('panel');
    const employeeParam = searchParams.get('employee');
    const periodParam = searchParams.get('period');
    const yearParam = searchParams.get('year');

    // Cross-user deep-link (reviewer flow)
    if (employeeParam && kpiParam) {
      deepLinkProcessedRef.current = true;
      const fetchAndSelectEmployee = async () => {
        if (periodParam && yearParam) {
          const yr = parseInt(yearParam, 10);
          setPeriodSelection({
            mode: 'single',
            selectedMonth: periodParam,
            selectedYear: yr,
            months: [periodParam],
            periodRanges: [{ month: periodParam, year: yr }],
          });
        }

        const { data: empProfile } = await supabase
          .from('profiles')
          .select('id, full_name, email, designation, employee_code, avatar_url, department_id, reporting_manager_id, departments(id, name, code)')
          .eq('id', employeeParam)
          .single();

        if (empProfile) {
          const viewParam = searchParams.get('view') as ViewMode | null;
          if (viewParam && availableModes.includes(viewParam)) {
            setViewMode(viewParam);
          } else if (viewMode === 'self') {
            setViewMode('team');
          }
          const resolved = await resolveRelationship(empProfile as EmployeeProfile, profile!.id);
          handleSelectEmployee(resolved, kpiParam);
        }

        // Only clean up one-time deep-link params; keep employee for persistence
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete('kpi');
          next.delete('panel');
          next.delete('period');
          next.delete('year');
          return next;
        }, { replace: true });
      };
      fetchAndSelectEmployee();
      return;
    }

    // Employee-only deep-link (e.g. from Direct Reportees monitor)
    if (employeeParam && !kpiParam) {
      deepLinkProcessedRef.current = true;
      const fetchAndSelectEmployee = async () => {
        if (periodParam && yearParam) {
          const yr = parseInt(yearParam, 10);
          setPeriodSelection({
            mode: 'single',
            selectedMonth: periodParam,
            selectedYear: yr,
            months: [periodParam],
            periodRanges: [{ month: periodParam, year: yr }],
          });
        }

        const { data: empProfile } = await supabase
          .from('profiles')
          .select('id, full_name, email, designation, employee_code, avatar_url, department_id, reporting_manager_id, departments(id, name, code)')
          .eq('id', employeeParam)
          .single();

        if (empProfile) {
          const viewParam = searchParams.get('view') as ViewMode | null;
          if (viewParam && availableModes.includes(viewParam)) {
            setViewMode(viewParam);
          } else if (viewMode === 'self') {
            setViewMode('team');
          }
          const resolved = await resolveRelationship(empProfile as EmployeeProfile, profile!.id);
          handleSelectEmployee(resolved);
        }

        // Only clean up one-time params; keep employee for persistence
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete('period');
          next.delete('year');
          return next;
        }, { replace: true });
      };
      fetchAndSelectEmployee();
      return;
    }

    // Self-view deep-link: pass kpiId to UnifiedScorecard
    if (kpiParam) {
      deepLinkProcessedRef.current = true;
      setAutoOpenKpiId(kpiParam);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('kpi');
        next.delete('panel');
        return next;
      }, { replace: true });
    }
  }, [searchParams]);

  // Sync viewMode to URL query param for refresh persistence
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (viewMode === 'self') {
        next.delete('view');
      } else {
        next.set('view', viewMode);
      }
      return next;
    }, { replace: true });
  }, [viewMode]);

  // Persist selected employee in URL for refresh restoration
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (selectedEmployee) {
        next.set('employee', selectedEmployee.id);
      } else {
        next.delete('employee');
      }
      return next;
    }, { replace: true });
  }, [selectedEmployee]);

  // Restore selected employee from URL on mount (when no deep-link processing happened)
  useEffect(() => {
    if (deepLinkProcessedRef.current) return;
    const employeeParam = searchParams.get('employee');
    const kpiParam = searchParams.get('kpi');
    // Only restore if employee param exists, no KPI deep-link is being processed, and no employee is already selected
    if (employeeParam && !kpiParam && !selectedEmployee && viewMode !== 'self') {
      deepLinkProcessedRef.current = true;
      const restoreEmployee = async () => {
        const { data: empProfile } = await supabase
          .from('profiles')
          .select('id, full_name, email, designation, employee_code, avatar_url, department_id, reporting_manager_id, departments(id, name, code)')
          .eq('id', employeeParam)
          .single();
        if (empProfile) {
          const resolved = await resolveRelationship(empProfile as EmployeeProfile, profile!.id);
          setSelectedEmployee(resolved);
        }
      };
      restoreEmployee();
    }
  }, []);

  // Handle mode change
  const handleModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    setSelectedEmployee(null);
    setAutoOpenKpiId(null);
    // v2.64.4 — Lock out late deep-link restore effects from retroactively
    // pulling the previous panel's employee back after a manual mode change.
    deepLinkProcessedRef.current = true;
    // Clear filter params AND the stale `employee` param synchronously in one
    // batched URL write so no effect observes a transient state where `view`
    // is present but `employee` still points at the previous panel's selection.
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      FILTER_PARAM_NAMES.forEach((p) => next.delete(p));
      next.delete('employee');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // Handle employee selection from grid
  const handleSelectEmployee = useCallback(async (employee: EmployeeProfile, kpiId?: string | null) => {
    const resolved = await resolveRelationship(employee, profile!.id);
    setSelectedEmployee(resolved);
    setAutoOpenKpiId(kpiId || null);
  }, [profile]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!profile) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center gap-4 text-center p-6">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-semibold text-foreground">
          {profileError ? 'Unable to load your profile' : 'Account setup incomplete'}
        </h2>
        <p className="text-sm text-muted-foreground max-w-md">
          {profileError
            ? 'There was an error loading your profile data. Please try again or contact your administrator.'
            : 'Your user profile could not be found. Please contact your administrator to complete account setup.'}
        </p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => user && fetchProfile(user.id)}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
          <Button variant="destructive" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>
    );
  }

  // Render reviewer views (team, audit, management, hr_pms)
  if (viewMode !== 'self') {
    if (selectedEmployee) {
      let viewLevelForScorecard: string;
      if (viewMode === 'team' && selectedEmployee.relationship === 'indirect') {
        viewLevelForScorecard = 'skip_level';
      } else {
        const viewLevelMap: Record<string, string> = { team: 'manager', audit: 'auditor', skip_level: 'skip_level', hr_pms: 'hr_pms', management: 'management', pending_self_review: 'hr_pms', pending_manager_review: 'hr_pms', pending_skip_review: 'hr_pms' };
        viewLevelForScorecard = viewLevelMap[viewMode] || viewMode;
      }
      return (
        <div className="space-y-4">
          {availableModes.length > 1 && (
            <ViewModeToggle
              currentMode={viewMode}
              availableModes={availableModes}
              onModeChange={handleModeChange}
            />
          )}
          <UnifiedScorecard
            viewLevel={viewLevelForScorecard as any}
            employee={selectedEmployee}
            periodSelection={periodSelection}
            onPeriodSelectionChange={setPeriodSelection}
            onBack={() => {
              setSelectedEmployee(null);
              setAutoOpenKpiId(null);
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.delete('employee');
                return next;
              }, { replace: true });
            }}
            autoOpenKpiId={autoOpenKpiId}
            exploreMode={exploreMode}
            headerAction={canAddKra ? (
              <Button size="sm" onClick={() => setAddKraOpen(true)} className="gap-1.5">
                <Plus className="h-4 w-4" /> Add KRA
              </Button>
            ) : null}
          />
          {canAddKra && (
            <AdminKpiCreateDialog
              isOpen={addKraOpen}
              onClose={() => setAddKraOpen(false)}
              defaultEmployeeId={selectedEmployee.id}
              defaultReviewPeriod={periodSelection.selectedMonth}
              defaultReviewYear={periodSelection.selectedYear}
            />
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {availableModes.length > 1 && (
          <ViewModeToggle
            currentMode={viewMode}
            availableModes={availableModes}
            onModeChange={handleModeChange}
          />
        )}
        <EmployeeSelectorGrid
          viewLevel={viewMode as Exclude<ViewMode, 'self'>}
          periodSelection={periodSelection}
          onPeriodSelectionChange={setPeriodSelection}
          onSelectEmployee={handleSelectEmployee}
        />
      </div>
    );
  }

  // Self dashboard — unified with reviewer layout
  return (
    <div className="space-y-4">
      {availableModes.length > 1 && (
        <ViewModeToggle
          currentMode={viewMode}
          availableModes={availableModes}
          onModeChange={handleModeChange}
        />
      )}
      <UnifiedScorecard
        viewLevel="self"
        employee={{
          id: profile.id,
          full_name: profile.full_name,
          email: profile.email,
          designation: profile.designation,
          employee_code: profile.employee_code,
          avatar_url: profile.avatar_url,
          department_id: profile.department_id,
        }}
        periodSelection={periodSelection}
        onPeriodSelectionChange={setPeriodSelection}
        autoOpenKpiId={autoOpenKpiId}
        headerAction={canAddKra ? (
          <Button size="sm" onClick={() => setAddKraOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add KRA
          </Button>
        ) : null}
      />
      {canAddKra && (
        <AdminKpiCreateDialog
          isOpen={addKraOpen}
          onClose={() => setAddKraOpen(false)}
          defaultEmployeeId={profile.id}
          defaultReviewPeriod={periodSelection.selectedMonth}
          defaultReviewYear={periodSelection.selectedYear}
        />
      )}
      {mentionedKpi && (
        <MentionedKpiSheet
          kpiId={mentionedKpi.kpiId}
          employeeId={mentionedKpi.employeeId}
          open={!!mentionedKpi}
          onOpenChange={(open) => { if (!open) setMentionedKpi(null); }}
        />
      )}
    </div>
  );
}
