import { Screen } from '@/components/ui';
import { ClientHome } from '@/features/projects/components/ClientHome';

export default function ClientHomeScreen() {
  return (
    <Screen edges={[]} contentClassName="px-0 py-0">
      <ClientHome />
    </Screen>
  );
}
