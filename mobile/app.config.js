// App variants. `app.json` stays the source of truth; this file only
// overrides what must differ so the Metro dev client and the TestFlight /
// App Store build can be installed side by side on one iPhone.
//
// iOS treats one bundle ID as one app, so a dev build that shares
// `com.officepools.expo` REPLACES the store build on install. The
// `development` EAS profile sets APP_VARIANT=development, and so do the
// `npm start` / `ios` / `android` scripts — Metro serves the manifest the dev
// client reads at runtime (`Constants.expoConfig`), so it must agree with the
// native build or push tokens register under the wrong bundle ID.
//
// iOS only: the Android package is unchanged (a new one would need its own
// google-services.json entry and developer-verification registration).

const IS_DEV = process.env.APP_VARIANT === 'development';

module.exports = ({ config }) => {
  if (!IS_DEV) return config;

  return {
    ...config,
    name: 'SportPool Dev',
    // Two installed apps claiming one scheme ⇒ iOS picks either at random.
    scheme: 'officepools-dev',
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.officepools.expo.dev',
    },
  };
};
