import { z } from 'zod';

import { AVAILABILITY_STATUSES, SELF_ASSIGNABLE_ROLES } from '../constants';

/** Indian mobile number, entered as 10 digits; normalised to E.164 (+91XXXXXXXXXX). */
export const indianMobileSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, ''))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'))
  .transform((v) => `+91${v}`);

export const otpSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code');

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'));

export const rolesSchema = z
  .array(z.enum(SELF_ASSIGNABLE_ROLES))
  .min(1, 'Pick at least one role')
  .transform((roles) => [...new Set(roles)]);

export const profileSetupSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name').max(80),
  headline: z.string().trim().max(120).optional().or(z.literal('')),
  city: z.string().trim().min(2, 'Enter your city').max(60),
  bio: z.string().trim().max(1000).optional().or(z.literal('')),
  languages: z.array(z.string().trim().min(2).max(30)).max(10).default([]),
});
export type ProfileSetupInput = z.input<typeof profileSetupSchema>;
export type ProfileSetupValues = z.output<typeof profileSetupSchema>;

export const freelancerDetailsSchema = z.object({
  hourly_rate_paise: z.number().int().min(0).max(1_00_000_00).nullable(),
  availability: z.enum(AVAILABILITY_STATUSES),
});
