import { Platform } from 'react-native';

import { BRAND } from './brand';
import { T } from './sprache';
import type { ContentItem } from './types.db';

/**
 * Eine Karte als Bild (20.09.).
 *
 * Dieselbe Technik wie beim Jahresrueckblick: eine SVG-Vorlage, ueber ein
 * Canvas in ein PNG gegossen, ohne neue Abhaengigkeit. Kein Bildschirmfoto -
 * das Bild ist gesetzt, nicht abgefilmt, und traegt Titel, Kernsatz, Quelle
 * und den Namen der App.
 *
 * Warum nicht die ganze Karte: eine Karte kann fuenf Bloecke haben und
 * ueber mehrere Seiten laufen. Auf ein Bild gehoert, was man in zwei
 * Sekunden liest - Titel, ein Satz, Quelle.
 */

const BREITE = 1080;
const HOEHE = 1350;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Text auf Zeilen brechen - das Canvas kann kein Umbrechen. */
function zeilen(text: string, proZeile: number, max: number): string[] {
  const worte = text.split(/\s+/);
  const aus: string[] = [];
  let zeile = '';
  for (const w of worte) {
    if ((zeile + ' ' + w).trim().length > proZeile) {
      aus.push(zeile.trim());
      zeile = w;
      if (aus.length === max) break;
    } else {
      zeile = `${zeile} ${w}`;
    }
  }
  if (aus.length < max && zeile.trim()) aus.push(zeile.trim());
  return aus;
}

export function kartenSvg(item: ContentItem, akzent: string): string {
  const titel = zeilen(item.title, 22, 4);
  const deck = item.deck ? zeilen(item.deck, 34, 3) : [];
  const quelle = (item.source_urls?.[0] ?? '').replace(/^https?:\/\//, '').split('/')[0];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BREITE}" height="${HOEHE}" viewBox="0 0 ${BREITE} ${HOEHE}">
  <defs>
    <pattern id="raster" width="72" height="72" patternUnits="userSpaceOnUse">
      <path d="M72 0H0v72" fill="none" stroke="#FFFFFF" stroke-opacity="0.05" stroke-width="2"/>
    </pattern>
  </defs>
  <rect width="${BREITE}" height="${HOEHE}" fill="#0B0C0E"/>
  <rect width="${BREITE}" height="${HOEHE}" fill="url(#raster)"/>
  <rect x="0" y="0" width="14" height="${HOEHE}" fill="${akzent}"/>

  <text x="100" y="190" fill="${akzent}" font-family="sans-serif" font-size="30" letter-spacing="5">#${esc(
    item.primary_category_id.split('.').pop() ?? '',
  ).toUpperCase()}</text>

  ${titel
    .map((z, i) => `<text x="100" y="${320 + i * 104}" fill="#FFFFFF" font-family="sans-serif" font-size="86" font-weight="bold">${esc(z)}</text>`)
    .join('\n  ')}

  ${deck
    .map(
      (z, i) =>
        `<text x="100" y="${360 + titel.length * 104 + i * 58}" fill="rgba(255,255,255,0.75)" font-family="sans-serif" font-size="44">${esc(z)}</text>`,
    )
    .join('\n  ')}

  <text x="100" y="${HOEHE - 150}" fill="rgba(255,255,255,0.5)" font-family="sans-serif" font-size="32">${esc(quelle)}</text>
  <text x="100" y="${HOEHE - 90}" fill="${akzent}" font-family="sans-serif" font-size="36" font-weight="bold">${esc(BRAND.name)}</text>
</svg>`;
}

export type BildErgebnis = 'geteilt' | 'geladen' | 'nicht';

export async function karteAlsBild(item: ContentItem, akzent: string): Promise<BildErgebnis> {
  if (Platform.OS !== 'web') return 'nicht';
  try {
    const svg = kartenSvg(item, akzent);
    const bild = new Image();
    const quelle = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    const geladen = await new Promise<boolean>((fertig) => {
      bild.onload = () => fertig(true);
      bild.onerror = () => fertig(false);
      bild.src = quelle;
    });
    if (!geladen) return 'nicht';

    const canvas = document.createElement('canvas');
    canvas.width = BREITE;
    canvas.height = HOEHE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'nicht';
    ctx.drawImage(bild, 0, 0, BREITE, HOEHE);
    const blob = await new Promise<Blob | null>((f) => canvas.toBlob((b) => f(b), 'image/png', 0.95));
    if (!blob) return 'nicht';

    const datei = new File([blob], `${BRAND.name}-${item.id.slice(0, 8)}.png`, { type: 'image/png' });
    const nav = globalThis.navigator as Navigator & {
      canShare?: (d: { files: File[] }) => boolean;
      share?: (d: { files: File[]; title?: string }) => Promise<void>;
    };
    if (nav?.canShare?.({ files: [datei] }) && nav.share) {
      await nav.share({ files: [datei], title: T('Karte') });
      return 'geteilt';
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = datei.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return 'geladen';
  } catch {
    return 'nicht';
  }
}
