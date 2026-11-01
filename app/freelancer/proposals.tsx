import { Screen } from '@/components/ui';
import { MyProposals } from '@/features/proposals/components/MyProposals';

export default function ProposalsScreen() {
  return (
    <Screen edges={[]} contentClassName="px-0 py-0">
      <MyProposals />
    </Screen>
  );
}
