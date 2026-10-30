import { ModeTabs, type ModeTab } from '@/features/profiles/components/ModeTabs';

const TABS: readonly ModeTab[] = [
  { name: 'index', title: 'Home', icon: 'home-outline', iconFocused: 'home' },
  { name: 'post-project', title: 'Post', icon: 'add-circle-outline', iconFocused: 'add-circle' },
  { name: 'find-freelancers', title: 'Find', icon: 'search-outline', iconFocused: 'search' },
  { name: 'wallet', title: 'Wallet', icon: 'wallet-outline', iconFocused: 'wallet' },
  { name: 'profile', title: 'Profile', icon: 'person-outline', iconFocused: 'person' },
];

export default function ClientLayout() {
  return <ModeTabs role="client" tabs={TABS} />;
}
