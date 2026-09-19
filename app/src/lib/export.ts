import { Platform, Share } from 'react-native';

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
