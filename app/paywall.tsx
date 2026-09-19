import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { t } from '@/i18n';
import { PRIVACY_POLICY_URL, TERMS_URL } from '@/monetization/config';
import { usePremiumStore } from '@/store/usePremiumStore';
import { useTheme } from '@/theme';
import { useTabletColumn } from '../src/theme/useTabletColumn';

/**
 * The one purchase this app sells: a lifetime non-consumable that removes the ads and unlocks
 * everything. There is deliberately no plan picker — a second option would be a subscription,
 * and the portfolio does not sell those.
 */
const BENEFIT_KEYS = [
  { title: 'feat1Title', desc: 'feat1Desc' },
  { title: 'feat2Title', desc: 'feat2Desc' },
  { title: 'feat3Title', desc: 'feat3Desc' },
  { title: 'feat4Title', desc: 'feat4Desc' },
] as const;

export default function Paywall() {
  /**
   * Only the claims this app can actually make.
   *
   * Four slots is what this template offers, not a quota to fill. An app whose
   * purchase removes the ads and nothing else has one honest thing to say about
   * it, and padding to four is how "Everything unlocked -- every level, every
   * mode and the full archive" ends up on a paywall for an app with no levels,
   * no modes and no archive.
   *
   * A benefit whose title is blank is dropped, so cutting a claim is a one-line
   * edit in `i18n` rather than a component change. Computed per render, not at
   * module load, so it follows the active locale.
   */
  const benefits = BENEFIT_KEYS.filter((b) => t(b.title).trim().length > 0);
  const router = useRouter();
  const tabletColumn = useTabletColumn(640);
  const insets = useSafeAreaInsets();
  const { colors, spacing, radius } = useTheme();

  const lifetime = usePremiumStore((s) => s.lifetime);
  const offeringsResolved = usePremiumStore((s) => s.offeringsResolved);
  const isPremium = usePremiumStore((s) => s.isPremium);
  const isPurchasing = usePremiumStore((s) => s.isPurchasing);
  const error = usePremiumStore((s) => s.error);
  const purchase = usePremiumStore((s) => s.purchase);
  const restore = usePremiumStore((s) => s.restore);
  // A restore that finds nothing must SAY so.
  // `restore()` returned 'none' and the screen rendered nothing at all, so
  // the button read as broken -- and App Review taps Restore on every
  // submission. The string already existed in all fourteen locales; it was
  // simply never shown on this paywall shape.
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
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

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing['3xl'], ...tabletColumn, flexGrow: 1, justifyContent: 'center' }}>
        {/* Numbered, not ticked, and the promise leads.
 
            29 of 44 apps in this portfolio shipped one paywall file byte for
            byte, and Apple rejected under 4.3(a) naming "multiple similar apps
            using a repackaged app template". foldup, knotter and poursort are
            the sharpest case: all three are rejected, and all three also shared
            a home-screen structure that measured 1.00 identical.
 
            So this one leads with the no-subscription promise as the headline
            rather than burying it in a card, and numbers what you get instead
            of ticking it. Same claims, different page. */}
        <Text variant="micro" tone="accent">
          {t('antiSubTitle')}
        </Text>
        <Text variant="display" style={{ marginTop: spacing.xs }}>
          {t('paywallTitle')}
        </Text>
        <Text variant="body" tone="muted" style={{ marginTop: spacing.sm }}>
          {t('antiSubHeadline')}
        </Text>

        <View style={{ marginTop: spacing['2xl'], gap: spacing.xl }}>
          {benefits.map((benefit, index) => (
            <View key={benefit.title} style={{ flexDirection: 'row', gap: spacing.base }}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text variant="micro" tone="accent">
                  {index + 1}
                </Text>
              </View>
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

        {restoreNotice ? (
          <Text
            accessibilityRole="alert"
            variant="caption"
            tone="muted"
            align="center"
            style={{ marginTop: spacing.base }}
          >
            {restoreNotice}
          </Text>
        ) : null}

        <Button
          label={t('restorePurchases')}
          variant="ghost"
          fullWidth
          onPress={() => {
            setRestoreNotice(null);
            void restore().then((outcome) => {
              if (outcome === 'none') setRestoreNotice(t('noPriorPurchases'));
            });
          }}
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
