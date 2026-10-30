import { EmptyState, Screen } from '@/components/ui';

export default function FindFreelancersScreen() {
  return (
    <Screen edges={[]}>
      <EmptyState
        title="Find freelancers"
        description="Search verified freelancers by skill, city and rate. Coming soon."
      />
    </Screen>
  );
}
