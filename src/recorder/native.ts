import Constants from "expo-constants";
import { Platform } from "react-native";
import type { ComponentType } from "react";

import type {
  BroadcastPickerProps,
  Recording,
  RecorderStatus,
  StartOutcome,
} from "../../modules/screen-recorder";

export type { Recording, RecorderStatus, StartOutcome };

export interface RecorderNative {
  isSupported(): boolean;
  usesSystemPicker(): boolean;
  getStatus(): RecorderStatus;
  clearError(): void;
  setMaxDuration(seconds: number, limitMessage: string): void;
  startRecording(maxDurationSeconds: number): Promise<StartOutcome>;
  requestStop(): void;
  importFinishedRecordings(): Promise<Recording[]>;
  listRecordings(): Promise<Recording[]>;
  deleteRecording(id: string): Promise<boolean>;
}

/**
 * What the app falls back to when the native recorder is not there.
 *
 * It is there in any real build — it is a local Expo module, autolinked at prebuild — but it
 * is *not* there under Jest, in Expo Go, or on web. Those all import this file, and
 * `requireNativeModule` throws at module scope, which would take the whole bundle down at
 * import time rather than at the point of use.
 *
 * Reporting `isSupported: false` is not a pretence that recording works. It is what makes
 * the UI say plainly that this device cannot record, which is the truth in every one of
 * those environments.
 */
const unavailable: RecorderNative = {
  isSupported: () => false,
  usesSystemPicker: () => Platform.OS === "ios",
  getStatus: () => ({ isRecording: false }),
  clearError: () => {},
  setMaxDuration: () => {},
  startRecording: async () => "error",
  requestStop: () => {},
  importFinishedRecordings: async () => [],
  listRecordings: async () => [],
  deleteRecording: async () => false,
};

function load(): {
  native: RecorderNative;
  picker: ComponentType<BroadcastPickerProps> | null;
} {
  try {
    // Required rather than imported so the throw is catchable. A static import is
    // hoisted and evaluated before this function ever runs.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("../../modules/screen-recorder");
    return {
      native: mod.recorder as RecorderNative,
      picker: mod.BroadcastPicker,
    };
  } catch {
    return { native: unavailable, picker: null };
  }
}

const loaded = load();

export const recorder: RecorderNative = loaded.native;

/** Apple's system broadcast picker. `null` anywhere the native module is absent. */
export const BroadcastPicker = loaded.picker;

/**
 * The broadcast extension's bundle identifier, so the picker pre-selects Rectap rather than
 * listing every broadcast extension installed on the device.
 *
 * Written into the app's Info.plist by `plugins/withBroadcastExtension.js`, so the two can
 * never disagree — deriving it here from the bundle id would silently break the day either
 * side changes its suffix.
 */
export function broadcastExtensionId(): string | null {
  const fromPlist = (
    Constants.expoConfig?.ios?.infoPlist as Record<string, unknown> | undefined
  )?.RectapBroadcastExtensionBundleId;
  if (typeof fromPlist === "string" && fromPlist.length > 0) return fromPlist;
  const bundleId = Constants.expoConfig?.ios?.bundleIdentifier;
  return bundleId ? `${bundleId}.broadcast` : null;
}
