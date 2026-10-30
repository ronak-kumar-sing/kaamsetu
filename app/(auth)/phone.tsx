import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';

import { Banner, Button, Input, Screen, Text } from '@/components/ui';
import { authErrorMessage, useSendPhoneOtp } from '@/features/auth/api';
import { indianMobileSchema } from '@/shared/schemas/identity';

const formSchema = z.object({ phone: indianMobileSchema });
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

export default function PhoneScreen() {
  const sendOtp = useSendPhoneOtp();
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: { phone: '' },
  });

  const busy = isSubmitting || sendOtp.isPending;

  const onSubmit = handleSubmit(async ({ phone }) => {
    try {
      await sendOtp.mutateAsync(phone);
      router.push({ pathname: '/otp', params: { phone, channel: 'sms' } });
    } catch {
      // Surfaced via sendOtp.error below.
    }
  });

  return (
    <Screen scroll>
      <View className="gap-6">
        <View className="gap-2">
          <Text variant="title">Your mobile number</Text>
          <Text variant="body" tone="muted">
            We&apos;ll text you a 6-digit code to sign in.
          </Text>
        </View>

        <Controller
          control={control}
          name="phone"
          render={({ field, fieldState }) => (
            <Input
              label="Mobile number"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              leftAdornment={<Text variant="body">+91</Text>}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              maxLength={14}
              placeholder="10-digit mobile number"
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
