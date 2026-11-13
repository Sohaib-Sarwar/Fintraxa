// Explicit so Jest also transforms the shared engines in ../src/lib (outside this folder).
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
