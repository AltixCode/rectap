/**
 * Numbers the user reads, formatted.
 *
 * Deliberately free of `react`, `react-native` and `expo-*` so the rules can be exercised
 * from `npm test` with nothing mocked.
 */

/** A recording that exists on disk. Mirrors the native `Recording` record. */
export interface LibraryEntry {
  id: string;
  uri: string;
  sizeBytes: number;
  createdAt: number;
  durationSeconds: number;
  width?: number;
  height?: number;
}

const safe = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0;

/**
 * `H:MM:SS`, or `M:SS` under an hour.
 *
 * Seconds are floored, not rounded: a 6.9-second file shown as `0:07` is a file the player
 * appears to end early, and the one number a recorder must not get wrong is how long the
 * recording is.
 */
export function formatDuration(seconds: number): string {
  const total = Math.floor(safe(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(secs)}`;
  return `${minutes}:${pad(secs)}`;
}

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

/**
 * Sizes in the units a phone user thinks in.
 *
 * KB is rounded whole because nobody cares about a tenth of a kilobyte; MB carries one
 * decimal because the jump from 4 MB to 5 MB is a third of a recording.
 */
export function formatFileSize(bytes: number): string {
  const value = safe(bytes);
  if (value >= 1000 * MB) return `${(value / GB).toFixed(2)} GB`;
  if (value >= MB) return `${(value / MB).toFixed(1)} MB`;
  return `${Math.round(value / KB)} KB`;
}

export interface LibrarySummary {
  count: number;
  totalBytes: number;
  totalSeconds: number;
}

/** What the library adds up to, for the storage line on the recordings screen. */
export function summariseLibrary(
  entries: readonly LibraryEntry[],
): LibrarySummary {
  return entries.reduce<LibrarySummary>(
    (summary, entry) => ({
      count: summary.count + 1,
      totalBytes: summary.totalBytes + safe(entry.sizeBytes),
      totalSeconds: summary.totalSeconds + safe(entry.durationSeconds),
    }),
    { count: 0, totalBytes: 0, totalSeconds: 0 },
  );
}
