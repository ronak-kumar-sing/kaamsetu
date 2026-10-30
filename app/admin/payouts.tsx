import { EmptyState, Screen } from '@/components/ui';

export default function PayoutsScreen() {
  return (
    <Screen edges={[]}>
      <EmptyState
        title="No pending payouts"
        description="Freelancer payouts awaiting approval or processing will appear here."
      />
    </Screen>
  );
}
