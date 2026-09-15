import { AdEventType, RewardedAd, RewardedAdEventType } from 'react-native-google-mobile-ads';

import { isRewardedReady, preloadRewarded, resetRewardedForTests, showRewarded } from '../rewarded';

type Handler = () => void;

function makeAd() {
  const handlers = new Map<string, Handler[]>();
  return {
    load: jest.fn(),
    show: jest.fn(),
    addAdEventListener: jest.fn((event: string, handler: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return () => {};
    }),
    emit(event: string) {
      (handlers.get(event) ?? []).forEach((h) => h());
    },
  };
}

const create = RewardedAd.createForAdRequest as unknown as jest.Mock;
let ad: ReturnType<typeof makeAd>;

beforeEach(() => {
  resetRewardedForTests();
  ad = makeAd();
  create.mockReset();
  create.mockImplementation(() => ad);
});

describe('preloadRewarded', () => {
  it('requests one ad and reports ready only once it has loaded', () => {
    preloadRewarded();
    expect(isRewardedReady()).toBe(false);
    ad.emit(RewardedAdEventType.LOADED);
    expect(isRewardedReady()).toBe(true);
  });

  it('does not stack requests', () => {
    preloadRewarded();
    preloadRewarded();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('survives a load that throws', () => {
    ad.load.mockImplementationOnce(() => {
      throw new Error('offline');
    });
    expect(() => preloadRewarded()).not.toThrow();
  });
});

describe('showRewarded', () => {
  it('grants the reward only when it was actually earned', async () => {
    preloadRewarded();
    ad.emit(RewardedAdEventType.LOADED);
    const result = showRewarded();
    ad.emit(RewardedAdEventType.EARNED_REWARD);
    ad.emit(AdEventType.CLOSED);
    await expect(result).resolves.toBe(true);
  });

  it('grants nothing when the user dismisses the ad early', async () => {
    preloadRewarded();
    ad.emit(RewardedAdEventType.LOADED);
    const result = showRewarded();
    ad.emit(AdEventType.CLOSED);
    await expect(result).resolves.toBe(false);
  });

  it('grants nothing on an ad error', async () => {
    preloadRewarded();
    ad.emit(RewardedAdEventType.LOADED);
    const result = showRewarded();
    ad.emit(AdEventType.ERROR);
    await expect(result).resolves.toBe(false);
  });

  it('resolves false immediately when nothing is ready, and warms one', async () => {
    await expect(showRewarded()).resolves.toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('resolves false when show() throws', async () => {
    preloadRewarded();
    ad.emit(RewardedAdEventType.LOADED);
    ad.show.mockImplementationOnce(() => {
      throw new Error('detached');
    });
    await expect(showRewarded()).resolves.toBe(false);
  });

  it('settles once even if the SDK fires both closed and error', async () => {
    preloadRewarded();
    ad.emit(RewardedAdEventType.LOADED);
    const result = showRewarded();
    ad.emit(RewardedAdEventType.EARNED_REWARD);
    ad.emit(AdEventType.CLOSED);
    ad.emit(AdEventType.ERROR);
    await expect(result).resolves.toBe(true);
  });
});
