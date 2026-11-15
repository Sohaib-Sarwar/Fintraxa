module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/../src/lib/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^decimal\.js$': '<rootDir>/node_modules/decimal.js',
    // Babel adds runtime helpers to the shared ../src/lib files; resolve them from the app like Metro does, so
    // CI (which installs only mobile/) runs the same tests as a machine that also has the web app's node_modules.
    '^@babel/runtime/(.*)$': '<rootDir>/node_modules/@babel/runtime/$1',
    // Lucide's per-icon ESM (.mjs) → its CommonJS build for Jest.
    '^lucide-react-native/icons/(.*)$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/icons/$1.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@supabase/.*|lucide-react-native|react-native-svg|standard-navigation)',
  ],
  setupFiles: ['<rootDir>/jest.setup.js'],
};
