import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export function useSendPhoneOtp() {
  return useMutation({
    mutationFn: async (phone: string) => {
      const { error } = await supabase.auth.signInWithOtp({ phone });
      if (error) throw error;
    },
  });
}

export function useVerifyPhoneOtp() {
  return useMutation({
    mutationFn: async ({ phone, token }: { phone: string; token: string }) => {
      const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
      if (error) throw error;
      return data.session;
    },
  });
}

export function useSendEmailOtp() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
    },
  });
}

export function useVerifyEmailOtp() {
  return useMutation({
    mutationFn: async ({ email, token }: { email: string; token: string }) => {
      const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
      if (error) throw error;
      return data.session;
    },
  });
}

/** Adds an email to a phone-authenticated account; Supabase sends a confirmation code. */
export function useLinkEmail() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
    },
  });
}

export function useVerifyLinkedEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, token }: { email: string; token: string }) => {
      const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email_change' });
      if (error) throw error;
    },
    // The auth trigger updates profiles.email / email_verified; refetch them.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles', 'me'] }),
  });
}

/**
 * Revokes the session server-side when possible. If that fails (e.g. offline), the local
 * session is still cleared so the user is never stuck signed in on this device.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) await supabase.auth.signOut({ scope: 'local' });
}

/**
 * Turns Supabase auth errors into short, user-facing copy. `stage` matters: an "invalid"
 * error while sending is a provider/number problem, not a wrong code.
 */
export function authErrorMessage(error: unknown, stage: 'send' | 'verify'): string {
  const message = error instanceof Error ? error.message : '';
  if (/rate|too many|security purposes/i.test(message))
    return 'Too many attempts. Please wait a minute and try again.';
  if (/network|fetch/i.test(message)) return 'No connection. Check your internet and try again.';
  if (stage === 'verify') {
    if (/expired|invalid/i.test(message)) return 'That code is invalid or has expired. Try again.';
    return 'We could not verify that code. Please try again.';
  }
  if (/sms|provider|phone/i.test(message))
    return "We couldn't send a text to that number. Check it, or sign in with email instead.";
  if (/email/i.test(message))
    return "We couldn't send an email to that address. Check it and try again.";
  return 'We could not send the code. Please try again.';
}
