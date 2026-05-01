import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { User, BarChart3, ClipboardList, Settings } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

import ProfileHero from '@/components/profile/ProfileHero';
import OrganizationInfoCard from '@/components/profile/OrganizationInfoCard';
import ReportingStructureCard from '@/components/profile/ReportingStructureCard';
import JobDescriptionCard from '@/components/profile/JobDescriptionCard';
import SkillCompetencyTab from '@/components/profile/SkillCompetencyTab';
import KraSummaryTab from '@/components/profile/KraSummaryTab';
import ProfileSettingsTab from '@/components/profile/ProfileSettingsTab';

export default function ProfileSettings() {
  const { user, profile, fetchProfile } = useAuth() as any;

  const [loading, setLoading] = useState(true);
  const [department, setDepartment] = useState<any>(null);
  const [businessUnit, setBusinessUnit] = useState<any>(null);
  const [division, setDivision] = useState<any>(null);
  const [subBranch, setSubBranch] = useState<any>(null);
  const [manager, setManager] = useState<any>(null);
  const [jobDesc, setJobDesc] = useState<any>(null);
  const [competencies, setCompetencies] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      setLoading(true);
      try {
        // 1. Department hierarchy
        if (profile.department_id) {
          const { data: dept } = await supabase.from('departments').select('id, name, business_unit_id').eq('id', profile.department_id).maybeSingle();
          setDepartment(dept);
          if (dept?.business_unit_id) {
            const { data: bu } = await supabase.from('business_units').select('id, name, division_id').eq('id', dept.business_unit_id).maybeSingle();
            setBusinessUnit(bu);
            if (bu?.division_id) {
              const { data: div } = await supabase.from('divisions').select('id, name').eq('id', bu.division_id).maybeSingle();
              setDivision(div);
            }
          }
          const { data: sb } = await supabase.from('sub_branches').select('id, name').eq('department_id', profile.department_id).limit(1).maybeSingle();
          setSubBranch(sb);
        }

        // 2. Manager
        if (profile.reporting_manager_id) {
          const { data: mgr } = await supabase.from('profiles').select('full_name, designation, avatar_url, employee_code').eq('id', profile.reporting_manager_id).maybeSingle();
          setManager(mgr);
        }

        // 3. Job description
        if (profile.designation) {
          const { data: jd } = await supabase.from('employee_job_descriptions').select('*').eq('designation', profile.designation).maybeSingle();
          setJobDesc(jd);
        }

        // 4. Competencies
        const { data: comps } = await supabase.from('skill_competencies').select('*').eq('employee_id', user.id).order('category').order('skill_name');
        setCompetencies(comps || []);

        // 5. KPIs
        const { data: kpiData } = await supabase.from('kpis').select('id, category_id, kra_name, kpi_name, weightage, status, review_period, review_year').eq('employee_id', user.id).order('created_at', { ascending: false });
        setKpis(kpiData || []);

        // 6. Categories
        const { data: cats } = await supabase.from('kra_categories').select('id, name');
        setCategories(cats || []);
      } catch (err) {
        console.error('Failed to load profile data', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [profile, user]);

  const categoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach(c => { map[c.id] = c.name; });
    return map;
  }, [categories]);

  const kpiRows = useMemo(() => {
    return kpis.map(k => ({
      id: k.id,
      category_id: k.category_id,
      category_name: categoryMap[k.category_id] || null,
      kra_name: k.kra_name,
      kpi_name: k.kpi_name,
      weightage: k.weightage,
      status: k.status,
    }));
  }, [kpis, categoryMap]);

  const jdFormatted = useMemo(() => {
    if (!jobDesc) return null;
    return {
      role_purpose: jobDesc.role_purpose,
      key_responsibilities: Array.isArray(jobDesc.key_responsibilities) ? jobDesc.key_responsibilities : [],
      required_skills: Array.isArray(jobDesc.required_skills) ? jobDesc.required_skills : [],
      qualifications: jobDesc.qualifications,
    };
  }, [jobDesc]);

  const orgInfo = useMemo(() => ({
    division: division?.name || null,
    businessUnit: businessUnit?.name || null,
    department: department?.name || null,
    subBranch: subBranch?.name || null,
    designation: profile?.designation || null,
    pmsGrade: profile?.pms_grade || null,
    employeeCode: profile?.employee_code || null,
    joiningDate: profile?.created_at || null,
  }), [division, businessUnit, department, subBranch, profile]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 p-4 sm:p-6">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-10 w-80" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-60" />
          <Skeleton className="h-60" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-4 sm:p-6">
      {/* Hero */}
      <ProfileHero
        user={user}
        profile={profile}
        departmentName={department?.name || null}
        divisionName={division?.name || null}
        managerName={manager?.full_name || null}
        fetchProfile={fetchProfile}
      />

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start bg-muted/50 p-1">
          <TabsTrigger value="overview" className="gap-1.5 text-sm">
            <User className="h-3.5 w-3.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="competency" className="gap-1.5 text-sm">
            <BarChart3 className="h-3.5 w-3.5" /> Skill Competency
          </TabsTrigger>
          <TabsTrigger value="kra" className="gap-1.5 text-sm">
            <ClipboardList className="h-3.5 w-3.5" /> KRA Summary
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5 text-sm">
            <Settings className="h-3.5 w-3.5" /> Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <OrganizationInfoCard info={orgInfo} />
            <ReportingStructureCard manager={manager} />
          </div>
          <JobDescriptionCard jd={jdFormatted} />
        </TabsContent>

        <TabsContent value="competency" className="mt-4">
          <SkillCompetencyTab competencies={competencies} />
        </TabsContent>

        <TabsContent value="kra" className="mt-4">
          <KraSummaryTab kpis={kpiRows} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <ProfileSettingsTab user={user} profile={profile} fetchProfile={fetchProfile} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
