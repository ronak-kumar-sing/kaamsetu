import { useLocalSearchParams } from 'expo-router';

import { PublicProfileView } from '@/features/freelancers/components/PublicProfileView';

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PublicProfileView id={id} />;
}
