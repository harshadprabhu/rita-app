import { QueryClient, focusManager } from '@tanstack/react-query';
import { AppState, AppStateStatus, Platform } from 'react-native';

/**
 * Wire React Query's focus manager to React Native AppState.
 * Without this, queries never auto-refetch when the app returns from background
 * (React Query's default handler targets browser window focus events only).
 */
if (Platform.OS !== 'web') {
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => handleFocus(state === 'active'),
    );
    return () => subscription.remove();
  });
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 min default
      retry: 1,
    },
  },
});
