import { Platform, Share } from 'react-native';

import { BRAND } from './brand';
import type { BodyBlock, ContentItem } from './types.db';

/**
 * Stapel-Export (PRO, 19.09.): als Textdatei, die Anki direkt importiert.
 *
 * Format: Tab-getrennt mit Anki-Kopfzeilen (#separator, #columns). Kein CSV
 * mit Komma - Kartentexte sind voller Kommas, und ein falsch gesetztes
 * Anfuehrungszeichen verschiebt beim Import still alle Spalten.
 *
 * Vorderseite = Titel, Rueckseite = Unterzeile + Kerntext + Quelle. Die
 * Quizantwort kommt NICHT mit: die App kennt sie vor dem Antworten nicht
 * (0013), und das soll ein Export nicht aendern.
 */

function flach(t: string): string {
  return t.replace(/[\t\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function kerntext(bloecke: BodyBlock[] | null | undefined): string {
  return (bloecke ?? [])
    .map((b) =>
      b.type === 'bullet' ? b.items.map((i) => `• ${i}`).join(' ') : b.type === 'stat' ? `${b.value} ${b.label}` : b.text,
    )
    .join(' ');
}

export function stapelAlsAnki(karten: ContentItem[]): string {
  const kopf = ['#separator:tab', '#html:false', '#columns:Vorderseite\tRückseite\tQuelle'];
  const zeilen = karten.map((k) => {
    const hinten = [k.deck, kerntext(k.body_blocks)].filter(Boolean).join(' – ');
    const quelle = k.source_urls?.[0] ?? '';
    return [flach(k.title), flach(hinten), flach(quelle)].join('\t');
  });
  return [...kopf, ...zeilen].join('\n') + '\n';
}

/**
 * Im Browser als Datei speichern, auf dem Handy ueber das Teilen-Menue -
 * dort gibt es kein "Herunterladen", aber Anki und jede Dateien-App nehmen
 * geteilten Text an.
 */
export async function textSpeichern(dateiname: string, text: string): Promise<void> {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = dateiname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  await Share.share({ title: dateiname, message: text });
}

// --- PDF ------------------------------------------------------------------------------

function html(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function blockHtml(b: BodyBlock): string {
  if (b.type === 'bullet') return `<ul>${b.items.map((i) => `<li>${html(i)}</li>`).join('')}</ul>`;
  if (b.type === 'stat') return `<p class="stat"><strong>${html(b.value)}</strong> ${html(b.label)}</p>`;
  if (b.type === 'quote') return `<blockquote>${html(b.text)}${b.attribution ? ` <cite>– ${html(b.attribution)}</cite>` : ''}</blockquote>`;
  return `<p>${html(b.text)}</p>`;
}

/**
 * Ein Stapel als druckfertige Seite (PRO, 19.09.) - im Browser ueber
 * "Drucken > Als PDF speichern". Keine PDF-Bibliothek: der Druckdialog kann
 * das auf jedem Geraet, und Schrift und Umbruch macht der Browser besser als
 * eine nachgebaute Seitenbeschreibung.
 *
 * Hell und schlicht, weil es gedruckt wird: dunkler Grund frisst Toner und
 * ist auf Papier schlecht lesbar. Jede Karte bleibt auf einer Seite zusammen.
 * Das Fenster muss VOR dem Laden geoeffnet werden (fenster), sonst blockt der
 * Browser es als Popup, weil der Klick schon vorbei ist.
 */
export function stapelPdfFenster(): Window | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return window.open('', '_blank');
}

export function stapelAlsPdf(fenster: Window, karten: ContentItem[], titel: string) {
  const inhalt = karten
    .map(
      (k, i) => `<section>
  <div class="nr">${i + 1} / ${karten.length}</div>
  <h2>${html(k.title)}</h2>
  ${k.deck ? `<p class="deck">${html(k.deck)}</p>` : ''}
  ${(k.body_blocks ?? []).map(blockHtml).join('\n')}
  ${k.source_urls?.[0] ? `<p class="quelle">Quelle: ${html(k.source_urls[0])}</p>` : ''}
</section>`,
    )
    .join('\n');
  fenster.document.open();
  fenster.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>${html(titel)}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #1a1416; margin: 32px; line-height: 1.5; }
  h1 { font-size: 22px; margin: 0 0 4px; color: #4E1626; }
  .kopf { border-bottom: 2px solid #D9B872; padding-bottom: 8px; margin-bottom: 24px; color: #6b5f63; font-size: 12px; }
  section { break-inside: avoid; page-break-inside: avoid; padding: 16px 0; border-bottom: 1px solid #e8e2dc; }
  h2 { font-size: 17px; margin: 4px 0; }
  .nr { font-size: 11px; color: #9a8f88; letter-spacing: 1px; }
  .deck { color: #4E1626; font-weight: 600; margin: 2px 0 8px; }
  .stat strong { font-size: 18px; color: #4E1626; }
  blockquote { margin: 8px 0; padding-left: 12px; border-left: 3px solid #D9B872; font-style: italic; }
  .quelle { font-size: 11px; color: #9a8f88; word-break: break-all; }
  @media print { body { margin: 12mm; } }
</style></head><body>
<h1>${html(titel)}</h1>
<div class="kopf">${karten.length} Karten · ${new Date().toLocaleDateString('de-AT')} · ${html(BRAND.name)}</div>
${inhalt}
<script>setTimeout(function(){ window.print(); }, 300);</script>
</body></html>`);
  fenster.document.close();
}
