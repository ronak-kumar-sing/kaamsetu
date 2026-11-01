import { View } from 'react-native';

import { Avatar, Badge, Card, Money, Text } from '@/components/ui';
import { avatarUrl } from '@/features/profiles/api';

export interface FreelancerCardData {
  id: string;
  full_name: string | null;
  headline: string | null;
  city: string | null;
  avatar_path: string | null;
  hourly_rate_paise: number | null;
  kyc_verified: boolean;
  portfolio_verified: boolean;
  phone_verified: boolean;
}

export function FreelancerCard({
  freelancer,
  onPress,
}: {
  freelancer: FreelancerCardData;
  onPress: () => void;
}) {
  const name = freelancer.full_name ?? 'Freelancer';
  return (
    <View className="mb-3">
      <Card onPress={onPress} className="gap-3">
        <View className="flex-row items-center gap-3">
          <Avatar uri={avatarUrl(freelancer.avatar_path)} name={name} size={48} />
          <View className="flex-1">
            <Text variant="subheading" numberOfLines={1}>
              {name}
            </Text>
            {freelancer.headline ? (
              <Text variant="caption" numberOfLines={2}>
                {freelancer.headline}
              </Text>
            ) : null}
            {freelancer.city ? <Text variant="caption">{freelancer.city}</Text> : null}
          </View>
          {freelancer.hourly_rate_paise ? (
            <View className="items-end">
              <Money paise={freelancer.hourly_rate_paise} variant="subheading" />
              <Text variant="caption">per hour</Text>
            </View>
          ) : null}
        </View>
        <VerificationBadges
          kyc={freelancer.kyc_verified}
          portfolio={freelancer.portfolio_verified}
          phone={freelancer.phone_verified}
        />
      </Card>
    </View>
  );
}

export function VerificationBadges({
  kyc,
  portfolio,
  phone,
}: {
  kyc: boolean;
  portfolio: boolean;
  phone: boolean;
}) {
  if (!kyc && !portfolio && !phone) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {kyc ? <Badge label="ID verified" tone="success" /> : null}
      {portfolio ? <Badge label="Portfolio verified" tone="success" /> : null}
      {phone ? <Badge label="Phone verified" tone="info" /> : null}
    </View>
  );
}
