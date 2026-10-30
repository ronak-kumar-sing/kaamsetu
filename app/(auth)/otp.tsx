import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';

import { Banner, Button, EmptyState, Input, Screen, Text } from '@/components/ui';
import {
  authErrorMessage,
  useSendEmailOtp,
  useSendPhoneOtp,
  useVerifyEmailOtp,
  useVerifyPhoneOtp,
} from '@/features/auth/api';
import { maskEmail, maskPhone } from '@/features/auth/components/maskDestination';
import { useCountdown } from '@/features/auth/components/useCountdown';
import { isDev } from '@/lib/env';
import { otpSchema } from '@/shared/schemas/identity';

const RESEND_SECONDS = 30;

type Params = { phone?: string; email?: string; channel: 'sms' | 'email' };

export default function OtpScreen() {
  const { phone, email, channel } = useLocalSearchParams<Params>();
  const destination = channel === 'email' ? email : phone;

  const verifyPhone = useVerifyPhoneOtp();
  const verifyEmail = useVerifyEmailOtp();
  const sendPhone = useSendPhoneOtp();
  const sendEmail = useSendEmailOtp();
  const verify = channel === 'email' ? verifyEmail : verifyPhone;
  const resend = channel === 'email' ? sendEmail : sendPhone;

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const submitting = useRef(false);
  const { remaining, restart } = useCountdown(RESEND_SECONDS);

  const submit = useCallback(
    async (value: string) => {
      if (submitting.current || !destination) return;
      const parsed = otpSchema.safeParse(value);
      if (!parsed.success) {
        setCodeError(parsed.error.issues[0]?.message);
        return;
      }
      setCodeError(undefined);
      submitting.current = true;
      try {
        // On success the session appears and the root guard swaps the navigator for us.
        if (channel === 'email') {
          await verifyEmail.mutateAsync({ email: destination, token: parsed.data });
        } else {
          await verifyPhone.mutateAsync({ phone: destination, token: parsed.data });
        }
      } catch {
        setCode('');
      } finally {
        submitting.current = false;
      }
    },
    [channel, destination, verifyEmail, verifyPhone],
  );

  const onChangeCode = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    setCodeError(undefined);
    if (digits.length === 6) void submit(digits);
  };

  const onResend = async () => {
    if (!destination || remaining > 0 || resend.isPending) return;
    verify.reset();
    try {
      if (channel === 'email') await sendEmail.mutateAsync(destination);
      else await sendPhone.mutateAsync(destination);
      setCode('');
      restart();
    } catch {
      // Surfaced via resend.error below.
    }
  };

  if (!destination) {
    return (
      <Screen>
        <EmptyState
          title="Start sign-in again"
          description="We lost track of where to send your code."
          actionLabel="Back to start"
          onAction={() => router.replace('/welcome')}
        />
      </Screen>
    );
  }

  const masked = channel === 'email' ? maskEmail(destination) : maskPhone(destination);
  const verifying = verify.isPending;

  return (
    <Screen scroll>
      <View className="gap-6">
        <View className="gap-2">
          <Text variant="title">Enter the code</Text>
          <Text variant="body" tone="muted">
            We sent a 6-digit code to {masked}.
          </Text>
        </View>

        <Input
          label="6-digit code"
          value={code}
          onChangeText={onChangeCode}
          error={codeError}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={6}
          autoFocus
          editable={!verifying}
          placeholder="••••••"
          className="text-center text-2xl tracking-[8px]"
        />

        {verify.isError ? (
          <Banner
            tone="danger"
            title="Couldn't verify the code"
            message={authErrorMessage(verify.error, 'verify')}
          />
        ) : null}
        {resend.isError ? (
          <Banner
            tone="danger"
            title="Couldn't resend the code"
            message={authErrorMessage(resend.error, 'send')}
          />
        ) : null}

        <Button
          title="Verify"
          size="lg"
          fullWidth
          loading={verifying}
          disabled={code.length !== 6}
          onPress={() => void submit(code)}
        />

        <Button
          title={remaining > 0 ? `Resend code in ${remaining}s` : 'Resend code'}
          variant="ghost"
          fullWidth
          loading={resend.isPending}
          disabled={remaining > 0}
          onPress={() => void onResend()}
        />

        {isDev ? <Text variant="caption">Local test numbers 9000000001–9: code 123456</Text> : null}
      </View>
    </Screen>
  );
}
