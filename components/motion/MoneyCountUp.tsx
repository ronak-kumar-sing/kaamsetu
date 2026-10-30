// Native port inspired by React Bits CountUp (https://reactbits.dev) — MIT + Commons Clause.
import { CountUp, type CountUpProps } from './CountUp';

/**
 * Indian-grouped rupee formatter written as a worklet. Mirrors `formatINR` from
 * `@/shared/money` for safe integer paise: paise are shown only when non-zero.
 */
export function formatRupeesWorklet(paise: number): string {
  'worklet';
  const negative = paise < 0;
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / 100);
  const fraction = abs % 100;
  const digits = String(rupees);
  let grouped = digits;
  if (digits.length > 3) {
    let head = digits.slice(0, digits.length - 3);
    const tail = digits.slice(-3);
    let out = tail;
    while (head.length > 2) {
      out = head.slice(-2) + ',' + out;
      head = head.slice(0, head.length - 2);
    }
    grouped = head.length > 0 ? head + ',' + out : out;
  }
  const frac = fraction !== 0 ? '.' + (fraction < 10 ? '0' : '') + String(fraction) : '';
  return (negative && abs !== 0 ? '-' : '') + '₹' + grouped + frac;
}

export interface MoneyCountUpProps extends Omit<
  CountUpProps,
  'to' | 'from' | 'format' | 'decimals'
> {
  /** Target amount in integer paise. */
  paise: number;
  /** Start amount in integer paise. Default 0. */
  fromPaise?: number;
}

/**
 * Animates a rupee balance. Intermediate frames are whole rupees; the final frame is the exact
 * `paise` value formatted like `formatINR`, so a wrong final amount can never be displayed.
 */
export function MoneyCountUp({ paise, fromPaise = 0, ...rest }: MoneyCountUpProps) {
  const target = Math.trunc(paise);
  const format = (n: number): string => {
    'worklet';
    if (n === target) return formatRupeesWorklet(target);
    return formatRupeesWorklet(Math.trunc(n / 100) * 100);
  };
  return <CountUp {...rest} from={Math.trunc(fromPaise)} to={target} format={format} />;
}
