import React, { useCallback } from "react";
import { Alert, Share, View } from "react-native";

import { BannerAdSlot } from "@/components/BannerAdSlot";
import { Button, Card, Screen, Text } from "@/components/ui";
import { t } from "@/i18n";
import { formatDuration, formatFileSize } from "@/logic/format";
import { useRecorder } from "@/recorder/useRecorder";
import { useTheme } from "@/theme";

/**
 * Everything recorded on this device.
 *
 * The files live in the app's own storage and nowhere else — there is no upload and no
 * account — so this list is the only place they exist inside Rectap. Sharing hands the file
 * to the system sheet, which is how a recording gets into Photos, Files, or another app.
 */
export default function Recordings() {
  const { spacing, colors } = useTheme();
  const recorder = useRecorder();

  const confirmDelete = useCallback(
    (id: string) => {
      Alert.alert(t("deleteConfirmTitle"), t("deleteConfirmBody"), [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("deleteCta"),
          style: "destructive",
          onPress: () => {
            void recorder.remove(id);
          },
        },
      ]);
    },
    [recorder],
  );

  const share = useCallback((uri: string) => {
    // `url` is the only field the iOS share sheet treats as a file; Android's
    // intent chooser takes it too. A failed share is the user cancelling far
    // more often than it is an error, so it is swallowed rather than surfaced.
    Share.share({ url: uri, message: uri }).catch(() => {});
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen scroll>
        {recorder.recordings.length === 0 ? (
          <Card style={{ marginTop: spacing.xl }}>
            <Text variant="bodyStrong">{t("recordingsEmptyTitle")}</Text>
            <Text variant="body" tone="muted" style={{ marginTop: spacing.xs }}>
              {t("recordingsEmptyBody")}
            </Text>
          </Card>
        ) : (
          <>
            <Text
              variant="caption"
              tone="muted"
              style={{ marginTop: spacing.base }}
            >
              {t("storageLine", {
                count: recorder.summary.count,
                size: formatFileSize(recorder.summary.totalBytes),
              })}
            </Text>
            {recorder.recordings.map((recording) => (
              <Card key={recording.id} style={{ marginTop: spacing.base }}>
                <Text variant="bodyStrong">
                  {formatDuration(recording.durationSeconds)}
                </Text>
                <Text
                  variant="caption"
                  tone="muted"
                  style={{ marginTop: spacing.xs }}
                >
                  {t("recordingMeta", {
                    duration: new Date(recording.createdAt).toLocaleString(),
                    size: formatFileSize(recording.sizeBytes),
                  })}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    gap: spacing.sm,
                    marginTop: spacing.sm,
                  }}
                >
                  <Button
                    label={t("shareCta")}
                    variant="secondary"
                    size="sm"
                    onPress={() => share(recording.uri)}
                  />
                  <Button
                    label={t("deleteCta")}
                    variant="ghost"
                    size="sm"
                    onPress={() => confirmDelete(recording.id)}
                  />
                </View>
              </Card>
            ))}
          </>
        )}
      </Screen>
      <BannerAdSlot />
    </View>
  );
}
