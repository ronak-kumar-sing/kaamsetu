import { z } from 'zod';

import { rupeeInputToPaise } from '@/shared/money';
import { proposalSchema } from '@/shared/schemas/projects';

/** Text-based form values for the proposal composer, parsed into the RPC's number types. */
export const proposalFormSchema = z.object({
  cover_note: proposalSchema.shape.cover_note,
  total: z
    .string()
    .trim()
    .refine((v) => rupeeInputToPaise(v) !== null, 'Enter a valid amount, e.g. 25000')
    .transform((v) => rupeeInputToPaise(v) ?? 0)
    .pipe(proposalSchema.shape.proposed_total_paise),
  timeline_days: z
    .string()
    .trim()
    .regex(/^\d+$/, 'Enter a number of days')
    .transform(Number)
    .pipe(proposalSchema.shape.timeline_days),
});

export type ProposalFormInput = z.input<typeof proposalFormSchema>;
export type ProposalFormValues = z.output<typeof proposalFormSchema>;
