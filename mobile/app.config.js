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
// ⚠ PREVIEW USED TO FALL THROUGH HERE and build as `com.officepools.expo`,
// which is the STORE identifier — so installing it asked to remove TestFlight.
// It now sets APP_VARIANT=development in eas.json and lands in the same second
// slot as the dev client.
//
// ⚠ PUSH IS PER BUNDLE ID. Each variant registers its own APNs token, so a
// phone carrying two of them holds two registrations, not one.
//
// iOS only, for every variant: the Android package is unchanged, because a new
// one would need its own google-services.json entry and its own
// developer-verification registration.

// ⚠ ONE non-store identity, not one per profile. `development` and `preview`
// BOTH build as SportPool Dev, deliberately: the point is a second app slot
// beside TestFlight, and a second slot is all that is needed. Giving `preview`
// an identity of its own means a bundle ID Apple has never seen, which needs a
// new certificate and provisioning profile — an interactive Apple login, for no
// benefit over the slot that already exists.
const VARIANTS = {
  development: {
    name: 'SportPool Dev',
    scheme: 'officepools-dev',
    bundleIdentifier: 'com.officepools.expo.dev',
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
