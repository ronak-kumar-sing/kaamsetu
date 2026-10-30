import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { formatINR } from '@/shared/money';

import { BlurText } from '../BlurText';
import { FadeContent } from '../FadeContent';
import { formatRupeesWorklet } from '../MoneyCountUp';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../testing/reanimatedMock'));
jest.mock('@shopify/react-native-skia', () => ({
  Canvas: () => null,
  Fill: () => null,
  Shader: () => null,
  LinearGradient: () => null,
  Skia: { RuntimeEffect: { Make: () => null }, Color: () => [0, 0, 0, 1] },
  vec: (x: number, y: number) => ({ x, y }),
}));

describe('formatRupeesWorklet', () => {
  it.each([
    0, 5, 99, 100, 99_900, 100_000, 12_345_600, 12_345_650, 1_234_567_890_00, 12_34_56_789_00,
    1_234_567_890, -250_000,
  ])('matches formatINR for %p paise', (paise) => {
    expect(formatRupeesWorklet(paise)).toBe(formatINR(paise));
  });
});

describe('FadeContent', () => {
  it('renders children', async () => {
    await render(
      <FadeContent>
        <Text>hello</Text>
      </FadeContent>,
    );
    expect(screen.getByText('hello')).toBeTruthy();
  });
});

describe('BlurText', () => {
  it('exposes the full string to screen readers', async () => {
    await render(<BlurText text="Work with trust" />);
    expect(screen.getByLabelText('Work with trust')).toBeTruthy();
  });

  it('renders each letter when animating by letters', async () => {
    await render(<BlurText text="Hi" animateBy="letters" />);
    expect(screen.getByLabelText('Hi')).toBeTruthy();
  });
});
