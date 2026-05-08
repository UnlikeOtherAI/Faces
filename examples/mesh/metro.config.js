const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const projectRoot = __dirname;

module.exports = mergeConfig(getDefaultConfig(projectRoot), {
  projectRoot,
  watchFolders: [projectRoot],
  resolver: {
    blockList: [
      /\/Faces\/examples\/registration\/.*/,
      /\/Faces\/examples\/recognition\/.*/,
      /\/Faces\/react\/react-native-faces\/.*/,
      /\/Faces\/react\/react-native-faces-capture\/.*/,
    ],
    nodeModulesPaths: [path.join(projectRoot, 'node_modules')],
  },
});
