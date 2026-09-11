/**
 * Was Google beim Zurückkommen in die Adresse schreibt.
 *
 * Der gemeldete Fehler war "Google Account has some problems getting you to
 * the right side back". Dahinter stecken zwei Dinge, und beide sind hier:
 *
 * 1. Geht die Anmeldung schief, kommt der Browser mit
 *    `#error=...&error_code=...&error_description=...` zurück - und sonst
 *    nichts. Die App hat diese Werte nie gelesen: der Nutzer landete
 *    wortlos wieder auf dem Startbildschirm und probierte es nochmal, mit
 *    demselben Ergebnis. Ein Fehlschlag, der aussieht wie ein Aussetzer,
 *    ist schlimmer als eine Fehlermeldung.
 *
 * 2. Der häufigste dieser Fehler ist `identity_already_exists`: das
 *    Google-Konto gehört schon zu einem ElyCic-Konto, und deshalb kann es
 *    nicht zusätzlich an das anonyme angehängt werden. Der Weg heraus ist
 *    nicht "nochmal", sondern "anmelden statt verknüpfen" - dafür braucht
 *    der Bildschirm die Information.
 *
 * Gelesen wird SOFORT beim Laden des Moduls, noch bevor supabase-js seine
 * eigene Auswertung startet und die Adresse aufräumt. Deshalb importiert
 * lib/supabase.ts diese Datei als Erstes.
 */

export type OAuthReturn = {
  code: string;
  message: string;
  /** Anmelden statt verknüpfen ist der Ausweg. */
  alreadyLinked: boolean;
};

let captured: OAuthReturn | null = null;

function readParams(): URLSearchParams | null {
  if (typeof window === 'undefined' || !window.location) return null;
  const hash = window.location.hash.replace(/^#/, '');
  const query = window.location.search.replace(/^\?/, '');
  for (const part of [hash, query]) {
    if (!part) continue;
    const p = new URLSearchParams(part);
    if (p.get('error') || p.get('error_code')) return p;
  }
  return null;
}

function capture() {
  const p = readParams();
  if (!p) return;

  const code = p.get('error_code') ?? p.get('error') ?? 'unknown';
  const raw = p.get('error_description')?.replace(/\+/g, ' ') ?? '';
  const alreadyLinked = /identity_already_exists|already.*linked/i.test(code + ' ' + raw);

  captured = {
    code,
    alreadyLinked,
    message: alreadyLinked
      ? 'Dieses Google-Konto gehört schon zu einem ElyCic-Konto. Melde dich damit an — ' +
        'an ein zweites anhängen geht nicht.'
      : /access_denied|cancel/i.test(code)
        ? 'Die Anmeldung wurde abgebrochen.'
        : /redirect|url/i.test(code + raw)
          ? 'Google durfte nicht hierher zurückschicken. Die Adresse dieser Seite fehlt in ' +
            'den erlaubten Redirect-URLs.'
          : raw || 'Die Anmeldung mit Google hat nicht geklappt.',
  };

  // Die Fehlerwerte aus der Adresse nehmen. Sonst stehen sie beim nächsten
  // Neuladen wieder da und melden einen Fehler, der längst vorbei ist.
  try {
    window.history.replaceState(null, '', window.location.pathname);
  } catch {
    // Nicht schlimm - die Meldung ist wichtiger als die saubere Adresse.
  }
}

capture();

/** Einmal abholen. Danach ist es weg, damit es nicht bei jedem Rendern klebt. */
export function takeOAuthError(): OAuthReturn | null {
  const out = captured;
  captured = null;
  return out;
}
