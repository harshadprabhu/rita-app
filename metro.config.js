const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Zustand 4's ESM build (the "import" export condition) uses `import.meta.env`,
// which Metro emits verbatim into the classic (non-module) web script and throws
// "Cannot use 'import.meta' outside a module", breaking app boot on web. Drop the
// "import" condition so packages resolve to their CJS builds while keeping
// package "exports" resolution enabled for everything else.
config.resolver.unstable_conditionNames = ['require', 'react-native', 'browser', 'default'];

// nativewind's default cliCommand splits on spaces without quoting, which
// breaks when the project path contains a space (e.g. "Hemant Prabhu").
// Quote the resolved tailwindcss CLI path to work around it.
const tailwindBin = path.join(
  require.resolve('tailwindcss/package.json'),
  '../',
  require('tailwindcss/package.json').bin.tailwindcss
);

module.exports = withNativeWind(config, {
  input: './global.css',
  cliCommand: `node "${tailwindBin}"`,
});
