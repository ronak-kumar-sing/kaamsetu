import { View } from 'react-native';

import { MoneyCountUp } from '@/components/motion/MoneyCountUp';
import { Badge, Text } from '@/components/ui';
import { formatINR } from '@/shared/money';
import type { ProjectStatus } from '@/shared/schemas/projects';

import { PROJECT_STATUS_META } from '../status';

export interface ProjectHeaderProps {
  title: string;
  status: ProjectStatus;
  totalPaise: number;
  subtitle?: string;
}

export function ProjectHeader({ title, status, totalPaise, subtitle }: ProjectHeaderProps) {
  const meta = PROJECT_STATUS_META[status];
  return (
    <View className="gap-2">
      <Badge label={meta.label} tone={meta.tone} />
      <Text variant="title">{title}</Text>
      {subtitle ? <Text variant="caption">{subtitle}</Text> : null}
      <View accessible accessibilityLabel={`Project total ${formatINR(totalPaise)}`}>
        <Text variant="label" tone="muted">
          Project total
        </Text>
        <MoneyCountUp
          paise={totalPaise}
          duration={700}
          className="text-3xl font-bold text-foreground"
        />
      </View>
    </View>
  );
}
