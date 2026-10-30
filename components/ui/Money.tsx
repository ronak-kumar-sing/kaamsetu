import { formatINR } from '@/shared/money';
import { Text, type TextTone, type TextVariant } from './Text';

export interface MoneyProps {
  /** Integer paise. Never pass a floating-point rupee amount. */
  paise: number;
  variant?: TextVariant;
  tone?: TextTone;
  className?: string;
}

/** Spoken form for screen readers: 12345600 → "1,23,456 rupees"; 12345650 → "1,23,456 rupees and 50 paise". */
function spokenAmount(paise: number): string {
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const remainder = abs % 100;
  const rupeeText = formatINR(rupees * 100).replace('₹', '');
  const sign = paise < 0 ? 'minus ' : '';
  const paiseText = remainder > 0 ? ` and ${remainder} paise` : '';
  return `${sign}${rupeeText} rupees${paiseText}`;
}

export function Money({ paise, variant = 'body', tone, className }: MoneyProps) {
  return (
    <Text
      variant={variant}
      tone={tone}
      className={className}
      accessibilityLabel={spokenAmount(paise)}
    >
      {formatINR(paise)}
    </Text>
  );
}
