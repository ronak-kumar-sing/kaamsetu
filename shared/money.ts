// All money is integer paise. Never use floating point for amounts.

const PAISE_PER_RUPEE = 100n;

function assertSafePaise(paise: number | bigint): bigint {
  if (typeof paise === 'number' && !Number.isSafeInteger(paise)) {
    throw new RangeError(`Paise must be a safe integer, got ${paise}`);
  }
  return BigInt(paise);
}

/** Groups digits the Indian way: 1234567 → "12,34,567". */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
}

/**
 * Formats paise as rupees, e.g. 12345600 → "₹1,23,456" and 12345650 → "₹1,23,456.50".
 * Paise are shown only when non-zero unless `alwaysShowPaise` is set.
 */
export function formatINR(
  paise: number | bigint,
  { alwaysShowPaise = false }: { alwaysShowPaise?: boolean } = {},
): string {
  const value = assertSafePaise(paise);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const rupees = abs / PAISE_PER_RUPEE;
  const fraction = abs % PAISE_PER_RUPEE;
  const showFraction = alwaysShowPaise || fraction !== 0n;
  const body =
    groupIndian(rupees.toString()) +
    (showFraction ? `.${fraction.toString().padStart(2, '0')}` : '');
  return `${negative ? '-' : ''}₹${body}`;
}

/** Converts paise to the decimal rupee string payment gateways expect: 49900 → "499.00". */
export function paiseToRupeeString(paise: number | bigint): string {
  const value = assertSafePaise(paise);
  if (value < 0n) throw new RangeError('Amount cannot be negative');
  return `${value / PAISE_PER_RUPEE}.${(value % PAISE_PER_RUPEE).toString().padStart(2, '0')}`;
}

/**
 * Parses user-entered rupees ("1,23,456.5", "499") into paise without floats.
 * Returns null for anything that is not a valid non-negative amount with ≤ 2 decimals.
 */
export function rupeeInputToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const [, whole = '0', frac = ''] = match;
  const paise = BigInt(whole) * PAISE_PER_RUPEE + BigInt(frac.padEnd(2, '0') || '0');
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(paise);
}

/** Integer percentage of a paise amount, rounded down. */
export function percentOf(paise: number, pct: number): number {
  return Number((BigInt(paise) * BigInt(Math.round(pct * 100))) / 10_000n);
}
