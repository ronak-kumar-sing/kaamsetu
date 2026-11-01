import { useLocalSearchParams } from 'expo-router';

import { InviteLanding } from '@/features/invites/components/InviteLanding';

export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <InviteLanding token={token} />;
}
