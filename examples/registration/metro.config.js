const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');

const projectRoot = __dirname;
// Watch the local react-native-faces package so Metro picks up changes
const rnFacesRoot = path.resolve(projectRoot, '../../react/react-native-faces');

const config = {
  watchFolders: [rnFacesRoot],
  resolver: {
    // Allow Metro to follow pnpm symlinks
    unstable_enableSymlinks: true,
    // When resolving from watched folders (e.g. react-native-faces),
    // also search this project's node_modules for peer dependencies.
    nodeModulesPaths: [path.resolve(projectRoot, 'node_modules')],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
