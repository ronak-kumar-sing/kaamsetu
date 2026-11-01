---
trigger: glob
globs: app/**, features/**, components/**, lib/**, shared/**
description: Expo/React Native app conventions: routing, data hooks, UI kit, motion, accessibility.
---

# App rules

Expo SDK 58, Expo Router 58 (typed routes), React 19.3, RN 0.88, NativeWind v4, TanStack Query v5, Zustand, react-hook-form + zod v4, TypeScript strict.

**Expo changes fast.** Check https://docs.expo.dev/versions/v58.0.0/ before using an Expo API. Install packages with `npx expo install <pkg>`, never with a plain `npm install`, so versions match the SDK.

## Routing (D7)

- `app/index.tsx` is the unguarded entry redirect. Guards live in `app/_layout.tsx` (`Stack.Protected`).
- Groups: `(auth)` for signed-out users, `onboarding`, `client/`, `freelancer/` and `admin/` (tab navigators via `features/profiles/components/ModeTabs.tsx`), and `(shared)` for stack screens such as project, milestone, profile, settings and invite.
- Import navigation only from `expo-router`, never from `@react-navigation/*`.

## Data

- Put one `features/<area>/api.ts` per area, holding query-key factories (`xKeys.list(...)`, `.detail(id)`) and hooks. Mutations call `supabase.rpc(...)`. Invalidate precisely on success.
- Use the generated types (`types/database.ts`: `Tables<'x'>`, `Database['public']['Functions'][...]`). Never hand-copy DB types.
- Map RPC errors to user copy in `features/<area>/errors.ts`. Use the error keys from `docs/api/*.md`.
- `lib/queryClient.ts` already pauses queries offline (NetInfo) and won't retry permanent errors (`isPermanentError`).
- Zustand is only for session state and UI prefs (`features/auth/store.ts`). Server data goes in TanStack Query.

## UI

- Import components from `@/components/ui`: Text, Button, Card, Input, Badge, StatusChip (`MILESTONE_STATUS_META`), Avatar, Screen, EmptyState, ErrorState, LoadingState/Skeleton, Money, Banner, ListItem, SegmentedControl, SelectableCard.
- Use semantic colours only. Tokens are defined in `global.css` and `tailwind.config.js`, with dark mode through `prefers-color-scheme`.
- Use motion from `@/components/motion` (D12): AnimatedList for lists, FadeContent for blocks, MoneyCountUp for balances, StarBorder only for premium badges, Aurora only on welcome. Keep it calm, with one hero effect per screen.
- Never put a NativeWind `className` and a Reanimated animated `style` on the same view (D13).
- Every screen needs loading, empty and error states, plus `accessibilityRole`, `accessibilityLabel` and `accessibilityState`, 44pt targets and keyboard-safe forms (`<Screen scroll>`).
- Money goes through `Money`/`formatINR`, for example `₹1,23,456`. User input is parsed with `rupeeInputToPaise`. Dates use `en-IN` formatting.
- Forms use react-hook-form + zodResolver with schemas from `shared/schemas/*`. Disable submit while it's pending, so nothing is submitted twice.

## Tests

Jest (`jest-expo`) + `@testing-library/react-native` 14. Motion components need `components/motion/testing/reanimatedMock.ts`. Mock `@/lib/supabase` in unit tests.
