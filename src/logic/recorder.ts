/**
 * The recorder's state machine and its free-tier limit.
 *
 * The screen cannot simply believe its own buttons. On iOS the recording runs in a separate
 * process the system owns, and it can start from Control Centre without the app being open
 * and stop from the status bar without the app being told. On Android the foreground service
 * can be killed, and the encoder can hit the duration cap on its own. So the app's phase is
 * a *guess* that is continually reconciled against what the native side reports — which is
 * what `nextPhase` encodes.
 *
 * Deliberately free of `react`, `react-native` and `expo-*`.
 */

export type RecorderPhase = "idle" | "starting" | "recording" | "stopping";

export type RecorderEvent =
  /** The user tapped record. */
  | "start-requested"
  /** The start never happened — permission refused, or the platform said no. */
  | "start-refused"
  /** The user tapped stop. */
  | "stop-requested"
  /** The native side reports a recording in progress. */
  | "native-recording"
  /** The native side reports nothing in progress. */
  | "native-idle";

/**
 * How long a free recording may run.
 *
 * Three minutes is a real, encoder-enforced cap — `MediaRecorder.setMaxDuration` on Android,
 * an elapsed check in the broadcast extension on iOS — not a countdown that stops a timer.
 * The free file is a complete, watermark-free, full-resolution recording; it is just short.
 * That is the whole of the paid difference, and it is the only claim the paywall makes.
 */
export const FREE_MAX_DURATION_SECONDS = 180;

/** Seconds a recording may run, or 0 for no limit. */
export function maxDurationFor(isPremium: boolean): number {
  return isPremium ? 0 : FREE_MAX_DURATION_SECONDS;
}

export function canStartRecording(input: {
  isSupported: boolean;
  phase: RecorderPhase;
}): boolean {
  return input.isSupported && input.phase === "idle";
}

export function nextPhase(
  phase: RecorderPhase,
  event: RecorderEvent,
): RecorderPhase {
  switch (event) {
    case "start-requested":
      return phase === "idle" ? "starting" : phase;
    case "start-refused":
      return phase === "starting" ? "idle" : phase;
    case "stop-requested":
      return phase === "recording" ? "stopping" : phase;
    case "native-recording":
      // `stopping` is not overridden: the stop request is in flight and the
      // native side has simply not noticed yet. Flipping back to `recording`
      // would make the button flicker between Stop and Recording.
      return phase === "stopping" ? phase : "recording";
    case "native-idle":
      // `starting` is not overridden either, for the mirror-image reason: a
      // broadcast takes a second or two to come up and the first poll always
      // says idle.
      return phase === "starting" ? phase : "idle";
    default:
      return phase;
  }
}

export interface RecorderStatusInput {
  isRecording: boolean;
  /** Milliseconds since the epoch, as the native side reported it. */
  startedAt?: number;
}

export interface RecorderView {
  elapsedSeconds: number;
  /** Seconds left before the free cap, or null when there is no cap. */
  remainingSeconds: number | null;
  /** True once a free recording has run out of time. */
  atLimit: boolean;
  isCapped: boolean;
}

export function describeRecorder(input: {
  phase: RecorderPhase;
  status: RecorderStatusInput;
  now: number;
  isPremium: boolean;
}): RecorderView {
  const limit = maxDurationFor(input.isPremium);
  const isCapped = limit > 0;

  // `startedAt` is absent until the native side has written it, and a device
  // clock can move backwards. Both would otherwise produce an elapsed time that
  // is either 55 years or negative.
  const started = input.status.startedAt;
  const running =
    input.status.isRecording && typeof started === "number" && started > 0;
  const elapsedMs = running ? input.now - (started as number) : 0;
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));

  if (!isCapped) {
    return {
      elapsedSeconds,
      remainingSeconds: null,
      atLimit: false,
      isCapped: false,
    };
  }

  const remainingSeconds = Math.max(0, limit - elapsedSeconds);
  return {
    elapsedSeconds,
    remainingSeconds,
    atLimit: remainingSeconds === 0 && elapsedSeconds > 0,
    isCapped: true,
  };
}
