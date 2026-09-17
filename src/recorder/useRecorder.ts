import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { t } from "@/i18n";
import {
  FREE_MAX_DURATION_SECONDS,
  canStartRecording,
  describeRecorder,
  maxDurationFor,
  nextPhase,
  type RecorderPhase,
  type RecorderView,
} from "@/logic/recorder";
import { summariseLibrary, type LibrarySummary } from "@/logic/format";
import { usePremiumStore } from "@/store/usePremiumStore";

import { recorder, type RecorderStatus, type Recording } from "./native";

/**
 * How often the app asks the native side what is actually happening.
 *
 * The app's own phase is only ever a guess: on iOS the recording lives in another process
 * that the user can start from Control Centre and stop from the status bar, and on Android
 * the foreground service can be killed or hit its duration cap. Polling is what keeps the
 * screen honest. It is a synchronous read of a preferences value, not a bridge round trip,
 * so a half-second tick costs nothing.
 */
const ACTIVE_POLL_MS = 500;
const IDLE_POLL_MS = 2_000;

export interface RecorderController {
  phase: RecorderPhase;
  view: RecorderView;
  isSupported: boolean;
  usesSystemPicker: boolean;
  recordings: Recording[];
  summary: LibrarySummary;
  /** A translated line explaining the last failure, or null. */
  error: string | null;
  /** True once after a recording ended because the free cap was reached. */
  hitLimit: boolean;
  start: () => Promise<void>;
  stop: () => void;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  dismissError: () => void;
  dismissLimit: () => void;
  /** Called by the iOS picker once the user has been handed to the system sheet. */
  notePickerTapped: () => void;
}

export function useRecorder(): RecorderController {
  const isPremium = usePremiumStore((state) => state.isPremium);

  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [status, setStatus] = useState<RecorderStatus>({ isRecording: false });
  const [now, setNow] = useState(() => Date.now());
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hitLimit, setHitLimit] = useState(false);

  const isSupported = useMemo(() => recorder.isSupported(), []);
  const usesSystemPicker = useMemo(() => recorder.usesSystemPicker(), []);

  // Held in a ref as well as state so the poll can read the current phase without
  // resubscribing the interval on every tick. Written in an effect rather than
  // during render: a ref assigned while rendering is torn under concurrent
  // rendering, and every reader here — a timer tick, an AppState change, a press —
  // runs after the commit that set it.
  const phaseRef = useRef<RecorderPhase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const refresh = useCallback(async () => {
    try {
      // Also moves anything the iOS extension finished out of the shared
      // container, which is why this is called rather than `listRecordings` on
      // every return to the foreground.
      setRecordings(await recorder.importFinishedRecordings());
    } catch {
      // A failed read of the library is not worth an error banner over the
      // recorder itself — the list simply stays as it was.
    }
  }, []);

  const poll = useCallback(() => {
    const next = recorder.getStatus();
    setStatus(next);
    setNow(Date.now());

    const wasRecording =
      phaseRef.current === "recording" || phaseRef.current === "stopping";
    setPhase((current) =>
      nextPhase(current, next.isRecording ? "native-recording" : "native-idle"),
    );

    if (next.error) {
      setError(next.error);
      recorder.clearError();
    }
    if (next.lastStopReason === "limit") {
      setHitLimit(true);
    }
    // A recording that has just ended is the only moment the library changes.
    if (wasRecording && !next.isRecording) {
      void refresh();
    }
  }, [refresh]);

  // The first reconciliation, scheduled rather than run inline: the recorder may
  // already be running before this screen mounts — an iOS broadcast started from
  // Control Centre outlives the app — so the mount cannot assume "idle". It is a
  // zero-delay timer because setting state synchronously in an effect body is a
  // cascading render, and nothing here is needed before the first paint.
  useEffect(() => {
    const first = setTimeout(() => {
      poll();
      void refresh();
    }, 0);
    return () => clearTimeout(first);
  }, [poll, refresh]);

  useEffect(() => {
    const interval = setInterval(
      poll,
      phase === "idle" ? IDLE_POLL_MS : ACTIVE_POLL_MS,
    );
    return () => clearInterval(interval);
  }, [poll, phase]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        if (state === "active") {
          poll();
          void refresh();
        }
      },
    );
    return () => subscription.remove();
  }, [poll, refresh]);

  const start = useCallback(async () => {
    if (!canStartRecording({ isSupported, phase: phaseRef.current })) return;

    const limit = maxDurationFor(isPremium);
    recorder.setMaxDuration(
      limit,
      t("limitReachedBody", { minutes: FREE_MAX_DURATION_SECONDS / 60 }),
    );

    if (usesSystemPicker) {
      // iOS cannot start a broadcast from code. The picker view does it; all the
      // app can do is set the cap first and wait for the status to change.
      return;
    }

    setPhase((current) => nextPhase(current, "start-requested"));
    const outcome = await recorder.startRecording(limit);
    if (outcome === "started" || outcome === "already-recording") return;
    setPhase((current) => nextPhase(current, "start-refused"));
    if (outcome === "denied") setError(t("permissionDenied"));
    else if (outcome === "error") setError(t("recorderFailed"));
  }, [isPremium, isSupported, usesSystemPicker]);

  const notePickerTapped = useCallback(() => {
    const limit = maxDurationFor(isPremium);
    recorder.setMaxDuration(
      limit,
      t("limitReachedBody", { minutes: FREE_MAX_DURATION_SECONDS / 60 }),
    );
    setPhase((current) => nextPhase(current, "start-requested"));
  }, [isPremium]);

  const stop = useCallback(() => {
    setPhase((current) => nextPhase(current, "stop-requested"));
    recorder.requestStop();
  }, []);

  const remove = useCallback(async (id: string) => {
    await recorder.deleteRecording(id);
    setRecordings(await recorder.listRecordings());
  }, []);

  const view = useMemo(
    () => describeRecorder({ phase, status, now, isPremium }),
    [phase, status, now, isPremium],
  );

  const summary = useMemo(() => summariseLibrary(recordings), [recordings]);

  return {
    phase,
    view,
    isSupported,
    usesSystemPicker,
    recordings,
    summary,
    error,
    hitLimit,
    start,
    stop,
    refresh,
    remove,
    dismissError: useCallback(() => setError(null), []),
    dismissLimit: useCallback(() => setHitLimit(false), []),
    notePickerTapped,
  };
}
