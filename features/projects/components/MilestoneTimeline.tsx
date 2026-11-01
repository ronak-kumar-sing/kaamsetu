import { View } from 'react-native';

import { Card, Money, StatusChip, Text } from '@/components/ui';
import type { MilestoneStatus } from '@/shared/schemas/projects';

import { formatDate } from '../format';

export interface TimelineMilestone {
  id: string;
  position: number;
  title: string;
  amount_paise: number;
  due_date: string;
  status: MilestoneStatus;
}

export interface MilestoneTimelineProps {
  milestones: readonly TimelineMilestone[];
  onPressMilestone?: (id: string) => void;
}

/** Vertical timeline of milestones: position, status chip, amount and due date. */
export function MilestoneTimeline({ milestones, onPressMilestone }: MilestoneTimelineProps) {
  return (
    <View>
      {milestones.map((m, i) => (
        <View key={m.id} className="flex-row gap-3">
          <View className="items-center">
            <View className="h-7 w-7 items-center justify-center rounded-full bg-primary/15">
              <Text variant="caption" tone="primary" className="font-semibold">
                {m.position}
              </Text>
            </View>
            {i < milestones.length - 1 ? <View className="w-px flex-1 bg-border" /> : null}
          </View>
          <View className="mb-3 flex-1">
            <Card
              onPress={onPressMilestone ? () => onPressMilestone(m.id) : undefined}
              className="gap-1.5"
            >
              <View className="flex-row items-start justify-between gap-2">
                <Text variant="subheading" className="flex-1">
                  {m.title}
                </Text>
                <StatusChip status={m.status} />
              </View>
              <View className="flex-row items-center justify-between">
                <Money paise={m.amount_paise} />
                <Text variant="caption">Due {formatDate(m.due_date)}</Text>
              </View>
            </Card>
          </View>
        </View>
      ))}
    </View>
  );
}
