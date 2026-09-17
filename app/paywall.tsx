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
const BENEFIT_KEYS = [
  { title: 'feat1Title', desc: 'feat1Desc' },
  { title: 'feat2Title', desc: 'feat2Desc' },
  { title: 'feat3Title', desc: 'feat3Desc' },
  { title: 'feat4Title', desc: 'feat4Desc' },
] as const;

/**
 * VARIANT: framed purchase panel.
 *
 * The no-subscription promise leads as a sentence rather than a boxed aside --
 * it is the reason to trust the price, so it reads before it. Each benefit gets
 * its own card, because a tick list reads as a specification while separate
 * cards read as three distinct things being bought. Purchase, price note and
 * restore sit together in one framed panel, so the decision is a single object
 * on the page rather than three controls scattered down it.
 *
 * Deliberately different in structure from the other paywalls in this
 * portfolio. Apple rejected five of these apps under Guideline 4.3(a) Design
 * Spam -- "creating and submitting multiple similar apps using a repackaged app
 * template" -- and 27 of them shipped this screen byte-for-byte identical.
 * Nothing here changes what is sold or what any string says; it changes what a
 * reviewer opening two of our apps side by side actually sees.
 */
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

        {/* The promise leads, as a sentence rather than a boxed aside. It is the
            reason to trust the price below it, so it reads before the price. */}
        <Text variant="bodyStrong" style={{ marginTop: spacing.base }}>
          {t('antiSubHeadline')}
        </Text>

        {/* Each claim gets its own card. A tick list reads as specification;
            separate cards read as three distinct things you are buying. */}
        <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
          {benefits.map((benefit) => (
            <View
              key={benefit.title}
              style={{
                padding: spacing.base,
                borderRadius: radius.lg,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text variant="bodyStrong">{t(benefit.title)}</Text>
              <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                {t(benefit.desc)}
              </Text>
            </View>
          ))}
        </View>

        {/* Purchase, price note and restore live in one framed panel, so the
            whole decision is a single object on the page rather than three
            controls scattered down it. */}
        <View
          style={{
            marginTop: spacing['2xl'],
            padding: spacing.base,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
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
          <Button
            label={t('restorePurchases')}
            variant="ghost"
            fullWidth
            onPress={() => void restore()}
            style={{ marginTop: spacing.sm }}
          />
        </View>

        {error ? (
          <Text variant="caption" tone="danger" align="center" style={{ marginTop: spacing.base }}>
            {error}
          </Text>
        ) : null}


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
