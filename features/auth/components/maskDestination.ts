/** "+919000003210" → "+91 ••••• •3210". */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  return `+91 ••••• •${digits.slice(-4)}`;
}

/** "asha@example.com" → "a•••@example.com". */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.charAt(0)}•••@${domain}`;
}
