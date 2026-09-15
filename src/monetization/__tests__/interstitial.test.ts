import { AdEventType, InterstitialAd } from 'react-native-google-mobile-ads';

import {
  isInterstitialReady,
  preloadInterstitial,
  resetInterstitialForTests,
  showInterstitial,
} from '../interstitial';

type Handler = () => void;

/** A stand-in for one InterstitialAd instance whose events the test drives. */
function makeAd() {
  const handlers = new Map<string, Handler>();
  return {
    handlers,
    load: jest.fn(),
    show: jest.fn(),
    addAdEventListener: jest.fn((event: string, handler: Handler) => {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    }),
    emit(event: string) {
      handlers.get(event)?.();
    },
  };
}

const create = InterstitialAd.createForAdRequest as unknown as jest.Mock;

let ad: ReturnType<typeof makeAd>;

beforeEach(() => {
  resetInterstitialForTests();
  ad = makeAd();
  create.mockReset();
  create.mockImplementation(() => ad);
});

describe('preloadInterstitial', () => {
  it('requests one ad and keeps it warm', () => {
    preloadInterstitial();
    expect(create).toHaveBeenCalledTimes(1);
    expect(ad.load).toHaveBeenCalledTimes(1);
  });

  it('does not stack a second request on top of a warm one', () => {
    preloadInterstitial();
    preloadInterstitial();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('is not ready until the SDK reports the ad loaded', () => {
    preloadInterstitial();
    expect(isInterstitialReady()).toBe(false);
    ad.emit(AdEventType.LOADED);
    expect(isInterstitialReady()).toBe(true);
  });

  it('survives a load that throws', () => {
    ad.load.mockImplementationOnce(() => {
      throw new Error('no network');
    });
    expect(() => preloadInterstitial()).not.toThrow();
    expect(isInterstitialReady()).toBe(false);
  });
});

describe('showInterstitial', () => {
  it('shows a warm ad', () => {
    preloadInterstitial();
    ad.emit(AdEventType.LOADED);
    expect(showInterstitial()).toBe(true);
    expect(ad.show).toHaveBeenCalledTimes(1);
  });

  it('shows nothing when none is ready, and warms one for next time', () => {
    // "No fill" is the normal case, not an error — the caller just carries on.
    expect(showInterstitial()).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('warms a fresh ad after the user dismisses one', () => {
    preloadInterstitial();
    ad.emit(AdEventType.LOADED);
    showInterstitial();
    const first = ad;
    ad = makeAd();
    first.emit(AdEventType.CLOSED);
    expect(create).toHaveBeenCalledTimes(2);
    expect(isInterstitialReady()).toBe(false);
  });

  it('goes quiet after a load error rather than showing a stale instance', () => {
    preloadInterstitial();
    ad.emit(AdEventType.LOADED);
    ad.emit(AdEventType.ERROR);
    expect(isInterstitialReady()).toBe(false);
    expect(showInterstitial()).toBe(false);
  });

  it('reports failure when show() throws', () => {
    preloadInterstitial();
    ad.emit(AdEventType.LOADED);
    ad.show.mockImplementationOnce(() => {
      throw new Error('detached');
    });
    expect(showInterstitial()).toBe(false);
  });
});
