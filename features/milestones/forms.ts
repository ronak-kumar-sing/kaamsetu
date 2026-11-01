import { z } from 'zod';

const linkSchema = z
  .string()
  .max(500)
  .regex(/^https:\/\/[^\s]+\.[^\s]+$/i, 'Links must start with https://');

export const MAX_LINKS = 10;

export interface ParsedLinks {
  links: string[];
  /** First problem found, if any. */
  error?: string;
}

/** One link per line (or comma/space separated). Blank input is allowed. */
export function parseLinks(text: string): ParsedLinks {
  const parts = text
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const unique = [...new Set(parts)];
  if (unique.length > MAX_LINKS) return { links: [], error: `Add at most ${MAX_LINKS} links` };
  for (const part of unique) {
    const result = linkSchema.safeParse(part);
    if (!result.success) {
      return {
        links: [],
        error: `"${part.slice(0, 40)}": ${result.error.issues[0]?.message ?? 'invalid link'}`,
      };
    }
  }
  return { links: unique };
}

export const submitWorkSchema = z.object({
  note: z.string().trim().min(10, 'Tell the client what you are delivering').max(2000),
});

export const revisionNoteSchema = z.object({
  note: z.string().trim().min(10, 'Explain what needs to change').max(2000),
});

/** Revisions the client can still request on a milestone. */
export function revisionsRemaining(limit: number, used: number): number {
  return Math.max(0, limit - used);
}
