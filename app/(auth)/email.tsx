import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';

import { Banner, Button, Input, Screen, Text } from '@/components/ui';
import { authErrorMessage, useSendEmailOtp } from '@/features/auth/api';
import { emailSchema } from '@/shared/schemas/identity';

const formSchema = z.object({ email: emailSchema });
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

export default function EmailScreen() {
  const sendOtp = useSendEmailOtp();
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '' },
  });

  const busy = isSubmitting || sendOtp.isPending;

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await sendOtp.mutateAsync(email);
      router.push({ pathname: '/otp', params: { email, channel: 'email' } });
    } catch {
      // Surfaced via sendOtp.error below.
    }
  });

  return (
    <Screen scroll>
      <View className="gap-6">
        <View className="gap-2">
          <Text variant="title">Your email</Text>
          <Text variant="body" tone="muted">
            We&apos;ll email you a 6-digit code to sign in.
          </Text>
        </View>

        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <Input
              label="Email address"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="you@example.com"
              autoFocus
              editable={!busy}
              returnKeyType="go"
              onSubmitEditing={() => void onSubmit()}
            />
          )}
        />

        {sendOtp.isError ? (
          <Banner
            tone="danger"
            title="Couldn't send the code"
            message={authErrorMessage(sendOtp.error, 'send')}
          />
        ) : null}

        <Button
          title="Send code"
          size="lg"
          fullWidth
          loading={busy}
          onPress={() => void onSubmit()}
        />
      </View>
    </Screen>
  );
}
