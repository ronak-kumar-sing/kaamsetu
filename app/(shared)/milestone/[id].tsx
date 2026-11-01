import { useLocalSearchParams } from 'expo-router';

import { MilestoneDetail } from '@/features/milestones/components/MilestoneDetail';

export default function MilestoneScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MilestoneDetail id={id} />;
}
