module.exports = {
  preset: 'jest-expo',
  // Reanimated 4 runs on react-native-worklets, whose `.native.ts` entry points
  // reach for the JSI. This resolver picks the non-native build under Jest.
  resolver: 'react-native-worklets/jest/resolver.js',
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // The first render in a suite pays for Babel-transforming React Native and
  // the icon font. On a cold cache — every CI run — that exceeds Jest's 5s
  // default and fails a test that is not actually slow.
  testTimeout: 30_000,
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|native-base|react-native-svg|react-native-purchases|react-native-google-mobile-ads)',
  ],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'app/**/*.tsx',
    '!app/_layout.tsx',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/index.ts',
    // Thin adapters over native SDKs with no branching logic of our own; their
    // behaviour is verified by device QA, not by asserting against a mock.
    '!src/monetization/ads.ts',
  ],
  coverageThreshold: {
    global: { branches: 80, functions: 85, lines: 88, statements: 86 },
  },
};
