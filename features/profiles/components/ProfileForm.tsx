import { zodResolver } from '@hookform/resolvers/zod';
import type { ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';

import { Banner, Button, Input, SegmentedControl, Text } from '@/components/ui';
import type { Profile } from '@/features/profiles/api';
import { AVAILABILITY_STATUSES, type AvailabilityStatus } from '@/shared/constants';
import { formatINR, rupeeInputToPaise } from '@/shared/money';
import { freelancerDetailsSchema, profileSetupSchema } from '@/shared/schemas/identity';

const languagesField = z
  .string()
  .transform((text) =>
    text
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  )
  .pipe(profileSetupSchema.shape.languages.unwrap());

const hourlyRateField = z
  .string()
  .trim()
  .refine((v) => v === '' || rupeeInputToPaise(v) !== null, 'Enter a valid amount, e.g. 500')
  .transform((v) => (v === '' ? null : rupeeInputToPaise(v)))
  .pipe(freelancerDetailsSchema.shape.hourly_rate_paise);

export const profileFormSchema = profileSetupSchema.extend({
  languages: languagesField,
  hourly_rate_paise: hourlyRateField,
  availability: freelancerDetailsSchema.shape.availability,
});
export type ProfileFormInput = z.input<typeof profileFormSchema>;
export type ProfileFormValues = z.output<typeof profileFormSchema>;

const AVAILABILITY_LABEL: Record<AvailabilityStatus, string> = {
  available: 'Available',
  busy: 'Busy',
  unavailable: 'Away',
};

/** Maps a stored profile (or nothing yet) to the form's text-based field values. */
export function profileToFormInput(profile: Profile | null | undefined): ProfileFormInput {
  const paise = profile?.hourly_rate_paise ?? null;
  return {
    full_name: profile?.full_name ?? '',
    headline: profile?.headline ?? '',
    city: profile?.city ?? '',
    bio: profile?.bio ?? '',
    languages: (profile?.languages ?? []).join(', '),
    hourly_rate_paise: paise === null ? '' : formatINR(paise).replace('₹', '').replace(/,/g, ''),
    availability: profile?.availability ?? 'available',
  };
}

export interface ProfileFormProps {
  defaultValues: ProfileFormInput;
  submitLabel: string;
  onSubmit: (values: ProfileFormValues) => Promise<void>;
  /** Shows hourly rate and availability. */
  showFreelancerFields?: boolean;
  errorMessage?: string;
  /** Rendered below the submit button. */
  footer?: ReactNode;
}

export function ProfileForm({
  defaultValues,
  submitLabel,
  onSubmit,
  showFreelancerFields = false,
  errorMessage,
  footer,
}: ProfileFormProps) {
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<ProfileFormInput, unknown, ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues,
  });

  const submit = handleSubmit(onSubmit);

  return (
    <View className="gap-4">
      <Controller
        control={control}
        name="full_name"
        render={({ field, fieldState }) => (
          <Input
            label="Full name"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            textContentType="name"
            autoComplete="name"
            autoCapitalize="words"
            editable={!isSubmitting}
          />
        )}
      />
      <Controller
        control={control}
        name="headline"
        render={({ field, fieldState }) => (
          <Input
            label="Headline"
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            placeholder="e.g. Brand designer with 5 years of experience"
            editable={!isSubmitting}
          />
        )}
      />
      <Controller
        control={control}
        name="city"
        render={({ field, fieldState }) => (
          <Input
            label="City"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            textContentType="addressCity"
            autoCapitalize="words"
            editable={!isSubmitting}
          />
        )}
      />
      <Controller
        control={control}
        name="bio"
        render={({ field, fieldState }) => (
          <Input
            label="About you"
            value={field.value ?? ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            className="min-h-[96px]"
            editable={!isSubmitting}
          />
        )}
      />
      <Controller
        control={control}
        name="languages"
        render={({ field, fieldState }) => (
          <Input
            label="Languages"
            hint="Separate with commas, e.g. Hindi, English"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            autoCapitalize="words"
            editable={!isSubmitting}
          />
        )}
      />

      {showFreelancerFields ? (
        <>
          <Controller
            control={control}
            name="hourly_rate_paise"
            render={({ field, fieldState }) => (
              <Input
                label="Hourly rate"
                hint="Optional"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                leftAdornment={<Text variant="body">₹</Text>}
                keyboardType="decimal-pad"
                placeholder="500"
                editable={!isSubmitting}
              />
            )}
          />
          <Controller
            control={control}
            name="availability"
            render={({ field }) => (
              <View className="gap-1.5">
                <Text variant="body" className="font-medium">
                  Availability
                </Text>
                <SegmentedControl
                  options={AVAILABILITY_STATUSES.map((value) => ({
                    value,
                    label: AVAILABILITY_LABEL[value],
                  }))}
                  value={field.value}
                  onChange={field.onChange}
                />
              </View>
            )}
          />
        </>
      ) : null}

      {errorMessage ? <Banner tone="danger" title="Couldn't save" message={errorMessage} /> : null}

      <Button
        title={submitLabel}
        size="lg"
        fullWidth
        loading={isSubmitting}
        onPress={() => void submit()}
      />
      {footer}
    </View>
  );
}
