import { EmptyState, Screen } from '@/components/ui';

export default function DisputesScreen() {
  return (
    <Screen edges={[]}>
      <EmptyState
        title="No open disputes"
        description="Disputes raised on milestones will appear here for resolution."
      />
    </Screen>
  );
}
