import { Platform } from 'react-native';

import { BRAND } from './brand';
import type { Jahresrueckblick } from './supabase';
import { T, lokale } from './sprache';

/**
 * Der Jahresrueckblick als Bild (PRO, 19.09.).
 *
 * Warum ein Bild und nicht der Text von "Teilen": ein Rueckblick wird
 * gezeigt, nicht vorgelesen. Ein Satz in einer Nachricht ist eine Zahl,
 * ein Bild ist ein Aushang - und nur das zweite landet in einer Story.
 *
 * Gebaut wird es als SVG und ueber ein Canvas in ein PNG gegossen. Kein
 * html2canvas, kein view-shot, keine neue Abhaengigkeit: die Vorlage steht
 * hier im Code, damit sie genau so aussieht, wie sie soll - und nicht so,
 * wie ein Bildschirmfoto der Seite gerade ausfaellt.
 *
 * Schrift: bewusst die Systemschrift. Eigene Schriften muessten als
 * base64 ins SVG eingebettet werden, sonst zeichnet das Canvas sie nicht -
 * das waeren ein paar hundert Kilobyte fuer ein Bild, das man einmal teilt.
 */

const BREITE = 1080;
const HOEHE = 1350;
const BORDEAUX = '#4E1626';
const TIEF = '#25090F';
const GOLD = '#D9B872';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sechseck(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const w = (Math.PI / 3) * i - Math.PI / 2;
    return `${(cx + r * Math.cos(w)).toFixed(1)},${(cy + r * Math.sin(w)).toFixed(1)}`;
  }).join(' ');
}

function zahl(n: number): string {
  return n.toLocaleString(lokale());
}

export function jahresSvg(j: Jahresrueckblick, name: string): string {
  const zeilen: { wert: string; label: string }[] = [
    { wert: zahl(j.gelesen), label: T('Karten gelesen') },
    { wert: zahl(j.lerntage), label: T('Lerntage') },
    { wert: zahl(j.serie), label: T('Tage am Stück') },
    { wert: zahl(j.richtig), label: T('Fragen richtig') },
  ];
  const themen = j.themen.slice(0, 3);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BREITE}" height="${HOEHE}" viewBox="0 0 ${BREITE} ${HOEHE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="${BORDEAUX}"/>
      <stop offset="1" stop-color="${TIEF}"/>
    </linearGradient>
  </defs>
  <rect width="${BREITE}" height="${HOEHE}" fill="url(#bg)"/>
  <polygon points="${sechseck(880, 200, 210)}" fill="none" stroke="${GOLD}" stroke-opacity="0.25" stroke-width="3"/>
  <polygon points="${sechseck(880, 200, 140)}" fill="none" stroke="${GOLD}" stroke-opacity="0.18" stroke-width="2"/>
  <polygon points="${sechseck(140, 1180, 120)}" fill="none" stroke="${GOLD}" stroke-opacity="0.15" stroke-width="2"/>

  <text x="90" y="170" fill="${GOLD}" font-family="sans-serif" font-size="34" letter-spacing="6">${esc(
    T(j.laufend ? 'MEIN JAHR BISHER' : 'MEIN JAHR').toUpperCase(),
  )}</text>
  <text x="90" y="300" fill="#FFFFFF" font-family="sans-serif" font-size="150" font-weight="bold">${j.jahr}</text>
  <text x="90" y="360" fill="rgba(255,255,255,0.75)" font-family="sans-serif" font-size="38">${esc(name)}</text>

  ${zeilen
    .map((z, i) => {
      const y = 520 + i * 165;
      return `<text x="90" y="${y}" fill="#FFFFFF" font-family="sans-serif" font-size="96" font-weight="bold">${esc(
        z.wert,
      )}</text>
  <text x="${90 + z.wert.length * 58 + 30}" y="${y}" fill="rgba(255,255,255,0.8)" font-family="sans-serif" font-size="40">${esc(
    z.label,
  )}</text>`;
    })
    .join('\n  ')}

  ${
    themen.length > 0
      ? `<text x="90" y="1180" fill="${GOLD}" font-family="sans-serif" font-size="30" letter-spacing="4">${esc(
          T('Deine Themen').toUpperCase(),
        )}</text>
  <text x="90" y="1245" fill="#FFFFFF" font-family="sans-serif" font-size="46">${esc(
    themen.map((t) => t.name).join('  ·  '),
  )}</text>`
      : ''
  }
  <text x="90" y="1310" fill="rgba(255,255,255,0.55)" font-family="sans-serif" font-size="32">${esc(BRAND.name)}</text>
</svg>`;
}

async function svgZuPng(svg: string): Promise<Blob | null> {
  const bild = new Image();
  bild.crossOrigin = 'anonymous';
  const quelle = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  const geladen = await new Promise<boolean>((fertig) => {
    bild.onload = () => fertig(true);
    bild.onerror = () => fertig(false);
    bild.src = quelle;
  });
  if (!geladen) return null;
  const canvas = document.createElement('canvas');
  canvas.width = BREITE;
  canvas.height = HOEHE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bild, 0, 0, BREITE, HOEHE);
  return new Promise<Blob | null>((fertig) => canvas.toBlob((b) => fertig(b), 'image/png', 0.95));
}

export type BildErgebnis = 'geteilt' | 'geladen' | 'nicht';

/** Bild erzeugen und teilen - oder herunterladen, wo Teilen nicht geht. */
export async function jahresBildTeilen(j: Jahresrueckblick, name: string): Promise<BildErgebnis> {
  if (Platform.OS !== 'web') return 'nicht';
  try {
    const blob = await svgZuPng(jahresSvg(j, name));
    if (!blob) return 'nicht';
    const datei = new File([blob], `${BRAND.name}-${j.jahr}.png`, { type: 'image/png' });
    const nav = globalThis.navigator as Navigator & {
      canShare?: (d: { files: File[] }) => boolean;
      share?: (d: { files: File[]; title?: string }) => Promise<void>;
    };
    if (nav?.canShare?.({ files: [datei] }) && nav.share) {
      await nav.share({ files: [datei], title: `${BRAND.name} ${j.jahr}` });
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
