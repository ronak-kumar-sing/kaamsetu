import { useState } from 'react';
import { View } from 'react-native';

import { Banner, Button, Card, Input, Text } from '@/components/ui';
import { authErrorMessage, useLinkEmail, useVerifyLinkedEmail } from '@/features/auth/api';
import { emailSchema, otpSchema } from '@/shared/schemas/identity';

/** Inline "Add email" flow: enter an address, then the confirmation code Supabase emails. */
export function LinkEmailCard() {
  const link = useLinkEmail();
  const verify = useVerifyLinkedEmail();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  const sendCode = async () => {
    if (link.isPending) return;
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }
    setFieldError(undefined);
    try {
      await link.mutateAsync(parsed.data);
      setSentTo(parsed.data);
      setCode('');
    } catch {
      // Surfaced via link.error below.
    }
  };

  const confirm = async () => {
    if (verify.isPending || !sentTo) return;
    const parsed = otpSchema.safeParse(code);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }
    setFieldError(undefined);
    try {
      await verify.mutateAsync({ email: sentTo, token: parsed.data });
      setSentTo(null);
      setEmail('');
      setCode('');
    } catch {
      // Surfaced via verify.error below.
    }
  };

  return (
    <Card className="gap-3">
      <Text variant="subheading">Add email</Text>
      {sentTo ? (
        <>
          <Text variant="caption">Enter the 6-digit code we sent to {sentTo}.</Text>
          <Input
            label="Confirmation code"
            value={code}
            onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
            error={fieldError}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={6}
            editable={!verify.isPending}
          />
          {verify.isError ? (
            <Banner
              tone="danger"
              title="Couldn't verify the code"
              message={authErrorMessage(verify.error, 'verify')}
            />
          ) : null}
          <View className="gap-2">
            <Button
              title="Verify email"
              loading={verify.isPending}
              onPress={() => void confirm()}
            />
            <Button
              title="Use a different email"
              variant="ghost"
              disabled={verify.isPending}
              onPress={() => setSentTo(null)}
            />
          </View>
        </>
      ) : (
        <>
          <Text variant="caption">
            Verify an email address to recover your account and get receipts.
          </Text>
          <Input
            label="Email address"
            value={email}
            onChangeText={setEmail}
            error={fieldError}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!link.isPending}
          />
          {link.isError ? (
            <Banner
              tone="danger"
              title="Couldn't send the code"
              message={authErrorMessage(link.error, 'send')}
            />
          ) : null}
          <Button title="Send code" loading={link.isPending} onPress={() => void sendCode()} />
        </>
      )}
    </Card>
  );
}
