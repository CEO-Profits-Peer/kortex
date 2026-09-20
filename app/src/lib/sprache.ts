import woerterbuch from '@/locales/ui-en.json';

import i18n from './i18n';

/**
 * Die Oberflaeche auf Englisch (19.09.).
 *
 * Warum der deutsche Satz der Schluessel ist
 * ------------------------------------------
 * Die uebliche Art - `t('studio.pruefungen.titel')` - verlangt, dass man
 * fuer jeden der rund 560 Texte einen Namen erfindet, ihn an zwei Stellen
 * pflegt und beim Lesen des Codes nicht mehr sieht, was dort eigentlich
 * steht. Bei einem Zweipersonenprojekt ist das der sichere Weg in eine
 * halbfertige Uebersetzung.
 *
 * Hier ist der deutsche Satz selbst der Schluessel:
 *
 *     <Text>{T('Noch keine Kommentare')}</Text>
 *
 * Vorteile: der Code bleibt lesbar, fehlt eine Uebersetzung, steht dort
 * Deutsch statt eines Platzhalters wie "studio.leer", und die Sammlung der
 * Texte laesst sich aus dem Code ziehen, statt sie von Hand zu fuehren.
 *
 * Nachteil, ehrlich benannt: aendert sich der deutsche Text, faellt die
 * Uebersetzung auf Deutsch zurueck, bis der Eintrag nachgezogen ist. Das
 * ist sichtbar und leicht zu finden - ein fehlender Schluessel dagegen
 * faellt erst auf, wenn jemand "studio.leer" im Bildschirm liest.
 *
 * Die bestehenden i18next-Schluessel (locales/de.json, en.json) bleiben,
 * wo sie schon benutzt werden. Neue Texte kommen hierher.
 */

type Vars = Record<string, string | number>;

const tabelle = woerterbuch as Record<string, string>;

function einsetzen(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (ganz, name: string) =>
    name in vars ? String(vars[name]) : ganz,
  );
}

/** Der deutsche Text, auf Englisch - falls es eine Uebersetzung gibt. */
export function T(text: string, vars?: Vars): string {
  const sprache = i18n.language || 'de';
  if (!sprache.startsWith('en')) return einsetzen(text, vars);
  return einsetzen(tabelle[text] ?? text, vars);
}

/**
 * Die Lokale fuer Datum und Zahlen.
 *
 * Steht ueberall dort, wo bisher 'de-AT' fest im Code stand: ein englischer
 * Bildschirm mit "19. September" ist halb uebersetzt, und das sieht man.
 */
export function lokale(): string {
  return (i18n.language || 'de').startsWith('en') ? 'en-GB' : 'de-AT';
}

/**
 * Wie viele Texte uebersetzt sind - fuer das Kontrollzentrum und fuer mich
 * selbst. Eine Uebersetzung, die zu 60 Prozent fertig ist, soll man sehen
 * koennen, ohne durch die App zu klicken.
 */
export function uebersetzungsStand(): number {
  return Object.keys(tabelle).length;
}
