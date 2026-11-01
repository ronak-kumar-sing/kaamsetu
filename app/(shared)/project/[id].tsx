import { useLocalSearchParams } from 'expo-router';

import { ProjectDetail } from '@/features/projects/components/ProjectDetail';

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProjectDetail id={id} />;
}
