import { ModeTabs, type ModeTab } from '@/features/profiles/components/ModeTabs';

const TABS: readonly ModeTab[] = [
  { name: 'index', title: 'Home', icon: 'home-outline', iconFocused: 'home' },
  { name: 'browse', title: 'Browse', icon: 'search-outline', iconFocused: 'search' },
  {
    name: 'proposals',
    title: 'Proposals',
    icon: 'document-text-outline',
    iconFocused: 'document-text',
  },
  { name: 'wallet', title: 'Wallet', icon: 'wallet-outline', iconFocused: 'wallet' },
  { name: 'profile', title: 'Profile', icon: 'person-outline', iconFocused: 'person' },
];

export default function FreelancerLayout() {
  return <ModeTabs role="freelancer" tabs={TABS} />;
}
