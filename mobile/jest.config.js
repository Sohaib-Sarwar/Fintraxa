module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/../src/lib/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^decimal\.js$': '<rootDir>/node_modules/decimal.js',
    // Lucide's per-icon ESM (.mjs) → its CommonJS build for Jest.
    '^lucide-react-native/icons/(.*)$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/icons/$1.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@supabase/.*|lucide-react-native|react-native-svg|standard-navigation)',
  ],
  setupFiles: ['<rootDir>/jest.setup.js'],
};
