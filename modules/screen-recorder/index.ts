import {
  requireNativeModule,
  requireNativeViewManager,
} from "expo-modules-core";
import type { ComponentType } from "react";
import type { ViewProps } from "react-native";

/** A finished recording, as it exists on disk. */
export interface Recording {
  /** The file name. Unique, sortable, and the handle used to delete it. */
  id: string;
  /** A `file://` URL the video player and the share sheet can both open. */
  uri: string;
  sizeBytes: number;
  /** Milliseconds since the epoch. */
  createdAt: number;
  /** Read back off the finished file, so it is the duration the video really has. */
  durationSeconds: number;
  width?: number;
  height?: number;
}

export interface RecorderStatus {
  isRecording: boolean;
  /** Milliseconds since the epoch. Absent when nothing has ever been recorded. */
  startedAt?: number;
  /** Set by the native side when a recording failed. Cleared with `clearError`. */
  error?: string;
  /** Android only: why the last recording ended. */
  lastStopReason?: "user" | "limit" | "system" | "error";
}

/** What `startRecording` can report. Android only — see `usesSystemPicker`. */
export type StartOutcome =
  | "started"
  | "denied"
  | "already-recording"
  | "pending"
  | "error"
  /** iOS: there is no way to begin a system broadcast except the user tapping the picker. */
  | "requires-picker";

interface ScreenRecorderNativeModule {
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
 * The screen recorder.
 *
 * The two platforms get here by very different routes. On iOS the capture runs in a ReplayKit
 * broadcast upload extension — a second process, started by the user through Apple's own
 * picker, which this module cannot start on its own. On Android `MediaProjection` hands the
 * screen to a foreground service in this same process, after a one-shot system grant.
 *
 * What survives that difference, and what this interface is, is: a status you can poll, a way
 * to ask it to stop, and a library of finished files.
 */
export const recorder =
  requireNativeModule<ScreenRecorderNativeModule>("ScreenRecorder");

export interface BroadcastPickerProps extends ViewProps {
  /** Bundle identifier of the broadcast extension, so the picker pre-selects Rectap. */
  preferredExtension: string;
}

/**
 * Apple's `RPSystemBroadcastPickerView`, iOS only.
 *
 * It must be a real view the user taps: iOS deliberately gives no programmatic way to start
 * a system broadcast. Rendered transparent over the app's own button, so what the user sees
 * is Rectap's control and what they touch is Apple's.
 */
export const BroadcastPicker = requireNativeViewManager<BroadcastPickerProps>(
  "ScreenRecorder",
) as ComponentType<BroadcastPickerProps>;

export default recorder;
