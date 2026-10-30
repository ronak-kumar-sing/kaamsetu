import { formatINR, paiseToRupeeString, percentOf, rupeeInputToPaise } from '../money';

describe('formatINR', () => {
  it.each([
    [0, '₹0'],
    [100, '₹1'],
    [99_900, '₹999'],
    [1_000_00, '₹1,000'],
    [1_23_456_00, '₹1,23,456'],
    [12_34_56_789_00, '₹12,34,56,789'],
    [1_23_456_50, '₹1,23,456.50'],
    [5, '₹0.05'],
    [-2_500_00, '-₹2,500'],
  ])('formats %p paise as %p', (paise, expected) => {
    expect(formatINR(paise)).toBe(expected);
  });

  it('can always show paise', () => {
    expect(formatINR(1_000_00, { alwaysShowPaise: true })).toBe('₹1,000.00');
  });

  it('rejects unsafe numbers', () => {
    expect(() => formatINR(0.5)).toThrow(RangeError);
  });
});

describe('paiseToRupeeString', () => {
  it.each([
    [49_900, '499.00'],
    [1, '0.01'],
    [1_23_456_78, '123456.78'],
  ])('converts %p to %p', (paise, expected) => {
    expect(paiseToRupeeString(paise)).toBe(expected);
  });

  it('rejects negative amounts', () => {
    expect(() => paiseToRupeeString(-1)).toThrow(RangeError);
  });
});

describe('rupeeInputToPaise', () => {
  it.each([
    ['499', 49_900],
    ['1,23,456.5', 1_23_456_50],
    ['₹ 2,000.05', 2_000_05],
    ['0.1', 10],
  ])('parses %p', (input, expected) => {
    expect(rupeeInputToPaise(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.234', '-5', '1e3'])('rejects %p', (input) => {
    expect(rupeeInputToPaise(input)).toBeNull();
  });
});

describe('percentOf', () => {
  it('rounds down to whole paise', () => {
    expect(percentOf(1_000_01, 5)).toBe(5_000);
    expect(percentOf(20_000_00, 5)).toBe(1_000_00);
  });
});
