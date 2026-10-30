import { useEffect } from 'react';

import { useAuthStore } from '@/features/auth/store';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';

/** Mirrors the Supabase session into the auth store. Mount once at the root. */
export function useAuthListener() {
  const setSession = useAuthStore((s) => s.setSession);
  const setInitialized = useAuthStore((s) => s.setInitialized);
  const setActiveMode = useAuthStore((s) => s.setActiveMode);

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) setSession(data.session);
      })
      .finally(() => {
        if (mounted) setInitialized();
      });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'SIGNED_OUT') {
        setActiveMode(null);
        queryClient.clear();
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [setSession, setInitialized, setActiveMode]);
}
