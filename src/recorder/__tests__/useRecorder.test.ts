import { act, renderHook, waitFor } from "@testing-library/react-native";

import { FREE_MAX_DURATION_SECONDS } from "@/logic/recorder";
import { usePremiumStore } from "@/store/usePremiumStore";

import type { RecorderNative, Recording, RecorderStatus } from "../native";

/**
 * A stand-in for the native recorder.
 *
 * Not a pretend recording — it records nothing and claims nothing. It exists so the
 * reconciliation logic in `useRecorder` can be driven through states the real recorder only
 * reaches on a physical device: a broadcast that starts outside the app, one the system ends
 * on its own, and one that stops because the free cap was reached.
 */
const mockStatus: { current: RecorderStatus } = { current: { isRecording: false } };
const mockLibrary: { current: Recording[] } = { current: [] };
const mockCalls = {
  setMaxDuration: jest.fn(),
  startRecording: jest.fn<Promise<string>, [number]>(),
  requestStop: jest.fn(),
  deleteRecording: jest.fn(),
  clearError: jest.fn(),
};

let mockUsesPicker = false;
let mockSupported = true;

jest.mock("../native", () => ({
  get recorder(): RecorderNative {
    return {
      isSupported: () => mockSupported,
      usesSystemPicker: () => mockUsesPicker,
      getStatus: () => mockStatus.current,
      clearError: () => {
        mockCalls.clearError();
        mockStatus.current = { ...mockStatus.current, error: undefined };
      },
      setMaxDuration: (...args: unknown[]) => mockCalls.setMaxDuration(...args),
      startRecording: (seconds: number) => mockCalls.startRecording(seconds),
      requestStop: () => mockCalls.requestStop(),
      importFinishedRecordings: async () => mockLibrary.current,
      listRecordings: async () => mockLibrary.current,
      deleteRecording: async (id: string) => {
        mockCalls.deleteRecording(id);
        mockLibrary.current = mockLibrary.current.filter((entry) => entry.id !== id);
        return true;
      },
    } as RecorderNative;
  },
  BroadcastPicker: null,
  broadcastExtensionId: () => "com.altixcode.rectap.broadcast",
}));

const { useRecorder } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("../useRecorder") as typeof import("../useRecorder");

const recording = (id: string): Recording => ({
  id,
  uri: `file:///${id}`,
  sizeBytes: 1_000,
  createdAt: 1_700_000_000_000,
  durationSeconds: 12,
});

/**
 * Waits out at least one reconciliation tick and flushes what it changed.
 *
 * `useRecorder` deliberately does not trust its own buttons: it reconciles against the
 * native side on an interval (2s while idle, 0.5s while active), because on a real device
 * a broadcast can start from Control Centre and end from the status bar without this app
 * being told. Two things follow for a test. The wait has to outlast the idle interval,
 * which is twice RNTL's default `waitFor` window. And it cannot be a `waitFor`: that runs
 * its whole polling loop inside one `act` scope, so the interval's state updates are
 * queued and only flushed when the scope ends — the condition is never seen to become
 * true and the wait always times out. Sleeping *inside* `act` lets the interval fire and
 * the updates land before the assertion runs.
 */
async function pollTick(ms = 2_300): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus.current = { isRecording: false };
  mockLibrary.current = [];
  mockUsesPicker = false;
  mockSupported = true;
  usePremiumStore.setState({ isPremium: false, isReady: true });
  mockCalls.startRecording.mockResolvedValue("started");
});

