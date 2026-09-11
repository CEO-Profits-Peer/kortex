module.exports = function (api) {
  api.cache(true);
  // babel-preset-expo bindet den Worklets-/Reanimated-Plugin ab SDK 54
  // selbst ein. Ein zusaetzlicher Eintrag hier wuerde ihn doppelt laden.
  return { presets: ['babel-preset-expo'] };
};
