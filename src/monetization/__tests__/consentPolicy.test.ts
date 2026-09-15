import {
  canServeAds,
  shouldOfferPrivacyOptions,
  summariseConsent,
  type ConsentInfoLike,
} from '../consentPolicy';

const info = (over: Partial<ConsentInfoLike> = {}): ConsentInfoLike => ({
  status: 'OBTAINED',
  canRequestAds: true,
  privacyOptionsRequirementStatus: 'NOT_REQUIRED',
  ...over,
});

describe('canServeAds', () => {
  it('serves only on an explicit true from the UMP SDK', () => {
    expect(canServeAds(info())).toBe(true);
  });

  it.each([
    ['canRequestAds false', info({ canRequestAds: false })],
    ['null info', null],
    ['undefined info', undefined],
  ])('fails closed for %s', (_label, value) => {
    expect(canServeAds(value)).toBe(false);
  });

  it('fails closed on a non-boolean truthy value', () => {
    expect(canServeAds({ canRequestAds: 'yes' } as unknown as ConsentInfoLike)).toBe(false);
  });
});

describe('shouldOfferPrivacyOptions', () => {
  it('offers the form only where UMP reports REQUIRED', () => {
    expect(shouldOfferPrivacyOptions(info({ privacyOptionsRequirementStatus: 'REQUIRED' }))).toBe(true);
    expect(shouldOfferPrivacyOptions(info())).toBe(false);
    expect(shouldOfferPrivacyOptions(null)).toBe(false);
  });
});

describe('summariseConsent', () => {
  it('combines both decisions', () => {
    expect(summariseConsent(info({ privacyOptionsRequirementStatus: 'REQUIRED' }))).toEqual({
      canServeAds: true,
      offerPrivacyOptions: true,
    });
  });

  it('returns an all-false summary when consent is unknown', () => {
    expect(summariseConsent(null)).toEqual({ canServeAds: false, offerPrivacyOptions: false });
  });
});
