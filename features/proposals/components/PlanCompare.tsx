import { View } from 'react-native';

import { Badge, Money, Text } from '@/components/ui';
import { formatDate } from '@/features/projects/format';
import { formatINR } from '@/shared/money';

import type { ProposalMilestoneEdit } from '../api';
import { diffPlans, planTotal, type PlanRowView } from '../diff';

const CHANGE_LABEL = { added: 'New', removed: 'Dropped', changed: 'Changed', same: '' } as const;

function Cell({
  row,
  emphasis,
}: {
  row: { title: string; amount_paise: number; due_date: string } | null;
  emphasis?: boolean;
}) {
  if (!row) {
    return (
      <View className="flex-1">
        <Text variant="caption" tone="muted">
          None
        </Text>
      </View>
    );
  }
  return (
    <View className="flex-1 gap-0.5">
      <Text variant={emphasis ? 'body' : 'caption'} numberOfLines={2}>
        {row.title}
      </Text>
      <Text variant="caption">{formatINR(row.amount_paise)}</Text>
      <Text variant="caption">Due {formatDate(row.due_date)}</Text>
    </View>
  );
}

/** Current plan and the freelancer's plan side by side, matched by source milestone id. */
export function PlanCompare({
  current,
  proposed,
}: {
  current: readonly PlanRowView[];
  proposed: readonly ProposalMilestoneEdit[];
}) {
  const rows = diffPlans(current, proposed);
  return (
    <View className="gap-2">
      <View className="flex-row gap-3">
        <Text variant="label" tone="muted" className="flex-1">
          Current plan
        </Text>
        <Text variant="label" tone="muted" className="flex-1">
          Their plan
        </Text>
      </View>
      {rows.map((row) => (
        <View key={row.position} className="gap-2 rounded-xl border border-border p-3">
          {row.change !== 'same' ? (
            <Badge
              label={CHANGE_LABEL[row.change]}
              tone={row.change === 'removed' ? 'danger' : 'warning'}
            />
          ) : null}
          <View className="flex-row gap-3">
            <Cell row={row.current} />
            <Cell row={row.proposed} emphasis />
          </View>
        </View>
      ))}
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Money paise={planTotal(current)} variant="caption" />
        </View>
        <View className="flex-1">
          <Money paise={planTotal(proposed)} variant="body" />
        </View>
      </View>
    </View>
  );
}
