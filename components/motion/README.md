# Motion components

Native (Reanimated 4 + Skia) ports inspired by [React Bits](https://reactbits.dev). Import from `@/components/motion`.
All components honour reduced motion (final static state, no animation), run on the UI thread, and default to the semantic palette via `useMotionPalette()`.

| Component                    | Use in this app                                           | Key props                                                                                     |
| ---------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `Aurora`                     | Welcome/auth background (behind content)                  | `colorStops`, `amplitude`, `speed`, `blend`, `paused`                                         |
| `BlurText`                   | Welcome headline                                          | `text`, `animateBy: 'words' \| 'letters'`, `delay`, `direction`, `textStyle`, `textClassName` |
| `MoneyCountUp` / `CountUp`   | Wallet balances / other numbers                           | `paise` (integer) or `to`, `from`, `duration`, `format` (worklet)                             |
| `StarBorder`                 | Premium badges only ("Deposit exempt", "Top reliability") | `color`, `radius`, `speed`, `length`, `paused`                                                |
| `AnimatedList`               | Projects, milestones, notifications                       | `data`, `renderItem`, `keyExtractor`, `stagger`, `maxAnimated`                                |
| `FadeContent`                | Fade/slide-in for any block                               | `direction`, `delay`, `duration`                                                              |
| `SpotlightCard`              | Home hero card only                                       | `spotlightColor`, `intensity`, `radius`                                                       |
| `ClickSpark`                 | Celebrations (milestone approved, payment released)       | `sparkColor`, `sparkCount`, `sparkRadius`, `duration`                                         |
| `SplitText`                  | Celebration headlines                                     | `text`, `delay`, `direction`                                                                  |
| `PressableScale`             | Buttons and tappable cards                                | `pressedScale`, all `Pressable` props                                                         |
| `ShinyText` / `GradientText` | Accent labels (rare)                                      | `text`, `fontSize`, `color`/`colors`, `speed`                                                 |
| `Particles`                  | Subtle ambient background                                 | `count` (max 60), `color`, `speed`, `paused`                                                  |

Notes

- Keep motion calm: this is a fintech trust product. Use one hero effect per screen.
- Never animate money in a way that could show a wrong final value. `MoneyCountUp` always ends on the exact `paise` formatted like `formatINR`; pass integer paise only.
- `formatRupeesWorklet` mirrors `formatINR` from `@/shared/money` and is safe to call on the UI thread.
- Backgrounds (`Aurora`, `Particles`) are `pointerEvents="none"`, hidden from accessibility, absolutely filled: place them first inside a `relative` parent.
- `SpotlightCard` and `ClickSpark` need `GestureHandlerRootView` at the app root.
- `ShinyText`/`GradientText` use Skia text with a system font (single line, fixed width) and fall back to plain `Text` when no font is available.
