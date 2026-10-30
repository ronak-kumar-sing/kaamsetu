import { EmptyState, Screen } from '@/components/ui';

export default function FlagsScreen() {
  return (
    <Screen edges={[]}>
      <EmptyState
        title="No flagged activity"
        description="Accounts and content flagged for review will appear here."
      />
    </Screen>
  );
}
