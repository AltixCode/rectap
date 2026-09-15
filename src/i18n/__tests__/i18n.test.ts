import * as Localization from 'expo-localization';

import {
  RTL_LANGUAGES,
  SUPPORTED_LANGUAGES,
  getDeviceLanguage,
  isRTLLanguage,
  resetLanguageCache,
  t,
  translations,
} from '..';

const getLocales = Localization.getLocales as jest.Mock;

function speak(languageCode: string) {
  resetLanguageCache();
  getLocales.mockReturnValue([{ languageCode }]);
}

beforeEach(() => {
  jest.clearAllMocks();
  speak('en');
});

describe('the locale set', () => {
  it('ships fourteen languages', () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(14);
    expect(Object.keys(translations).sort()).toEqual([...SUPPORTED_LANGUAGES].sort());
  });

  it('defines every English key in every other locale', () => {
    // A missing key is invisible at runtime — t() falls back to English and the
    // screen still renders — so only a check like this catches a locale that
    // quietly stopped being translated.
    const base = Object.keys(translations.en).filter(
      (k) => !/_(?:zero|one|two|few|many|other)$/.test(k),
    );
    for (const lang of SUPPORTED_LANGUAGES) {
      const keys = Object.keys(translations[lang]);
      expect({ lang, missing: base.filter((k) => !keys.includes(k)) }).toEqual({ lang, missing: [] });
    }
  });

  it('mirrors the layout for Arabic and Persian only', () => {
    expect(RTL_LANGUAGES).toEqual(['ar', 'fa']);
  });
});

describe('getDeviceLanguage', () => {
  it('uses a supported device language', () => {
    speak('de');
    expect(getDeviceLanguage()).toBe('de');
  });

  it('falls back to English for a language we do not ship', () => {
    speak('sv');
    expect(getDeviceLanguage()).toBe('en');
  });

  it('falls back to English when the platform throws', () => {
    resetLanguageCache();
    getLocales.mockImplementation(() => {
      throw new Error('no locale service');
    });
    expect(getDeviceLanguage()).toBe('en');
  });

  it('reads the device once and caches it', () => {
    speak('fr');
    getDeviceLanguage();
    getDeviceLanguage();
    expect(getLocales).toHaveBeenCalledTimes(1);
  });
});

describe('isRTLLanguage', () => {
  it.each([
    ['ar', true],
    ['fa', true],
    ['en', false],
    ['el', false],
  ])('reports %s as RTL=%p', (lang, expected) => {
    speak(lang);
    expect(isRTLLanguage()).toBe(expected);
  });
});

describe('t', () => {
  it('returns the string for the active language', () => {
    speak('de');
    expect(t('settingsTitle')).toBe('Einstellungen');
  });

  it('interpolates named parameters', () => {
    expect(t('versionLabel', { version: '1.2.3' })).toBe('Version 1.2.3');
  });

  it('interpolates a parameter that appears more than once', () => {
    // `split().join()` rather than `replace()`: a `$` in the value would
    // otherwise eat the rest of the line.
    expect(t('lifetimeAccess', { price: '$3.99' })).toContain('$3.99');
  });

  it('leaves an unknown parameter placeholder alone rather than erasing it', () => {
    expect(t('versionLabel', { other: 'x' })).toBe('Version {version}');
  });

  it('falls back to English when a locale lacks the key', () => {
    speak('el');
    expect(t('proBadge')).toBe('PRO');
  });

  it('returns the key itself for a key no locale defines', () => {
    expect(t('nonsenseKey' as never)).toBe('nonsenseKey');
  });
});
