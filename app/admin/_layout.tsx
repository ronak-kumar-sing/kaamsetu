import { ModeTabs, type ModeTab } from '@/features/profiles/components/ModeTabs';

const TABS: readonly ModeTab[] = [
  {
    name: 'index',
    title: 'KYC queue',
    icon: 'shield-checkmark-outline',
    iconFocused: 'shield-checkmark',
  },
  {
    name: 'disputes',
    title: 'Disputes',
    icon: 'alert-circle-outline',
    iconFocused: 'alert-circle',
  },
  { name: 'payouts', title: 'Payouts', icon: 'cash-outline', iconFocused: 'cash' },
  { name: 'flags', title: 'Flags', icon: 'flag-outline', iconFocused: 'flag' },
];

export default function AdminLayout() {
  return <ModeTabs role="admin" tabs={TABS} />;
}
