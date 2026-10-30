import { EmptyState, Screen } from '@/components/ui';

export default function KycQueueScreen() {
  return (
    <Screen edges={[]}>
      <EmptyState
        title="KYC queue is empty"
        description="Identity verification requests awaiting review will appear here."
      />
    </Screen>
  );
}
