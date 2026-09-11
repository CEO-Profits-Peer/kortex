import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import de from '@/locales/de.json';
import en from '@/locales/en.json';

/**
 * Mehrsprachigkeit ab Zeile 1.
 *
 * Die erste Testgruppe sitzt in Oesterreich UND in Kanada, deshalb sind de
 * und en gleichwertig. Wichtiger als die zwei Sprachen ist aber die Regel
 * dahinter: KEIN sichtbarer String steht im Code. i18n nachzuruesten heisst,
 * jeden hartcodierten Text einzeln zu jagen - das ist einer der teuersten
 * Umbauten ueberhaupt und lohnt sich nie.
 *
 * Ebenen (siehe supabase/migrations/0005_i18n.sql):
 *   UI-Texte      -> hier, aus locales/*.json
 *   Datenstrings  -> DB, als jsonb {"de":..,"en":..}
 *   Card-Inhalte  -> eigene Zeile pro Sprache, NICHT maschinell uebersetzt
 */

export const SUPPORTED = ['de', 'en'] as const;
export type Language = (typeof SUPPORTED)[number];

export function deviceLanguage(): Language {
  const tag = Localization.getLocales()[0]?.languageCode ?? 'en';
  return (SUPPORTED as readonly string[]).includes(tag) ? (tag as Language) : 'en';
}

void i18n.use(initReactI18next).init({
  resources: { de: { translation: de }, en: { translation: en } },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
