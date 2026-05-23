import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
// NOTE: AppRole is the single source of truth — update src/lib/roles.ts when adding roles.
import type { AppRole } from '@/lib/roles';
export type { AppRole } from '@/lib/roles';

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  employee_code: string | null;
  designation: string | null;
  pms_grade: string | null;
  department_id: string | null;
  reporting_manager_id: string | null;
  avatar_url: string | null;
  mobile_number?: string | null;
  is_active?: boolean;
  deactivated_at?: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  /** The UI-effective role: when admin mode is off, returns the natural hierarchy role */
  effectiveRole: AppRole | null;
  /** The admin's natural role based on org hierarchy (manager or employee) */
  naturalRole: AppRole | null;
  /** Whether admin mode is active (full admin access) */
  isAdminMode: boolean;
  /** Toggle admin mode on/off (only relevant for admin users) */
  toggleAdminMode: () => void;
  loading: boolean;
  /**
   * True once the initial Supabase session bootstrap has completed (whether
   * a user is signed-in or not). Hooks that issue RLS-gated queries MUST
   * gate their `enabled` flag on this to avoid the cold-load race where
   * PostgREST receives requests before `auth.uid()` is available, which
   * silently returns 0 rows under RLS. See ADR-052 / POLICY §96.
   */
  isReady: boolean;
  /** True when auth bootstrap finished but profile could not be loaded */
  profileError: boolean;
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  /** Refresh the in-memory profile from DB (e.g. after avatar/mobile update) */
  fetchProfile: (userId: string) => Promise<boolean>;
}

