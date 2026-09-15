import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { t } from '@/i18n';
import { PRIVACY_POLICY_URL, TERMS_URL } from '@/monetization/config';
import { usePremiumStore } from '@/store/usePremiumStore';
import { useTheme } from '@/theme';

/**
 * The one purchase this app sells: a lifetime non-consumable that removes the ads and unlocks
 * everything. There is deliberately no plan picker — a second option would be a subscription,
 * and the portfolio does not sell those.
 */
const BENEFITS = [
  { title: 'feat1Title', desc: 'feat1Desc' },
  { title: 'feat2Title', desc: 'feat2Desc' },
  { title: 'feat3Title', desc: 'feat3Desc' },
  { title: 'feat4Title', desc: 'feat4Desc' },
] as const;

export default function Paywall() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, spacing, radius } = useTheme();

  const lifetime = usePremiumStore((s) => s.lifetime);
  const offeringsResolved = usePremiumStore((s) => s.offeringsResolved);
  const isPremium = usePremiumStore((s) => s.isPremium);
  const isPurchasing = usePremiumStore((s) => s.isPurchasing);
  const error = usePremiumStore((s) => s.error);
  const purchase = usePremiumStore((s) => s.purchase);
  const restore = usePremiumStore((s) => s.restore);
  const refreshOfferings = usePremiumStore((s) => s.refreshOfferings);

  useEffect(() => {
    void refreshOfferings();
  }, [refreshOfferings]);

  // A user who already owns it must never be left staring at a buy button.
  useEffect(() => {
    if (isPremium) router.back();
  }, [isPremium, router]);

  const price = lifetime?.product.priceString;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={{ alignItems: 'flex-end', padding: spacing.base }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('close')}
          hitSlop={12}
          onPress={() => router.back()}
          style={{ minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <Text variant="body" tone="muted">
            {t('close')}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing['3xl'] }}>
        <Text variant="display">{t('paywallTitle')}</Text>

        <View
          style={{
            marginTop: spacing.lg,
            padding: spacing.base,
            borderRadius: radius.lg,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text variant="micro" tone="accent">
            {t('antiSubTitle')}
          </Text>
          <Text variant="body" style={{ marginTop: spacing.xs }}>
            {t('antiSubHeadline')}
          </Text>
        </View>

        <View style={{ marginTop: spacing.xl, gap: spacing.lg }}>
          {BENEFITS.map((benefit) => (
            <View key={benefit.title} style={{ flexDirection: 'row', gap: spacing.md }}>
              <Text variant="bodyStrong" tone="accent">
                ✓
              </Text>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{t(benefit.title)}</Text>
                <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                  {t(benefit.desc)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ marginTop: spacing['2xl'] }}>
          {lifetime ? (
            <Button
              label={price ? t('lifetimeAccess', { price }) : t('lifetimeAccessPlain')}
              size="lg"
              fullWidth
              loading={isPurchasing}
              onPress={() => void purchase(lifetime)}
            />
          ) : offeringsResolved ? (
            // Resolved, with no package: the store is genuinely unreachable or carries no
            // product yet. Say that, and keep Restore reachable below — a user who already
            // paid must still be able to get their purchase back.
            <View style={{ padding: spacing.xl, alignItems: 'center' }}>
              <Text variant="caption" tone="muted" align="center">
                {t('storeUnavailable')}
              </Text>
            </View>
          ) : (
            <View style={{ padding: spacing.xl, alignItems: 'center' }}>
              <ActivityIndicator color={colors.textMuted} />
              <Text variant="caption" tone="muted" style={{ marginTop: spacing.md }}>
                {t('loadingPrice')}
              </Text>
            </View>
          )}
          <Text variant="caption" tone="muted" align="center" style={{ marginTop: spacing.md }}>
            {t('oneTimePayment')}
          </Text>
        </View>

        {error ? (
          <Text variant="caption" tone="danger" align="center" style={{ marginTop: spacing.base }}>
            {error}
          </Text>
        ) : null}

        <Button
          label={t('restorePurchases')}
          variant="ghost"
          fullWidth
          onPress={() => void restore()}
          style={{ marginTop: spacing.lg }}
        />

        <Text variant="micro" tone="faint" align="center" style={{ marginTop: spacing.xl }}>
          {t('adsDisclosure')}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            gap: spacing.lg,
            marginTop: spacing.md,
          }}
        >
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('termsOfUse')}
            hitSlop={12}
            onPress={() => void Linking.openURL(TERMS_URL)}
          >
            <Text variant="micro" tone="faint">
              {t('termsOfUse')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('privacyPolicy')}
            hitSlop={12}
            onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
          >
            <Text variant="micro" tone="faint">
              {t('privacyPolicy')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
