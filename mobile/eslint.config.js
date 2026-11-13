const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', '.expo/*', 'android/*', 'ios/*'] },
  // decimal.js exports Decimal both as default and named; the default import is the documented one.
  { rules: { 'import/no-named-as-default': 'off' } },
  { files: ['jest.setup.js', '**/__tests__/**'], languageOptions: { globals: { jest: 'readonly', describe: 'readonly', test: 'readonly', expect: 'readonly', beforeEach: 'readonly' } } },
]);
