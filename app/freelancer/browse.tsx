import { Screen } from '@/components/ui';
import { BrowseProjects } from '@/features/projects/components/BrowseProjects';

export default function BrowseScreen() {
  return (
    <Screen edges={[]} contentClassName="px-0 py-0">
      <BrowseProjects />
    </Screen>
  );
}
