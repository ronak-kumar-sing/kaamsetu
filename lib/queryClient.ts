import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState, type AppStateStatus, Platform } from 'react-native';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => !isPermanentError(error) && failureCount < 2,
    },
    mutations: { retry: false },
  },
});

/**
 * Errors that won't succeed on retry: HTTP 4xx (auth-js, functions), PostgREST errors
 * (`PGRST*`), permission denied (42501), and our own RPC validation errors (P0001, 22xxx, 23xxx).
 */
export function isPermanentError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { status, code } = error as { status?: unknown; code?: unknown };
  if (typeof status === 'number' && status >= 400 && status < 500) return true;
  if (typeof code === 'string') {
    return code === '42501' || code === 'P0001' || /^(PGRST|22|23)/.test(code);
  }
  return false;
}

function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
}
AppState.addEventListener('change', onAppStateChange);
// Pause queries while offline instead of failing them.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
);
