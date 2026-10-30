import { EmptyState, Screen } from '@/components/ui';

export default function PostProjectScreen() {
  return (
    <Screen edges={[]}>
      <EmptyState
        title="Post a project"
        description="Describe your work, set milestone payments and receive proposals from verified freelancers. Coming soon."
      />
    </Screen>
  );
}
