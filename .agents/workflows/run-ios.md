---
description: Build and run the app in the iOS Simulator against the local Supabase stack.
---

# /run-ios

1. Docker must be running, and `npm run db:start` must be up.
2. `.env.local` needs `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, the anon key from `npx supabase status`, and `EXPO_PUBLIC_APP_ENV=development`.
3. On the first build, or after adding a native module: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo run:ios`. It needs Xcode and CocoaPods. If CocoaPods complains about the encoding, run `cd ios && LANG=en_US.UTF-8 pod install` first.
4. After that, just start Metro: `npx expo start --dev-client`, then open the KaamSetu app in the simulator.
5. Sign in with a test phone `9000000001`–`9000000008` and code `123456`. `9000000009` is the seeded admin.
6. iOS AutoFill may offer the simulator's own phone number in the phone field. Don't accept it: type a test number.
