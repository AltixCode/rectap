import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Pressable, View } from "react-native";

import { BannerAdSlot } from "@/components/BannerAdSlot";
import { Button, Card, Screen, Text } from "@/components/ui";
import { t } from "@/i18n";
import { formatDuration } from "@/logic/format";
import { FREE_MAX_DURATION_SECONDS } from "@/logic/recorder";
// `noteGameFinished` is the shared template's name for "a unit of use just
// completed" — here that unit is a finished recording. Renaming it would fork
// generated code the next regeneration silently reverts.
import { noteGameFinished } from "@/monetization/pacing";
import { BroadcastPicker, broadcastExtensionId } from "@/recorder/native";
import { useRecorder } from "@/recorder/useRecorder";
import { usePremiumStore } from "@/store/usePremiumStore";
import { useTheme } from "@/theme";

const FREE_MINUTES = FREE_MAX_DURATION_SECONDS / 60;

/**
 * The recorder.
 *
 * One control, and the truth about what it is doing. The elapsed time, the phase and the
 * remaining free time all come from the native side rather than from a timer this screen
 * runs, because on both platforms the recording can start and stop without this screen being
 * involved at all — from iOS Control Centre, from the Android notification, or because the
 * free cap was reached.
 */
export default function Home() {
  const router = useRouter();
  const { spacing, colors, radius } = useTheme();
  const isPremium = usePremiumStore((state) => state.isPremium);
  const recorder = useRecorder();

  const { phase, view } = recorder;
  const isRecording = phase === "recording" || phase === "stopping";

  // The interstitial's one honest moment: a recording has just finished, the user
  // is back in the app, and nothing is interrupted by showing it. This is also
  // what makes the paywall's "the full-screen ad is gone for good" claim true —
  // without a call site there would be no ad to remove.
  useEffect(() => {
    if (recorder.hitLimit) return;
    if (phase === "idle" && recorder.recordings.length > 0) {
      // Fire-and-forget: pacing decides whether anything is actually shown.
      void noteGameFinished();
    }
    // Deliberately keyed on the recording count, so this runs when a new file
    // appears rather than on every render while idle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.recordings.length]);

  const phaseLabel =
    phase === "starting"
      ? t("phaseStarting")
      : phase === "recording"
        ? t("phaseRecording")
        : phase === "stopping"
          ? t("phaseStopping")
          : t("phaseReady");

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen
        scroll
        topInset
        // A fixed block -- title, the availability card, the timer, one button
        // and two links -- not a list that grows, so it is centred when there is
        // slack. On a 13" iPad it sat at the top with about half the display
        // empty beneath it. A no-op on a phone, where the content fills the
        // viewport, and a no-op here once a recordings list is long enough to
        // need the room.
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
      >
        <Text variant="display" style={{ marginTop: spacing["3xl"] }}>
          {t("appName")}
        </Text>
        <Text variant="body" tone="muted" style={{ marginTop: spacing.sm }}>
          {t("tagline")}
        </Text>

        {recorder.isSupported ? null : (
          <Card style={{ marginTop: spacing.xl }}>
            <Text variant="bodyStrong">{t("unsupportedTitle")}</Text>
            <Text variant="body" tone="muted" style={{ marginTop: spacing.xs }}>
              {t("unsupportedBody")}
            </Text>
          </Card>
        )}

        <Card style={{ marginTop: spacing.xl }}>
          <Text variant="caption" tone="muted">
            {phaseLabel}
          </Text>
          <Text variant="display" style={{ marginTop: spacing.xs }}>
            {formatDuration(view.elapsedSeconds)}
          </Text>
          {view.isCapped && view.remainingSeconds !== null ? (
            <Text
              variant="caption"
              tone="muted"
              style={{ marginTop: spacing.xs }}
            >
              {t("timeLeft", { time: formatDuration(view.remainingSeconds) })}
            </Text>
          ) : (
            <Text
              variant="caption"
              tone="muted"
              style={{ marginTop: spacing.xs }}
            >
              {t("noLimitNote")}
            </Text>
          )}
        </Card>

        {/* The control.
            On Android this is an ordinary button: MediaProjection is started with a
            call. On iOS it cannot be — only Apple's own picker can begin a system
            broadcast — so the picker is laid over the button and what the user
            touches is Apple's control wearing Rectap's label. */}
        <View style={{ marginTop: spacing.xl }}>
          {isRecording ? (
            <Button
              label={t("stopCta")}
              variant="danger"
              size="lg"
              fullWidth
              onPress={recorder.stop}
            />
          ) : (
            <View>
              <Button
                label={t("recordCta")}
                size="lg"
                fullWidth
                disabled={!recorder.isSupported}
                onPress={recorder.usesSystemPicker ? undefined : recorder.start}
              />
              {recorder.usesSystemPicker &&
              recorder.isSupported &&
              BroadcastPicker ? (
                <Pressable
                  accessibilityLabel={t("recordCta")}
                  accessibilityRole="button"
                  onPress={recorder.notePickerTapped}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                    borderRadius: radius.md,
                    overflow: "hidden",
                  }}
                >
                  <BroadcastPicker
                    preferredExtension={broadcastExtensionId() ?? ""}
                    style={{ flex: 1 }}
                  />
                </Pressable>
              ) : null}
            </View>
          )}
        </View>

        {/* Only where the instruction is actually true: on a device that cannot
            record, telling the user to pick Rectap in a sheet that will never
            appear contradicts the card directly above it. */}
        {recorder.usesSystemPicker && recorder.isSupported && !isRecording ? (
          <Text
            variant="caption"
            tone="muted"
            style={{ marginTop: spacing.sm }}
          >
            {t("pickerHint")}
          </Text>
        ) : null}

        {isRecording ? (
          <Text
            variant="caption"
            tone="muted"
            style={{ marginTop: spacing.sm }}
          >
            {t("backgroundHint")}
          </Text>
        ) : null}

        {recorder.error ? (
          <Card style={{ marginTop: spacing.base }}>
            <Text variant="bodyStrong" tone="danger">
              {t("error")}
            </Text>
            <Text variant="body" tone="muted" style={{ marginTop: spacing.xs }}>
              {recorder.error}
            </Text>
            <Button
              label={t("close")}
              variant="ghost"
              onPress={recorder.dismissError}
              style={{ marginTop: spacing.sm }}
            />
          </Card>
        ) : null}

        {recorder.hitLimit ? (
          <Card style={{ marginTop: spacing.base }}>
            <Text variant="bodyStrong">{t("limitReachedTitle")}</Text>
            <Text variant="body" tone="muted" style={{ marginTop: spacing.xs }}>
              {t("limitReachedBody", { minutes: FREE_MINUTES })}
            </Text>
            <Button
              label={t("unlockLongerCta")}
              onPress={() => {
                recorder.dismissLimit();
                router.push("/paywall");
              }}
              style={{ marginTop: spacing.sm }}
            />
            <Button
              label={t("close")}
              variant="ghost"
              onPress={recorder.dismissLimit}
              style={{ marginTop: spacing.xs }}
            />
          </Card>
        ) : null}

        {isPremium ? null : (
          <Text
            variant="caption"
            tone="muted"
            style={{ marginTop: spacing.lg }}
          >
            {t("freeLimitNote", { minutes: FREE_MINUTES })}
          </Text>
        )}

        <Button
          label={t("recordingsTitle")}
          variant="secondary"
          onPress={() => router.push("/recordings")}
          style={{ marginTop: spacing.lg }}
        />
        <Button
          label={t("settingsTitle")}
          variant="ghost"
          onPress={() => router.push("/settings")}
          style={{ marginTop: spacing.sm }}
        />
      </Screen>
      <BannerAdSlot />
    </View>
  );
}
