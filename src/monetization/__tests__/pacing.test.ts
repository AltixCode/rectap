/**
 * The interstitial call site, which is where this has gone wrong every time.
 *
 * `adPolicy.ts` is pure and has always been well tested. That is precisely why
 * nothing caught the real defect: six apps called the policy with a literal
 * `gamesPlayed: 1` against a minimum of 2, so the branch was dead and no
 * interstitial could ever appear — while every paywall went on selling its
 * removal. A unit that is correct in isolation, wired to nothing.
 *
 * So these tests are about the wiring: that the count advances, that it
 * survives a restart, and that the clock starts only when an ad really
 * appeared.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  GAMES_BETWEEN_INTERSTITIALS,
  MIN_GAMES_BEFORE_FIRST_INTERSTITIAL,
  MIN_MS_BETWEEN_INTERSTITIALS,
} from "../adPolicy";
import { noteGameFinished, readPacing, resetPacingForTests } from "../pacing";

const mockShow = jest.fn();
jest.mock("../interstitial", () => ({
  showInterstitial: (...args: unknown[]) => mockShow(...args),
  preloadInterstitial: jest.fn(),
}));

jest.mock("@/store/usePremiumStore", () => ({
  usePremiumStore: {
    getState: () => ({ isPremium: false, isReady: true }),
  },
}));

beforeEach(async () => {
  await AsyncStorage.clear();
  resetPacingForTests();
  mockShow.mockReset().mockReturnValue(true);
});

/** Plays `n` games back to back, far enough apart that timing never gates. */
async function playGames(
  n: number,
  startAt = 10 * MIN_MS_BETWEEN_INTERSTITIALS,
): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await noteGameFinished(startAt + i * MIN_MS_BETWEEN_INTERSTITIALS * 2);
  }
}

describe("noteGameFinished", () => {
  it("counts every finished game", async () => {
    await playGames(3);
    expect((await readPacing()).gamesPlayed).toBe(3);
  });

  it("shows nothing before the minimum number of games", async () => {
    await playGames(MIN_GAMES_BEFORE_FIRST_INTERSTITIAL);
    expect(mockShow).not.toHaveBeenCalled();
  });

  it("shows one once the minimum and the cadence are both satisfied", async () => {
    // The first eligible game is the first multiple of the cadence that is also
    // past the minimum. With the defaults that is game 3.
    await playGames(GAMES_BETWEEN_INTERSTITIALS);
    expect(mockShow).toHaveBeenCalledTimes(1);
  });

  it("keeps the count across a restart", async () => {
    await playGames(2);
    // A fresh process: module state is gone, storage is not.
    resetPacingForTests();
    expect((await readPacing()).gamesPlayed).toBe(2);
  });

  it("starts the clock only when an ad actually reached the screen", async () => {
    // A failed fill must not start the 90-second spacing, or the next genuine
    // ad is skipped in favour of one that never appeared.
    mockShow.mockReturnValue(false);
    await playGames(GAMES_BETWEEN_INTERSTITIALS);
    expect(mockShow).toHaveBeenCalled();
    expect((await readPacing()).lastInterstitialAt).toBe(0);
  });

  it("records the clock when one did appear", async () => {
    await playGames(GAMES_BETWEEN_INTERSTITIALS);
    expect((await readPacing()).lastInterstitialAt).toBeGreaterThan(0);
  });

  it("never lets a storage failure break the game that just ended", async () => {
    jest
      .spyOn(AsyncStorage, "setItem")
      .mockRejectedValueOnce(new Error("disk full"));
    await expect(noteGameFinished(Date.now())).resolves.toBeUndefined();
  });
});
