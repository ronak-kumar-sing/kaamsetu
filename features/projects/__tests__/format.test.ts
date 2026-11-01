import {
  addDays,
  dueLabel,
  formatDate,
  isValidIsoDate,
  relativeTime,
  todayInIndia,
} from '../format';

describe('formatDate', () => {
  it('formats ISO dates as 12 Nov 2026', () => {
    expect(formatDate('2026-11-12')).toBe('12 Nov 2026');
    expect(formatDate('2027-01-05')).toBe('5 Jan 2027');
    expect(formatDate('2026-09-30T10:00:00Z')).toBe('30 Sep 2026');
  });
  it('is forgiving with bad input', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate('soon')).toBe('soon');
  });
});

describe('isValidIsoDate', () => {
  it('accepts real dates only', () => {
    expect(isValidIsoDate('2028-02-29')).toBe(true);
    expect(isValidIsoDate('2027-02-29')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('26-1-1')).toBe(false);
  });
});

describe('todayInIndia / addDays', () => {
  it('uses the Asia/Kolkata calendar day', () => {
    // 20:00 UTC on 11 Nov is already 12 Nov 01:30 in India.
    expect(todayInIndia(new Date('2026-11-11T20:00:00Z'))).toBe('2026-11-12');
    expect(todayInIndia(new Date('2026-11-11T10:00:00Z'))).toBe('2026-11-11');
  });
  it('adds days across month ends', () => {
    expect(addDays('2026-11-28', 5)).toBe('2026-12-03');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-11-12T12:00:00Z');
  it.each([
    ['2026-11-12T11:59:40Z', 'just now'],
    ['2026-11-12T11:30:00Z', '30 min ago'],
    ['2026-11-12T09:00:00Z', '3 h ago'],
    ['2026-11-11T09:00:00Z', 'yesterday'],
    ['2026-11-08T12:00:00Z', '4 days ago'],
    ['2026-08-01T12:00:00Z', '1 Aug 2026'],
  ])('%s -> %s', (iso, expected) => {
    expect(relativeTime(iso, now)).toBe(expected);
  });
});

describe('dueLabel', () => {
  it('describes distance from today', () => {
    expect(dueLabel('2026-11-12', '2026-11-12')).toBe('Due today');
    expect(dueLabel('2026-11-13', '2026-11-12')).toBe('Due tomorrow');
    expect(dueLabel('2026-11-20', '2026-11-12')).toBe('Due in 8 days');
    expect(dueLabel('2026-11-10', '2026-11-12')).toBe('2 days overdue');
  });
});
