import { router } from 'expo-router';

import { EmptyState, Screen } from '@/components/ui';

export default function ClientHomeScreen() {
  return (
    <Screen edges={[]}>
      <EmptyState
        title="No active projects yet"
        description="Projects you post and the freelancers you hire will show up here, with milestone progress at a glance."
        actionLabel="Post a project"
        onAction={() => router.push('/client/post-project')}
      />
    </Screen>
  );
}