describe("useRecorder", () => {
  it("starts idle and loads whatever is already on disk", async () => {
    mockLibrary.current = [recording("a.mp4")];
    const { result } = await renderHook(() => useRecorder());
    await waitFor(() => expect(result.current.recordings).toHaveLength(1));
    expect(result.current.phase).toBe("idle");
    expect(result.current.summary.count).toBe(1);
  });

  it("passes the free cap to the native side when starting", async () => {
    const { result } = await renderHook(() => useRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(mockCalls.setMaxDuration).toHaveBeenCalledWith(
      FREE_MAX_DURATION_SECONDS,
      expect.stringContaining("3"),
    );
    expect(mockCalls.startRecording).toHaveBeenCalledWith(
      FREE_MAX_DURATION_SECONDS,
    );
  });

  it("passes no cap at all for a paying user", async () => {
    usePremiumStore.setState({ isPremium: true });
    const { result } = await renderHook(() => useRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(mockCalls.startRecording).toHaveBeenCalledWith(0);
  });

  it("does not call startRecording on iOS — only the system picker can start a broadcast", async () => {
    mockUsesPicker = true;
    const { result } = await renderHook(() => useRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(mockCalls.startRecording).not.toHaveBeenCalled();
    // The cap is still written, because the extension reads it when it launches.
    expect(mockCalls.setMaxDuration).toHaveBeenCalled();
  });

  it("reports a refused permission rather than pretending to record", async () => {
    mockCalls.startRecording.mockResolvedValue("denied");
    const { result } = await renderHook(() => useRecorder());
    await act(async () => {
      await result.current.start();
    });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.phase).toBe("idle");
  });

  it("will not start when the platform cannot record", async () => {
    mockSupported = false;
    const { result } = await renderHook(() => useRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(mockCalls.startRecording).not.toHaveBeenCalled();
    expect(result.current.isSupported).toBe(false);
  });

  it("follows the native side into recording, even when the app never started it", async () => {
    // Exactly what happens when a broadcast is started from iOS Control Centre.
    const { result } = await renderHook(() => useRecorder());
    mockStatus.current = { isRecording: true, startedAt: Date.now() };
    await pollTick();
    expect(result.current.phase).toBe("recording");
  });

  it("asks the native side to stop and settles once it reports idle", async () => {
    const { result } = await renderHook(() => useRecorder());
    mockStatus.current = { isRecording: true, startedAt: Date.now() };
    await pollTick();
    expect(result.current.phase).toBe("recording");

    await act(async () => {
      result.current.stop();
    });
    expect(mockCalls.requestStop).toHaveBeenCalled();
    expect(result.current.phase).toBe("stopping");

    mockStatus.current = { isRecording: false };
    mockLibrary.current = [recording("b.mp4")];
    // The active interval is 0.5s, but the library is only re-read once the stop
    // has been observed, so this waits out a second tick as well.
    await pollTick(1_500);
    expect(result.current.phase).toBe("idle");
    expect(result.current.recordings).toHaveLength(1);
  });

  it("surfaces a native error once and then clears it", async () => {
    const { result } = await renderHook(() => useRecorder());
    mockStatus.current = { isRecording: false, error: "disk full" };
    await pollTick();
    expect(result.current.error).toBe("disk full");
    expect(mockCalls.clearError).toHaveBeenCalled();
    await act(async () => {
      result.current.dismissError();
    });
    expect(result.current.error).toBeNull();
  });

  it("raises the limit flag when the recording stopped at the free cap", async () => {
    const { result } = await renderHook(() => useRecorder());
    mockStatus.current = { isRecording: false, lastStopReason: "limit" };
    await pollTick();
    expect(result.current.hitLimit).toBe(true);
    await act(async () => {
      result.current.dismissLimit();
    });
    expect(result.current.hitLimit).toBe(false);
  });

  it("removes a recording from the list when it is deleted", async () => {
    mockLibrary.current = [recording("a.mp4"), recording("b.mp4")];
    const { result } = await renderHook(() => useRecorder());
    await waitFor(() => expect(result.current.recordings).toHaveLength(2));
    await act(async () => {
      await result.current.remove("a.mp4");
    });
    expect(mockCalls.deleteRecording).toHaveBeenCalledWith("a.mp4");
    expect(result.current.recordings).toHaveLength(1);
  });
});
