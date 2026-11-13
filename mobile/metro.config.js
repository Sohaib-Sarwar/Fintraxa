// Metro: the app imports the web app's pure money engines straight from ../src/lib (alias `@core/*`),
// so web and mobile run the very same files (plan §9.1, G4 parity). Bare imports made by those files
// (only `decimal.js` — enforced by src/lib/__tests__/coreBoundary.test.ts) resolve from mobile/node_modules:
// one copy of each package, and EAS builds that install only mobile/ still work.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const coreRoot = path.resolve(projectRoot, '../src/lib');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [...(config.watchFolders ?? []), coreRoot];

const fromApp = { originModulePath: path.join(projectRoot, 'package.json') };
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@core/')) {
    return context.resolveRequest(context, path.join(coreRoot, moduleName.slice('@core/'.length)), platform);
  }
  const bare = !moduleName.startsWith('.') && !path.isAbsolute(moduleName);
  if (bare && context.originModulePath.startsWith(coreRoot)) {
    return context.resolveRequest({ ...context, ...fromApp }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
