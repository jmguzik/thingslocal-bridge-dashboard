import en from './locales/en.js?v=0.1.0';
import pl from './locales/pl.js?v=0.1.0';

// Add a catalog here to make it available to validation, settings and formatting.
export const dictionaries = {pl, en};
export const supportedLanguages = Object.keys(dictionaries);
export const languageName = code => dictionaries[code]?.languageName || code;