const ADMIN_MODE_KEY = 'pms_admin_mode';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [naturalRole, setNaturalRole] = useState<AppRole | null>(null);
  const [isAdminMode, setIsAdminMode] = useState<boolean>(() => {
    const saved = localStorage.getItem(ADMIN_MODE_KEY);
    return saved !== null ? saved === 'true' : true; // default ON
  });
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initializedRef = useRef(false);
  const prevReadyRef = useRef(false);

  // Derive effectiveRole
  const effectiveRole: AppRole | null = role === 'admin' && !isAdminMode && naturalRole
    ? naturalRole
    : role;

  const fetchProfile = async (userId: string): Promise<boolean> => {
    try {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (error) {
        console.error('Failed to fetch profile:', error);
        setProfileError(true);
        toast({
          title: "Failed to load user profile",
          description: "Please refresh the page to try again.",
          variant: "destructive",
        });
        return true;
      }

      if (!profileData) {
        console.warn('No profile row found for user:', userId);
        setProfileError(true);
        toast({
          title: "Account setup incomplete",
          description: "Your profile could not be found. Contact your administrator.",
          variant: "destructive",
        });
        return true;
      }

      // Check if user is deactivated
      if (profileData.is_active === false) {
        toast({
          title: "Account deactivated",
          description: "Your account has been deactivated. Contact your administrator.",
          variant: "destructive",
        });
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setProfile(null);
        setRole(null);
        setNaturalRole(null);
        return false;
      }
      setProfileError(false);
      setProfile(profileData);
      return true;
    } catch (error) {
      console.error('Failed to fetch profile:', error);
      setProfileError(true);
      toast({
        title: "Failed to load user profile",
        description: "Please refresh the page to try again.",
        variant: "destructive",
      });
      return true;
    }
  };

  const fetchRole = async (userId: string) => {
    try {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();
      
      if (roleData) {
        const fetchedRole = roleData.role as AppRole;
        setRole(fetchedRole);
        
        // If admin, detect natural role
        if (fetchedRole === 'admin') {
          fetchNaturalRole(userId);
        }
      }
    } catch (error) {
      console.error('Failed to fetch role:', error);
      toast({
        title: "Failed to load user role",
        description: "Please refresh the page to try again.",
        variant: "destructive",
      });
    }
  };

  const fetchNaturalRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('reporting_manager_id', userId)
        .limit(1);
      
      if (error) {
        console.error('Failed to detect natural role:', error);
        setNaturalRole('employee');
        return;
      }
      
      setNaturalRole(data && data.length > 0 ? 'manager' : 'employee');
    } catch {
      setNaturalRole('employee');
    }
  };

  const toggleAdminMode = () => {
    setIsAdminMode(prev => {
      const next = !prev;
      localStorage.setItem(ADMIN_MODE_KEY, String(next));
      return next;
    });
  };

  const loadUserData = async (userId: string): Promise<boolean> => {
    queryClient.invalidateQueries({ queryKey: ['modules'] });
    const [isActive] = await Promise.all([fetchProfile(userId), fetchRole(userId)]);
    return isActive;
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!initializedRef.current && session?.user) {
          initializedRef.current = true;
          setSession(session);
          setUser(session.user);
          loadUserData(session.user.id).then(isActive => {
            if (!isActive) setLoading(false);
            else setLoading(false);
          });
        } else if (initializedRef.current) {
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user) {
            loadUserData(session.user.id).then(isActive => {
              if (!isActive) setLoading(false);
              else setLoading(false);
            });
          } else {
            setProfile(null);
            setRole(null);
            setNaturalRole(null);
            setLoading(false);
          }
        } else if (!session) {
          initializedRef.current = true;
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (initializedRef.current) return;
      
      initializedRef.current = true;
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        await loadUserData(session.user.id);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Auth-Readiness Query Gate (POLICY §96):
  // When the bootstrap finishes for the first time AND a user is present,
  // invalidate query caches that depend on auth.uid() so any racy first-mount
  // query that returned an empty result is re-fetched with a valid session.
  const isReady = !loading;
  useEffect(() => {
    if (!isReady) return;
    if (prevReadyRef.current) return;
    prevReadyRef.current = true;
    if (!user?.id) return;
    // Evict caches likely to have raced the auth bootstrap (Org KPI Data Entry,
    // KPI lists, ownership maps, profile-derived data).
    queryClient.invalidateQueries({ queryKey: ['org-level-kpis-with-employees'] });
    queryClient.invalidateQueries({ queryKey: ['org-level-kpis'] });
    queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
    queryClient.invalidateQueries({ queryKey: ['org-kpi-data-owners'] });
    queryClient.invalidateQueries({ queryKey: ['org-kpi-data-owner-names'] });
    queryClient.invalidateQueries({ queryKey: ['is-any-org-kpi-owner'] });
    queryClient.invalidateQueries({ queryKey: ['kpis'] });
    queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
    queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
    queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
    // v2.66.11.13 — Manager Team Reviews dashboard caches must also re-fetch
    // once auth is ready, otherwise SECURITY DEFINER RPCs that race the
    // bootstrap silently return zero rows and managers see an empty grid.
    queryClient.invalidateQueries({ queryKey: ['kpis-by-period-ranges'] });
    queryClient.invalidateQueries({ queryKey: ['profiles'] });
    queryClient.invalidateQueries({ queryKey: ['profiles-by-workflow-stage'] });
    queryClient.invalidateQueries({ queryKey: ['team-members'] });
    queryClient.invalidateQueries({ queryKey: ['skip-level-team-members'] });
    // v2.66.11.18 — Manager / Designation / Grade picker caches in
    // useEmployeeFilterOptions. They previously raced auth bootstrap and
    // returned 0 rows, leaving the Manager filter dropdown empty on HR PMS
    // Review and other reviewer surfaces.
    queryClient.invalidateQueries({ queryKey: ['managers-list'] });
    queryClient.invalidateQueries({ queryKey: ['distinct-designations'] });
    queryClient.invalidateQueries({ queryKey: ['distinct-grades'] });
    // Employee Summary report is RLS-gated and must recover from any
    // pre-bootstrap empty cache after login/refresh.
    queryClient.invalidateQueries({ queryKey: ['employee-performance-summary'] });
    queryClient.invalidateQueries({ queryKey: ['employee-performance-trends'] });
  }, [isReady, user?.id, queryClient]);

  const signIn = async (email: string, password: string, rememberMe: boolean = true) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast({
          title: "Sign in failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        // Store remember-me preference
        localStorage.setItem('pms_remember_me', rememberMe ? 'true' : 'false');
        // Persist email for prefill on next login (e.g. after idle timeout)
        if (rememberMe) {
          localStorage.setItem('pms_remembered_email', email);
        } else {
          localStorage.removeItem('pms_remembered_email');
        }
      }
      return { error };
    } catch (networkError) {
      const err = new Error('Network error. Please check your internet connection and try again.');
      toast({
        title: "Sign in failed",
        description: err.message,
        variant: "destructive",
      });
      return { error: err };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    
    if (error) {
      toast({
        title: "Sign up failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Account created",
        description: "You can now sign in with your credentials.",
      });
    }
    
    return { error };
  };

  const signOut = async () => {
    // Keep pms_remembered_email so email is prefilled on next visit
    localStorage.removeItem('pms_remember_me');
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
    setNaturalRole(null);
  };

  // beforeunload: clear Supabase session token synchronously when "Remember Me" is off.
  // localStorage.removeItem is synchronous and guaranteed to execute before the tab closes,
  // unlike the previous async supabase.auth.signOut() which was unreliable in beforeunload.
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (localStorage.getItem('pms_remember_me') === 'false') {
        // Synchronous removal — reliable in beforeunload
        localStorage.removeItem('sb-jdvsvqiyptijplyhmqqn-auth-token');
        localStorage.removeItem('pms_remember_me');
        localStorage.removeItem('pms_remembered_email');
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, session, profile, role, effectiveRole, naturalRole,
      isAdminMode, toggleAdminMode, loading, isReady, profileError, signIn, signUp, signOut, fetchProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
