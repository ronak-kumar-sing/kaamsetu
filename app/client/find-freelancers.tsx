import { Screen } from '@/components/ui';
import { FindFreelancers } from '@/features/freelancers/components/FindFreelancers';

export default function FindFreelancersScreen() {
  return (
    <Screen edges={[]} contentClassName="px-0 py-0">
      <FindFreelancers />
    </Screen>
  );
}
