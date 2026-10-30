import { indianMobileSchema, otpSchema, rolesSchema } from '../schemas/identity';

describe('indianMobileSchema', () => {
  it.each(['9876543210', '+91 98765 43210', '098765-43210', '919876543210'])(
    'normalises %p to E.164',
    (input) => {
      expect(indianMobileSchema.parse(input)).toBe('+919876543210');
    },
  );

  it.each(['12345', '5876543210', '+1 4155552671'])('rejects %p', (input) => {
    expect(indianMobileSchema.safeParse(input).success).toBe(false);
  });
});

describe('otpSchema', () => {
  it('accepts 6 digits only', () => {
    expect(otpSchema.safeParse('123456').success).toBe(true);
    expect(otpSchema.safeParse('12345').success).toBe(false);
  });
});

describe('rolesSchema', () => {
  it('dedupes and rejects admin', () => {
    expect(rolesSchema.parse(['client', 'client', 'freelancer'])).toEqual(['client', 'freelancer']);
    expect(rolesSchema.safeParse(['admin']).success).toBe(false);
    expect(rolesSchema.safeParse([]).success).toBe(false);
  });
});
