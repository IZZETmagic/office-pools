// App variants. `app.json` stays the source of truth; this file only
// overrides what must differ so the Metro dev client, the internal preview
// build and the TestFlight / App Store build can all sit on one iPhone at once.
//
// iOS treats one bundle ID as one app, so any build sharing
// `com.officepools.expo` REPLACES the store build on install — and getting it
// back means reinstalling from TestFlight. Every profile that is not
// `production` therefore sets APP_VARIANT, and so do the `npm start` / `ios` /
// `android` scripts: Metro serves the manifest the dev client reads at runtime
// (`Constants.expoConfig`), so it has to agree with the native build or push
// tokens register under the wrong bundle ID.
//
// ⚠ PREVIEW WAS MISSING FROM HERE, and the gap is not obvious from the outside:
// `development` and `preview` are BOTH `distribution: internal`, so they look
// like the same kind of build, but only one of them had its own identity. A
// preview build installed straight over TestFlight.
//
// ⚠ PUSH IS PER BUNDLE ID. Each variant registers its own APNs token, so a
// phone carrying two of them holds two registrations, not one.
//
// iOS only, for every variant: the Android package is unchanged, because a new
// one would need its own google-services.json entry and its own
// developer-verification registration.

const VARIANTS = {
  development: {
    name: 'SportPool Dev',
    scheme: 'officepools-dev',
    bundleIdentifier: 'com.officepools.expo.dev',
  },
  preview: {
    name: 'SportPool Preview',
    scheme: 'officepools-preview',
    bundleIdentifier: 'com.officepools.expo.preview',
  },
};

const variant = VARIANTS[process.env.APP_VARIANT];

module.exports = ({ config }) => {
  // Production, and any plain `expo` invocation, take `app.json` untouched.
  if (!variant) return config;

  return {
    ...config,
    name: variant.name,
    // Two installed apps claiming one scheme ⇒ iOS picks either at random.
    scheme: variant.scheme,
    ios: {
      ...config.ios,
      bundleIdentifier: variant.bundleIdentifier,
    },
  };
};
