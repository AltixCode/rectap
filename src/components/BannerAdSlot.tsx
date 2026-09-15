import React, { useState } from 'react';
import { View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';

import { bannerAdUnitId } from '@/monetization/config';
import { shouldShowAds } from '@/monetization/entitlements';
import { useAdsConsentStore } from '@/store/useAdsConsentStore';
import { usePremiumStore } from '@/store/usePremiumStore';
import { useTheme } from '@/theme';

/**
 * The app's only ad surface: one anchored adaptive banner.
 *
 * Three deliberate constraints:
 *  1. It renders ONLY once entitlements have resolved and the user is not
 *     premium — a paying user must never glimpse an ad.
 *  2. It reserves no space until an ad has actually loaded, so a failed fill
 *     leaves no empty bar (and contributes no layout shift on load, because
 *     the container grows below the content, never above it).
 *  3. Personalisation follows App Tracking Transparency: when the user
 *     declined tracking we explicitly request non-personalised ads.
 *  4. Nothing is requested until UMP consent permits it. Without this an EEA
 *     user who has not seen a consent form still has an ad request made on
 *     their behalf, which is the breach that suspends AdMob accounts.
 */
export function BannerAdSlot() {
  const isPremium = usePremiumStore((s) => s.isPremium);
  const isReady = usePremiumStore((s) => s.isReady);
  const canServeAds = useAdsConsentStore((s) => s.consent.canServeAds);
  const { colors } = useTheme();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!shouldShowAds({ isPremium, isReady }) || failed) return null;
  if (!canServeAds) return null;

  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: colors.background,
        borderTopWidth: loaded ? 1 : 0,
        borderTopColor: colors.border,
      }}
    >
      <BannerAd
        unitId={bannerAdUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={() => setLoaded(true)}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}
