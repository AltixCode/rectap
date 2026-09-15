import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';

import { BannerAdSlot } from '@/components/BannerAdSlot';
import { Screen, Text } from '@/components/ui';
import { t } from '@/i18n';
import { showPrivacyOptionsForm } from '@/monetization/ads';
import { PRIVACY_POLICY_URL, SUPPORT_EMAIL, TERMS_URL } from '@/monetization/config';
import { useAdsConsentStore } from '@/store/useAdsConsentStore';
import { usePremiumStore } from '@/store/usePremiumStore';
import { useTheme, type ThemePreference } from '@/theme';

const THEME_OPTIONS: { key: ThemePreference; label: 'themeSystem' | 'themeLight' | 'themeDark' }[] = [
  { key: 'system', label: 'themeSystem' },
  { key: 'light', label: 'themeLight' },
  { key: 'dark', label: 'themeDark' },
];

function SectionLabel({ children }: { children: string }) {
  const { spacing } = useTheme();
  return (
    <Text variant="micro" tone="faint" style={{ marginTop: spacing.xl }}>
      {children}
    </Text>
  );
}

function Row({ label, detail, onPress }: { label: string; detail?: string; onPress?: () => void }) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={label}
      disabled={!onPress}
      onPress={onPress}
      style={{
        minHeight: 48,
        paddingVertical: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      {detail ? (
        <Text variant="caption" tone="muted">
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

export default function Settings() {
  const router = useRouter();
  const { colors, spacing, radius, preference, setPreference } = useTheme();
  const isPremium = usePremiumStore((s) => s.isPremium);
  const restore = usePremiumStore((s) => s.restore);
  const offerPrivacyOptions = useAdsConsentStore((s) => s.consent.offerPrivacyOptions);

  const version = Constants.expoConfig?.version ?? '1.0.0';

  const onRestore = () => {
    void restore().then((result) => {
      if (result === 'purchased') {
        Alert.alert(t('restoredTitle'), t('restoredBody'));
      } else {
        Alert.alert(t('nothingToRestoreTitle'), t('noPriorPurchases'));
      }
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen scroll>
        <SectionLabel>{t('appearance')}</SectionLabel>
        <View
          style={{
            flexDirection: 'row',
            marginTop: spacing.sm,
            backgroundColor: colors.surfaceAlt,
            borderRadius: radius.md,
            padding: spacing.xs,
          }}
        >
          {THEME_OPTIONS.map((option) => {
            const selected = preference === option.key;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="radio"
                accessibilityLabel={t(option.label)}
                accessibilityState={{ selected }}
                onPress={() => setPreference(option.key)}
                style={{
                  flex: 1,
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.sm,
                  backgroundColor: selected ? colors.surface : 'transparent',
                }}
              >
                <Text variant="callout" tone={selected ? 'default' : 'muted'}>
                  {t(option.label)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <SectionLabel>{t('settingsPurchase')}</SectionLabel>
        {isPremium ? (
          <View style={{ paddingVertical: spacing.md }}>
            <Text variant="body">{t('proActive')}</Text>
            <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
              {t('proActiveDesc')}
            </Text>
          </View>
        ) : (
          <Row label={t('removeAdsCta')} onPress={() => router.push('/paywall')} />
        )}
        <Row label={t('restorePurchases')} onPress={onRestore} />

        {offerPrivacyOptions ? (
          <>
            <SectionLabel>{t('privacyOptions')}</SectionLabel>
            <Row label={t('privacyOptionsDesc')} onPress={() => void showPrivacyOptionsForm()} />
          </>
        ) : null}

        <SectionLabel>{t('settingsLegal')}</SectionLabel>
        <Row label={t('privacyPolicy')} onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)} />
        <Row label={t('termsOfUse')} onPress={() => void Linking.openURL(TERMS_URL)} />

        <SectionLabel>{t('settingsAbout')}</SectionLabel>
        <Row label={t('contactSupport')} onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
        <Row label={t('versionLabel', { version })} />
      </Screen>
      <BannerAdSlot />
    </View>
  );
}
