import type { IconName } from '@/components/Icon';

/**
 * Was ist neu.
 *
 * Regeln, damit daraus keine Werbeeinblendung wird:
 *
 *   · höchstens vier Punkte — was länger ist, liest niemand
 *   · in der Sprache des Nutzers, nicht in Entwicklersprache
 *     („Der Regler war kaputt" statt „Slider-State-Sync refactored")
 *   · Fehlerbehebungen dürfen drin stehen. Zu schreiben, was kaputt war und
 *     jetzt geht, schafft mehr Vertrauen als nur Neues zu verkünden.
 *   · Erscheint nur, wenn sich die Version geändert hat, und nur einmal.
 *     Beim allerersten Start nie — da ist alles neu.
 */

export type ChangeEntry = { icon: IconName; title: string; body: string };

export type Release = {
  /** Muss zu expo.version in app.json passen */
  version: string;
  headline: string;
  entries: ChangeEntry[];
};

export const CURRENT: Release = {
  version: '0.2.0',
  headline: 'Der Feed fühlt sich jetzt an wie einer',
  entries: [
    {
      icon: 'feed',
      title: 'Karten bleiben, wo sie hingehören',
      body: 'Inhalte konnten über den Rand laufen und sich überlagern. Jede Karte ist jetzt genau ein Bildschirm.',
    },
    {
      icon: 'sliders',
      title: 'Regler zeigen wieder die Wahrheit',
      body: 'Anzeige und Knopf liefen auseinander. Jetzt ist bei 0 % leer, bei 100 % voll — und beides erreichbar.',
    },
    {
      icon: 'like',
      title: 'Doppeltippen, Teilen, Weitersurfen',
      body: 'Rechts an jeder Karte: liken, empfehlen, teilen oder direkt in die Kategorie springen.',
    },
    {
      icon: 'profile',
      title: 'Profile und Folgen',
      body: 'Du hast jetzt ein Profil mit Bild, kannst Leuten folgen und sehen, was sie empfehlen.',
    },
  ],
};
