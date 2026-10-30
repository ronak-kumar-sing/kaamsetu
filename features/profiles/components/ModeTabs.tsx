import { Ionicons } from '@expo/vector-icons';
import { Link, Tabs } from 'expo-router';
import { Pressable } from 'react-native';

import { ModeGuard } from './ModeGuard';
import { useNavColors } from './navTheme';

import type { AppRole } from '@/shared/constants';

type IconName = keyof typeof Ionicons.glyphMap;

export interface ModeTab {
  name: string;
  title: string;
  icon: IconName;
  iconFocused: IconName;
}

export interface ModeTabsProps {
  role: AppRole;
  tabs: readonly ModeTab[];
}

/** Role-guarded, themed bottom-tab navigator shared by the client, freelancer and admin groups. */
export function ModeTabs({ role, tabs }: ModeTabsProps) {
  const colors = useNavColors();
  return (
    <ModeGuard role={role}>
      <Tabs
        screenOptions={{
          headerShown: true,
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: { color: colors.foreground },
          headerShadowVisible: false,
          tabBarActiveTintColor: colors.active,
          tabBarInactiveTintColor: colors.inactive,
          tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
          headerRight: () => (
            <Link href="/settings" asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Settings"
                hitSlop={12}
                className="mr-4 h-11 w-11 items-center justify-center"
              >
                <Ionicons name="settings-outline" size={22} color={colors.foreground} />
              </Pressable>
            </Link>
          ),
        }}
      >
        {tabs.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.title,
              tabBarAccessibilityLabel: tab.title,
              tabBarIcon: ({ size, focused }) => (
                <Ionicons
                  name={focused ? tab.iconFocused : tab.icon}
                  size={size}
                  color={focused ? colors.active : colors.inactive}
                />
              ),
            }}
          />
        ))}
      </Tabs>
    </ModeGuard>
  );
}
