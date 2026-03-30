const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');

const projectRoot = __dirname;
// Watch local packages so Metro picks up changes
const rnFacesRoot = path.resolve(projectRoot, '../../react/react-native-faces');
const rnFacesCaptureRoot = path.resolve(projectRoot, '../../react/react-native-faces-capture');
const appRevealRoot = path.resolve(projectRoot, '../../.packages/AppReveal/ReactNative/appreveal');

const config = {
  watchFolders: [rnFacesRoot, rnFacesCaptureRoot, appRevealRoot],
  resolver: {
    // Allow Metro to follow pnpm symlinks
    unstable_enableSymlinks: true,
    extraNodeModules: {
      'react-native-appreveal': appRevealRoot,
      'react-native-faces': rnFacesRoot,
      'react-native-faces-capture': rnFacesCaptureRoot,
    },
    // When resolving from watched folders (e.g. react-native-faces),
    // also search this project's node_modules for peer dependencies.
    nodeModulesPaths: [path.resolve(projectRoot, 'node_modules')],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
