import * as Clipboard from 'expo-clipboard';
import { Platform, Share } from 'react-native';

import { BRAND } from './brand';
import { track } from './eventBuffer';

/**
 * Teilen.
 *
 * Drei Wege, absteigend nach Qualität:
 *   1. Web Share API   — auf dem Handy im Browser, öffnet das System-Blatt
 *   2. React Native Share — nativ, dasselbe Blatt
 *   3. Zwischenablage  — Desktop-Browser, wo es kein Blatt gibt
 *
 * Geteilt wird ein Link auf die App plus der Kartentitel, nicht der
 * Kartentext. Zusammenfassungen weiterzureichen wäre genau das Verbreiten,
 * das docs/CONTENT-SOURCING.md vermeidet — und der Link bringt Leute in die
 * App statt an ihr vorbei.
 */

const WEB_BASE = 'https://elycic.pages.dev';

type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

export async function shareCard(opts: {
  contentId: string;
  title: string;
  categorySlug?: string;
}): Promise<ShareResult> {
  const url = `${WEB_BASE}/?card=${encodeURIComponent(opts.contentId)}`;
  const message = `${opts.title}\n\nGelesen auf ${BRAND.name}: ${url}`;

  track(opts.contentId, 'share', {
    payload: { category: opts.categorySlug ?? null },
  });

  // Web: das native Blatt gibt es nur auf Mobilgeräten.
  if (Platform.OS === 'web') {
    const nav = globalThis.navigator as Navigator & {
      share?: (d: { title: string; text: string; url: string }) => Promise<void>;
    };
    if (typeof nav?.share === 'function') {
      try {
        await nav.share({ title: opts.title, text: opts.title, url });
        return 'shared';
      } catch {
        return 'cancelled';
      }
    }
    try {
      await Clipboard.setStringAsync(url);
      return 'copied';
    } catch {
      return 'failed';
    }
  }

  try {
    const res = await Share.share({ message, title: opts.title });
    return res.action === Share.dismissedAction ? 'cancelled' : 'shared';
  } catch {
    return 'failed';
  }
}
