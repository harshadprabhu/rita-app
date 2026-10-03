// Expo dynamic config. Keeps app.json as the source of truth and only layers on
// a web `baseUrl` when PAGES_BASE_URL is set — which happens exclusively in the
// GitHub Pages CI build (the site is served under https://<user>.github.io/rita-app/).
// Local dev, native builds, and root-hosted deploys are unaffected.
const appJson = require('./app.json');

module.exports = ({ config }) => {
  // `config` is app.json's expo block, already loaded by Expo.
  const merged = config && Object.keys(config).length ? config : appJson.expo;
  const baseUrl = process.env.PAGES_BASE_URL;
  if (baseUrl) {
    merged.experiments = { ...(merged.experiments || {}), baseUrl };
  }
  return merged;
};
