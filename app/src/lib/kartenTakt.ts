/**
 * Ein Tipp auf die Karte: anhalten, noch einer: weiter (20.09.).
 *
 * Warum ein eigener kleiner Kanal und kein Prop: die Geste liegt auf der
 * Karte (ContentCard), der Takt aber in der Erklaerkarte (KineticCard) -
 * dazwischen liegen Seitenaufteilung, Buehne und FitBox. Ein Prop
 * durchzureichen hiesse, vier Bauteile anzufassen, die damit nichts zu tun
 * haben.
 *
 * Deshalb: wer einen Takt fuehrt, meldet sich hier an; wer tippt, ruft an.
 * Gemeldet wird je Karte, damit eine Karte im Hintergrund nicht auf einen
 * Tipp reagiert, der einer anderen galt.
 */
type Umschalter = () => void;

const angemeldet = new Map<string, Umschalter>();

/** Eine Karte fuehrt einen Takt und laesst sich von aussen anhalten. */
export function taktAnmelden(kartenId: string, fn: Umschalter): () => void {
  angemeldet.set(kartenId, fn);
  return () => {
    if (angemeldet.get(kartenId) === fn) angemeldet.delete(kartenId);
  };
}

/** Gibt es fuer diese Karte etwas anzuhalten? */
export function taktVorhanden(kartenId: string): boolean {
  return angemeldet.has(kartenId);
}

/** Anhalten oder weiterlaufen lassen. */
export function taktUmschalten(kartenId: string): void {
  angemeldet.get(kartenId)?.();
}
