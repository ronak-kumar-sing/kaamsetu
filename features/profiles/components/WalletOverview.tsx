import { View } from 'react-native';

import { MoneyCountUp } from '@/components/motion';
import { Card, EmptyState, Screen, Text } from '@/components/ui';

const SUMMARY = [
  { label: 'In escrow', paise: 0 },
  { label: 'Released', paise: 0 },
  { label: 'Pending payouts', paise: 0 },
  { label: 'Deposits held', paise: 0 },
] as const;

/** Phase 1 placeholder: zeroed balances until payments ship. */
export function WalletOverview() {
  return (
    <Screen scroll edges={[]}>
      <Card className="gap-4">
        {SUMMARY.map((row) => (
          <View key={row.label} className="flex-row items-center justify-between">
            <Text variant="body" tone="muted">
              {row.label}
            </Text>
            <MoneyCountUp paise={row.paise} className="text-base font-semibold text-foreground" />
          </View>
        ))}
      </Card>
      <EmptyState
        title="No transactions yet"
        description="Deposits, escrow holds and payouts will be listed here once you start a project."
      />
    </Screen>
  );
}
