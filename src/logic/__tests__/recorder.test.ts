import {
  FREE_MAX_DURATION_SECONDS,
  canStartRecording,
  describeRecorder,
  maxDurationFor,
  nextPhase,
  type RecorderPhase,
} from "../recorder";

describe("maxDurationFor", () => {
  it("caps a free recording at three minutes", () => {
    expect(maxDurationFor(false)).toBe(FREE_MAX_DURATION_SECONDS);
    expect(FREE_MAX_DURATION_SECONDS).toBe(180);
  });

  it("returns 0 — meaning uncapped — once the user has paid", () => {
    expect(maxDurationFor(true)).toBe(0);
  });
});

describe("canStartRecording", () => {
  it("allows a start when the device supports recording and nothing is running", () => {
    expect(canStartRecording({ isSupported: true, phase: "idle" })).toBe(true);
  });

  it("refuses when the platform cannot record at all", () => {
    expect(canStartRecording({ isSupported: false, phase: "idle" })).toBe(
      false,
    );
  });

  it.each<RecorderPhase>(["starting", "recording", "stopping"])(
    "refuses a second start while %s",
    (phase) => {
      expect(canStartRecording({ isSupported: true, phase })).toBe(false);
    },
  );
});

describe("nextPhase", () => {
  it("moves idle to starting when the user asks to record", () => {
    expect(nextPhase("idle", "start-requested")).toBe("starting");
  });

  it("confirms a start only once the native side says it is recording", () => {
    expect(nextPhase("starting", "native-recording")).toBe("recording");
  });

  it("returns to idle when a start was refused", () => {
    expect(nextPhase("starting", "start-refused")).toBe("idle");
  });

  it("moves to stopping when the user asks to stop, and to idle once it has", () => {
    expect(nextPhase("recording", "stop-requested")).toBe("stopping");
    expect(nextPhase("stopping", "native-idle")).toBe("idle");
  });

  it("follows the native side when a broadcast starts from outside the app", () => {
    // On iOS the user can start a recording from Control Centre without ever
    // opening Rectap. The app has to catch up, not insist it is idle.
    expect(nextPhase("idle", "native-recording")).toBe("recording");
  });

  it("follows the native side when the system ends a recording on its own", () => {
    expect(nextPhase("recording", "native-idle")).toBe("idle");
  });

  it("ignores a native-idle while still starting, so a slow start is not cancelled", () => {
    // The broadcast takes a moment to come up; treating the first poll as a
    // failure would abandon a recording that is about to begin.
    expect(nextPhase("starting", "native-idle")).toBe("starting");
  });

  it("ignores a native-recording while stopping", () => {
    expect(nextPhase("stopping", "native-recording")).toBe("stopping");
  });

  it("leaves every other phase unchanged for an unrelated event", () => {
    expect(nextPhase("recording", "start-requested")).toBe("recording");
    expect(nextPhase("idle", "stop-requested")).toBe("idle");
    expect(nextPhase("idle", "start-refused")).toBe("idle");
  });
});

describe("describeRecorder", () => {
  const startedAt = 1_700_000_000_000;

  it("reports nothing running when idle", () => {
    const view = describeRecorder({
      phase: "idle",
      status: { isRecording: false },
      now: startedAt,
      isPremium: false,
    });
    expect(view).toEqual({
      elapsedSeconds: 0,
      remainingSeconds: FREE_MAX_DURATION_SECONDS,
      atLimit: false,
      isCapped: true,
    });
  });

  it("counts elapsed seconds from the moment the native side started", () => {
    const view = describeRecorder({
      phase: "recording",
      status: { isRecording: true, startedAt },
      now: startedAt + 7_400,
      isPremium: false,
    });
    expect(view.elapsedSeconds).toBe(7);
    expect(view.remainingSeconds).toBe(FREE_MAX_DURATION_SECONDS - 7);
    expect(view.atLimit).toBe(false);
  });

  it("never reports a negative remaining, and flags the limit once reached", () => {
    const view = describeRecorder({
      phase: "recording",
      status: { isRecording: true, startedAt },
      now: startedAt + (FREE_MAX_DURATION_SECONDS + 30) * 1000,
      isPremium: false,
    });
    expect(view.remainingSeconds).toBe(0);
    expect(view.atLimit).toBe(true);
  });

  it("has no limit at all for a paying user", () => {
    const view = describeRecorder({
      phase: "recording",
      status: { isRecording: true, startedAt },
      now: startedAt + 9_999_000,
      isPremium: true,
    });
    expect(view.remainingSeconds).toBeNull();
    expect(view.atLimit).toBe(false);
    expect(view.isCapped).toBe(false);
  });

  it("treats a missing startedAt as zero elapsed rather than as 1970", () => {
    // `startedAt` is absent until the extension has written it. Subtracting an
    // undefined start from `now` would otherwise show 55 years of recording.
    const view = describeRecorder({
      phase: "recording",
      status: { isRecording: true },
      now: startedAt,
      isPremium: false,
    });
    expect(view.elapsedSeconds).toBe(0);
  });

  it("ignores a start timestamp in the future", () => {
    // Clock changes happen, and a negative elapsed renders as "-0:03".
    const view = describeRecorder({
      phase: "recording",
      status: { isRecording: true, startedAt: startedAt + 5_000 },
      now: startedAt,
      isPremium: false,
    });
    expect(view.elapsedSeconds).toBe(0);
  });
});
