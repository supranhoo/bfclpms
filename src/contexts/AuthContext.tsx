import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

type AppRole = 'admin' | 'manager' | 'employee' | 'auditor' | 'management' | 'hr_pms';

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
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initializedRef = useRef(false);

  // Derive effectiveRole
  const effectiveRole: AppRole | null = role === 'admin' && !isAdminMode && naturalRole
    ? naturalRole
    : role;

  const fetchProfile = async (userId: string) => {
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (profileData) {
        setProfile(profileData);
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
      toast({
        title: "Failed to load user profile",
        description: "Please refresh the page to try again.",
        variant: "destructive",
      });
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

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!initializedRef.current && session?.user) {
          initializedRef.current = true;
          setSession(session);
          setUser(session.user);
          queryClient.invalidateQueries({ queryKey: ['modules'] });
          fetchProfile(session.user.id);
          fetchRole(session.user.id);
          setLoading(false);
        } else if (initializedRef.current) {
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user) {
            queryClient.invalidateQueries({ queryKey: ['modules'] });
            fetchProfile(session.user.id);
            fetchRole(session.user.id);
          } else {
            setProfile(null);
            setRole(null);
            setNaturalRole(null);
          }
          setLoading(false);
        } else if (!session) {
          initializedRef.current = true;
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (initializedRef.current) return;
      
      initializedRef.current = true;
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        queryClient.invalidateQueries({ queryKey: ['modules'] });
        fetchProfile(session.user.id);
        fetchRole(session.user.id);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({
        title: "Sign in failed",
        description: error.message,
        variant: "destructive",
      });
    }
    return { error };
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
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
    setNaturalRole(null);
  };

  return (
    <AuthContext.Provider value={{
      user, session, profile, role, effectiveRole, naturalRole,
      isAdminMode, toggleAdminMode, loading, signIn, signUp, signOut,
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
