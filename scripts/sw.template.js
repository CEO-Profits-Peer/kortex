/*
 * Service Worker.
 *
 * Vorlage. scripts/finish_web.py ersetzt __VERSION__ und __SHELL__ und legt
 * das Ergebnis als dist/sw.js ab - nicht von Hand aendern, es wird bei
 * jedem Build ueberschrieben.
 *
 * Zwei Gruende, warum es ihn gibt, und der zweite ist der ueberraschende:
 *
 *   1. Offline. Wer im Zug den Empfang verliert, bekommt die App weiter zu
 *      sehen statt der Dinosaurier-Seite.
 *
 *   2. Ohne Service Worker haelt Chrome die App gar nicht fuer
 *      installierbar. Kein `beforeinstallprompt`, kein "Zum
 *      Startbildschirm" - und der Knopf "Als App benutzen" waere auf
 *      Android fuer immer unsichtbar. Das Manifest allein reicht nicht.
 */

/*
 * Der Cache-Name traegt die Kennung des Bundles. Damit raeumt jede neue
 * Auslieferung den alten Cache von selbst weg. Ohne das sieht ein Teil der
 * Nutzer nach einem Update wochenlang die alte Fassung - der Fehler, den
 * man am schwersten findet, weil er bei einem selbst nie auftritt.
 */
const CACHE = 'elycic-__VERSION__';

const SHELL = __SHELL__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      // skipWaiting: eine neue Fassung soll nicht warten, bis alle Fenster
      // geschlossen sind. Bei einer App auf dem Startbildschirm waere das
      // unter Umstaenden nie.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Fremde Adressen nie anfassen: Supabase, Google, Schriften. Antworten
  // zwischenzuspeichern, die von einer Anmeldung abhaengen, waere ein
  // Datenleck zwischen zwei Konten auf demselben Geraet.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /*
   * Seitenaufrufe: erst das Netz, die gespeicherte Huelle als Auffangnetz.
   *
   * Andersherum waere schneller, aber man saehe nach jeder Auslieferung
   * noch einmal die alte App. Bei einem Bildaufbau, der ohnehin unter einer
   * Sekunde liegt, ist Aktualitaet mehr wert.
   */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./').then((hit) => hit || Response.error())),
    );
    return;
  }

  /*
   * Alles andere traegt einen Hash im Namen und aendert sich nie: aus dem
   * Cache, und was fehlt, wird beim ersten Mal nachgelegt.
   */
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
