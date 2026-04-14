import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAutoLogoutMinutes } from '@/hooks/useSystemSettings';

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'] as const;
const WARNING_BEFORE_MS = 60_000; // 60s warning before logout
const THROTTLE_MS = 1_000; // throttle activity checks to 1/s

export function useIdleTimeout() {
  const { minutes, isLoading } = useAutoLogoutMinutes();
  const navigate = useNavigate();

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const warningShownRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    timeoutRef.current = null;
    warningRef.current = null;
  }, []);

  const doLogout = useCallback(async () => {
    clearTimers();
    // Persist email for prefill on re-login if remember-me was on
    try {
      const { data } = await supabase.auth.getSession();
      const email = data?.session?.user?.email;
      if (email && localStorage.getItem('pms_remember_me') !== 'false') {
        localStorage.setItem('pms_remembered_email', email);
      }
    } catch { /* best-effort */ }
    toast.error('You have been signed out due to inactivity.');
    await supabase.auth.signOut();
    navigate('/auth', { replace: true });
  }, [clearTimers, navigate]);

  const resetTimers = useCallback(() => {
    if (!minutes || minutes <= 0) return;

    clearTimers();
    warningShownRef.current = false;
    const totalMs = minutes * 60_000;

    // Warning timer
    if (totalMs > WARNING_BEFORE_MS) {
      warningRef.current = setTimeout(() => {
        if (!warningShownRef.current) {
          warningShownRef.current = true;
          toast.warning('Session expiring soon', {
            description: 'You will be signed out in 60 seconds due to inactivity.',
            duration: 10_000,
          });
        }
      }, totalMs - WARNING_BEFORE_MS);
    }

    // Logout timer
    timeoutRef.current = setTimeout(doLogout, totalMs);
  }, [minutes, clearTimers, doLogout]);

  const handleActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastActivityRef.current < THROTTLE_MS) return;
    lastActivityRef.current = now;
    resetTimers();
  }, [resetTimers]);

  useEffect(() => {
    if (isLoading || !minutes || minutes <= 0) {
      clearTimers();
      return;
    }

    // Start timers
    resetTimers();

    // Attach listeners
    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [isLoading, minutes, resetTimers, handleActivity, clearTimers]);
}
