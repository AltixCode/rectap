import AsyncStorage from "@react-native-async-storage/async-storage";

import { usePremiumStore } from "@/store/usePremiumStore";

import { shouldShowAds } from "./entitlements";
import { shouldShowInterstitial } from "./adPolicy";
import { showInterstitial } from "./interstitial";

/**
 * The interstitial call site, in one place.
 *
 * `adPolicy.ts` decides whether an interstitial is *allowed*; this decides
 * when to ask, and remembers enough between launches for the answer to be
 * meaningful. Those are separate on purpose — but keeping them separate is
 * exactly how the wiring went wrong: several apps called the pure policy with
 * a hardcoded `gamesPlayed: 1` against a minimum of 2, so the branch was dead
 * and no interstitial could ever appear, while the paywall went on selling
 * "the full-screen ad is gone for good". Every one of those apps had a
 * passing `adPolicy.test.ts`, because the policy was never the broken part.
 *
 * Persisting the count is not a refinement. A counter held in memory restarts
 * at zero every launch, so a game played a few times per session — or once a
 * day — may never reach the minimum at all.
 */

const PACING_KEY = "ads.pacing.v1";

export interface Pacing {
  /** Games carried through to an end state, won or lost, across all launches. */
  gamesPlayed: number;
  /** When an interstitial last actually reached the screen. 0 means never. */
  lastInterstitialAt: number;
}

const NO_PACING: Pacing = { gamesPlayed: 0, lastInterstitialAt: 0 };

/** Cached so an ordinary game-over does not wait on storage. */
let cached: Pacing | null = null;

export async function readPacing(): Promise<Pacing> {
  if (cached) return cached;
  try {
    const raw = await AsyncStorage.getItem(PACING_KEY);
    if (raw === null) {
      cached = NO_PACING;
      return cached;
    }
    const parsed = JSON.parse(raw) as Partial<Pacing>;
    // Validated field by field rather than trusted: a shape that changed between
    // versions must degrade to "no ads yet", never to NaN fed into the policy.
    cached = {
      gamesPlayed:
        typeof parsed.gamesPlayed === "number" ? parsed.gamesPlayed : 0,
      lastInterstitialAt:
        typeof parsed.lastInterstitialAt === "number"
          ? parsed.lastInterstitialAt
          : 0,
    };
    return cached;
  } catch {
    cached = NO_PACING;
    return cached;
  }
}

/**
 * Call when a game reaches an end state. Counts it, and shows an interstitial
 * if the policy allows one.
 *
 * `now` is a parameter so the decision is testable and so the same timestamp is
 * used for the policy and for the record — reading the clock twice is how a
 * countdown once opened at 0:16 instead of 0:20.
 */
export async function noteGameFinished(
  now: number = Date.now(),
): Promise<void> {
  const pacing = await readPacing();
  const next: Pacing = { ...pacing, gamesPlayed: pacing.gamesPlayed + 1 };

  const { isPremium, isReady } = usePremiumStore.getState();
  const allowed =
    shouldShowAds({ isPremium, isReady }) &&
    shouldShowInterstitial({
      gamesPlayed: next.gamesPlayed,
      lastInterstitialAt: next.lastInterstitialAt,
      now,
      adsRemoved: isPremium,
    });

  // Recorded only when one actually appeared. A failed fill that started the
  // clock would suppress the next genuine ad in favour of one nobody saw.
  if (allowed && showInterstitial()) next.lastInterstitialAt = now;

  cached = next;
  try {
    await AsyncStorage.setItem(PACING_KEY, JSON.stringify(next));
  } catch {
    // Pacing is a nicety. Losing it must never fail the game that just ended,
    // whose own state has already been saved by the store.
  }
}

/** Drops the in-memory cache. Tests use it to simulate a fresh launch. */
export function resetPacingForTests(): void {
  cached = null;
}
