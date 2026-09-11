/**
 * Wie eine Person heisst.
 *
 * Ueberall in der App steht der Anzeigename, nicht das Handle. Das Handle ist
 * eine Adresse - eindeutig, klein geschrieben, mit Unterstrichen - und keine
 * Art, jemanden anzusprechen. "@lena_k_2007" ist eine Zeichenkette; "Lena K."
 * ist ein Mensch.
 *
 * Das Handle bleibt trotzdem ueberall in den Daten: die Profil-Route laeuft
 * darueber, und auf der Profilseite selbst steht es als kleine Zweitzeile,
 * damit man weiss, wen man weiterempfiehlt.
 *
 * Nicht jeder hat einen Namen gesetzt. Dann ist das Handle immer noch besser
 * als eine leere Zeile - aber ohne das @, damit die Liste ruhig bleibt.
 */
export function personName(p: {
  display_name?: string | null;
  handle?: string | null;
}): string {
  const name = p.display_name?.trim();
  if (name) return name;
  return p.handle?.trim() || 'Jemand';
}
