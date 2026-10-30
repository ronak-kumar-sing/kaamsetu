import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AppRole } from '@/shared/constants';

type AuthState = {
  session: Session | null;
  /** True once the persisted session has been read from storage. */
  initialized: boolean;
  /** Which tab group to show for users with several roles. Persisted per device. */
  activeMode: AppRole | null;
  setSession: (session: Session | null) => void;
  setInitialized: () => void;
  setActiveMode: (mode: AppRole | null) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      initialized: false,
      activeMode: null,
      setSession: (session) => set({ session }),
      setInitialized: () => set({ initialized: true }),
      setActiveMode: (activeMode) => set({ activeMode }),
    }),
    {
      name: 'kaamsetu.ui',
      storage: createJSONStorage(() => localStorage),
      // The Supabase session is persisted by supabase-js itself; only keep UI prefs here.
      partialize: (state) => ({ activeMode: state.activeMode }),
    },
  ),
);
