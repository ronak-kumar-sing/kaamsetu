import { EmptyState, Screen } from '@/components/ui';

export default function BrowseScreen() {
  return (
    <Screen edges={[]}>
      <EmptyState
        title="No projects to browse yet"
        description="Open projects that match your skills will be listed here."
      />
    </Screen>
  );
}
