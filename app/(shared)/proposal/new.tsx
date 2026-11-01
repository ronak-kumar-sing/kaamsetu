import { useLocalSearchParams } from 'expo-router';

import { NewProposal } from '@/features/proposals/components/NewProposal';

export default function NewProposalScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  return <NewProposal projectId={projectId} />;
}
