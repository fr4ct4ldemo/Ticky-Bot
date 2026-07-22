const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '..', 'locales');

// The single source of truth for which locale codes actually work.
// /language set validates against this, and /help's FAQ lists these.
// Keep in sync with the .json files actually present in src/locales/.
const SUPPORTED_LOCALES = {
  en: 'English',
  es: 'Español (Spanish)',
};

const DEFAULT_LOCALE = 'en';

// Locale files are small and don't change at runtime, so cache them
// after first read instead of hitting disk on every t() call.
const cache = new Map();

function loadLocale(locale) {
  if (cache.has(locale)) return cache.get(locale);

  const filePath = path.join(localesDir, `${locale}.json`);
  let bundle = {};
  if (fs.existsSync(filePath)) {
    try {
      bundle = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.error(`Failed to parse locale file for "${locale}":`, err.message);
      bundle = {};
    }
  }
  cache.set(locale, bundle);
  return bundle;
}

/**
 * Translates `key` for `locale`. Falls back to the default locale's
 * string if the requested locale is missing the key entirely, then to
 * `fallback` (or the key itself) if even the default locale doesn't
 * have it - so a missing translation never shows a blank/broken string
 * to the user, it just shows English instead.
 *
 * `vars` supports simple {placeholder} interpolation, e.g.:
 *   t('en', 'ticket.opened.description', { user: '<@123>' })
 *   with a string like "Thanks for reaching out, {user}!"
 */
function t(locale, key, vars = {}, fallback = key) {
  const bundle = loadLocale(locale || DEFAULT_LOCALE);
  let str = bundle[key];

  if (str === undefined && locale !== DEFAULT_LOCALE) {
    str = loadLocale(DEFAULT_LOCALE)[key];
  }
  if (str === undefined) {
    str = fallback;
  }

  return String(str).replace(/\{(\w+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  ));
}

function isSupportedLocale(locale) {
  return Object.prototype.hasOwnProperty.call(SUPPORTED_LOCALES, locale);
}

module.exports = { t, SUPPORTED_LOCALES, DEFAULT_LOCALE, isSupportedLocale };
