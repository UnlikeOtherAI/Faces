module.exports = {
  dependencies: {
    // AppReveal uses private/debug-only native APIs and must not be linked
    // into the iOS app we submit to TestFlight/App Store.
    'react-native-appreveal': {
      platforms: {
        ios: null,
      },
    },
  },
};
