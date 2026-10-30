import { router } from 'expo-router';

import { EmptyState, Screen } from '@/components/ui';

export default function ProposalsScreen() {
  return (
    <Screen edges={[]}>
      <EmptyState
        title="No proposals yet"
        description="Proposals you send to clients, and their status, will appear here."
        actionLabel="Browse projects"
        onAction={() => router.push('/freelancer/browse')}
      />
    </Screen>
  );
}
