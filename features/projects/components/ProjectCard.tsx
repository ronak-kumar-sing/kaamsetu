import { View } from 'react-native';

import { Badge, Card, Money, Text } from '@/components/ui';
import type { ProjectStatus } from '@/shared/schemas/projects';

import { formatDate } from '../format';
import { PROJECT_STATUS_META } from '../status';

export interface ProjectCardProps {
  title: string;
  status: ProjectStatus;
  totalPaise: number;
  updatedAt?: string | null;
  pendingProposals?: number;
  onPress: () => void;
}

export function ProjectCard({
  title,
  status,
  totalPaise,
  updatedAt,
  pendingProposals = 0,
  onPress,
}: ProjectCardProps) {
  const meta = PROJECT_STATUS_META[status];
  return (
    <View className="mb-3">
      <Card onPress={onPress} className="gap-2">
        <View className="flex-row items-start justify-between gap-3">
          <Text variant="subheading" className="flex-1" numberOfLines={2}>
            {title}
          </Text>
          <Badge label={meta.label} tone={meta.tone} />
        </View>
        <View className="flex-row items-center justify-between">
          <Money paise={totalPaise} variant="body" />
          {pendingProposals > 0 ? (
            <Badge
              label={`${pendingProposals} ${pendingProposals === 1 ? 'proposal' : 'proposals'}`}
              tone="warning"
            />
          ) : updatedAt ? (
            <Text variant="caption">Updated {formatDate(updatedAt)}</Text>
          ) : null}
        </View>
      </Card>
    </View>
  );
}
