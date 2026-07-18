const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '..', 'locales');

function loadLocale(locale = 'en') {
  const filePath = path.join(localesDir, `${locale}.json`);
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function t(locale, key, fallback = key) {
  const bundle = loadLocale(locale);
  return bundle[key] || fallback;
}

module.exports = { t };
