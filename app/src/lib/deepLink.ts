import { router } from 'expo-router';
import { Platform } from 'react-native';

/**
 * Geteilte Links oeffnen: `/?card=ID` und `/?post=ID`.
 *
 * `?card=` erzeugt die App seit Monaten (shareCard) - geoeffnet hat ihn nie
 * jemand. Wer einen Kartenlink bekam, landete auf der Startseite, und die
 * Karte war nicht zu finden. Aufgefallen beim Bau von `?post=`.
 *
 * Gelesen wird beim LADEN dieses Moduls, nicht spaeter: expo-router schreibt
 * die Adresse beim Start um, danach steht die Abfrage nicht mehr drin
 * (dieselbe Falle wie bei `?einladung=`, siehe lib/invite.ts). Geoeffnet wird
 * erst, wenn jemand angemeldet ist und die App steht - vorher gibt es keinen
 * Stapel, auf den man etwas legen koennte.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let offen: { art: 'card' | 'post'; id: string; kommentar?: string } | null = null;

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  try {
    const u = new URL(window.location.href);
    const post = u.searchParams.get('post');
    const card = u.searchParams.get('card');
    // `&kommentar=` - ein geteilter Kommentar (0080). Ohne gueltigen
    // Beitrag daneben bedeutet er nichts.
    const kommentar = u.searchParams.get('kommentar');
    if (post && UUID.test(post)) {
      offen = { art: 'post', id: post, kommentar: kommentar && UUID.test(kommentar) ? kommentar : undefined };
    } else if (card && UUID.test(card)) offen = { art: 'card', id: card };
  } catch {
    /* keine lesbare Adresse - dann eben kein Link */
  }
}

/** Einmal aufrufen, sobald die App angemeldet steht. Tut danach nichts mehr. */
export function geteiltenLinkOeffnen(): void {
  if (!offen) return;
  const ziel = offen;
  offen = null;
  // Ein Tick Luft, damit der Stapel eingehaengt ist, bevor etwas daraufkommt.
  setTimeout(() => {
    router.push(
      ziel.art === 'post'
        ? `/post/${encodeURIComponent(ziel.id)}${ziel.kommentar ? `?kommentar=${ziel.kommentar}` : ''}`
        : `/reel/${encodeURIComponent(ziel.id)}`,
    );
  }, 150);
}
