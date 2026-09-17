import { formatDuration, formatFileSize, summariseLibrary } from "../format";

describe("formatDuration", () => {
  it("renders under a minute with a leading zero minute", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(7)).toBe("0:07");
    expect(formatDuration(59)).toBe("0:59");
  });

  it("rolls over into minutes", () => {
    expect(formatDuration(60)).toBe("1:00");
    expect(formatDuration(83)).toBe("1:23");
    expect(formatDuration(599)).toBe("9:59");
    expect(formatDuration(600)).toBe("10:00");
  });

  it("adds an hours field only once there is an hour", () => {
    expect(formatDuration(3599)).toBe("59:59");
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3661)).toBe("1:01:01");
    expect(formatDuration(36_000)).toBe("10:00:00");
  });

  it("floors fractional seconds rather than rounding up past the real length", () => {
    // A 6.9-second file shown as 0:07 is a file the player then ends "early".
    expect(formatDuration(6.9)).toBe("0:06");
  });

  it("clamps anything negative or unusable to zero", () => {
    expect(formatDuration(-5)).toBe("0:00");
    expect(formatDuration(Number.NaN)).toBe("0:00");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});

describe("formatFileSize", () => {
  it("uses KB below a megabyte", () => {
    expect(formatFileSize(0)).toBe("0 KB");
    expect(formatFileSize(1_500)).toBe("1 KB");
    expect(formatFileSize(999_000)).toBe("976 KB");
  });

  it("uses one decimal place for megabytes", () => {
    expect(formatFileSize(1_048_576)).toBe("1.0 MB");
    expect(formatFileSize(5_400_000)).toBe("5.1 MB");
  });

  it("switches to GB above a thousand megabytes", () => {
    expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe("2.00 GB");
  });

  it("clamps unusable input to zero rather than rendering NaN", () => {
    expect(formatFileSize(-1)).toBe("0 KB");
    expect(formatFileSize(Number.NaN)).toBe("0 KB");
  });
});

describe("summariseLibrary", () => {
  const recording = (
    id: string,
    sizeBytes: number,
    createdAt: number,
    durationSeconds = 10,
  ) => ({
    id,
    uri: `file:///${id}`,
    sizeBytes,
    createdAt,
    durationSeconds,
  });

  it("is empty for an empty library", () => {
    expect(summariseLibrary([])).toEqual({
      count: 0,
      totalBytes: 0,
      totalSeconds: 0,
    });
  });

  it("adds up the count, bytes and seconds", () => {
    const summary = summariseLibrary([
      recording("a", 1_000, 3, 12),
      recording("b", 2_500, 1, 30.5),
    ]);
    expect(summary).toEqual({
      count: 2,
      totalBytes: 3_500,
      totalSeconds: 42.5,
    });
  });

  it("survives an entry whose duration could not be read", () => {
    // A recording the system killed mid-write has no readable duration. It still
    // takes up space and still has to be listed so the user can delete it.
    const summary = summariseLibrary([recording("a", 800, 1, 0)]);
    expect(summary).toEqual({ count: 1, totalBytes: 800, totalSeconds: 0 });
  });
});
