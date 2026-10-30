/** Joins truthy class strings. Falsy values (false, null, undefined, '') are dropped. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ');
}
