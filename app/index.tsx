import { Redirect } from 'expo-router';

import { EmptyState, Screen } from '@/components/ui';
import { useAuthStore } from '@/features/auth/store';
import { MODE_HOME, resolveMode } from '@/features/navigation/mode';
import { useMyProfile, useMyRoles } from '@/features/profiles/api';

/** Entry route: sends each user to welcome, onboarding, or their active mode's home tab. */
export default function Index() {
  const isSignedIn = useAuthStore((s) => !!s.session);
  const profile = useMyProfile();
  const roles = useMyRoles();
  const savedMode = useAuthStore((s) => s.activeMode);

  if (!isSignedIn) return <Redirect href="/welcome" />;
  if (!profile.data?.onboarding_completed_at) return <Redirect href="/onboarding" />;

  const mode = resolveMode(roles.data ?? [], savedMode);

  if (!mode) {
    return (
      <Screen>
        <EmptyState
          title="No role on this account"
          description="Your account has no client or freelancer role. Contact support to restore access."
        />
      </Screen>
    );
  }
  return <Redirect href={MODE_HOME[mode]} />;
}
