module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/../src/lib/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^decimal\.js$': '<rootDir>/node_modules/decimal.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@supabase/.*|lucide-react-native|react-native-svg)',
  ],
  setupFiles: ['<rootDir>/jest.setup.js'],
};
