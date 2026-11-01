import { parseLinks, revisionsRemaining, submitWorkSchema } from '../forms';

describe('parseLinks', () => {
  it('splits on whitespace and commas and dedupes', () => {
    expect(parseLinks('https://a.com/x, https://b.com\nhttps://a.com/x').links).toEqual([
      'https://a.com/x',
      'https://b.com',
    ]);
  });
  it('allows blank input', () => {
    expect(parseLinks('  ')).toEqual({ links: [] });
  });
  it('rejects non-http links', () => {
    expect(parseLinks('ftp://x.com').error).toBeTruthy();
    expect(parseLinks('http://x.com').error).toMatch(/https/);
    expect(parseLinks('not a link').error).toBeTruthy();
  });
  it('limits the count', () => {
    const many = Array.from({ length: 11 }, (_, i) => `https://a${i}.com`).join(' ');
    expect(parseLinks(many).error).toMatch(/at most/);
  });
});

describe('forms', () => {
  it('requires a meaningful note', () => {
    expect(submitWorkSchema.safeParse({ note: 'short' }).success).toBe(false);
    expect(submitWorkSchema.safeParse({ note: 'All screens delivered in Figma' }).success).toBe(
      true,
    );
  });
  it('counts remaining revisions', () => {
    expect(revisionsRemaining(2, 1)).toBe(1);
    expect(revisionsRemaining(2, 3)).toBe(0);
  });
});
