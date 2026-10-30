import { router } from 'expo-router';

import { EmptyState, Screen } from '@/components/ui';

export default function FreelancerHomeScreen() {
  return (
    <Screen edges={[]}>
      <EmptyState
        title="No active work yet"
        description="Accepted projects and upcoming milestone payouts will appear here."
        actionLabel="Browse projects"
        onAction={() => router.push('/freelancer/browse')}
      />
    </Screen>
  );
}
