# Medien: Bild, Ton, Video

Die Frage war: „Es wird eh nicht immer nur Text sein, oder? Musik, Video etc!"

Richtig. Aber die Reihenfolge ist wichtiger als die Liste — und meine
Empfehlung weicht in einem Punkt deutlich vom ursprünglichen Konzept ab.

---

## Die vier Karten-Modi

`content_items.presentation_mode` steuert, wie eine Karte dargestellt wird.

| Modus | Was der Nutzer sieht | Status | Kosten pro Karte |
|---|---|---|---|
| `text` | Generative Blueprint-Grafik + Text | ✅ **gebaut** | 0 |
| `interactive` | Regler, Wisch-Aussagen, Diagramme | ✅ **2 von 10 gebaut** | 0 |
| `kinetic` | Animierte Typografie, stumm lesbar | 🔲 v0.4 | 0 |
| `voice` | KI-Stimme + wortsynchrone Untertitel | 🔲 v0.5 | ~0,3 ct + Speicher |

---

## 1 · Bild — gelöst, und zwar ohne Bilder

Jede Karte hat ab jetzt eine eigene Grafik: [BlueprintVisual.tsx](../app/src/components/BlueprintVisual.tsx)
erzeugt sie **aus der Karten-ID**, nicht aus einer Datei. Ein deterministischer
Zufallsgenerator wählt eines von fünf Motiven — Orbit, Netzwerk, Welle,
Schichten, Radial — und tönt genau ein Element in der Kategoriefarbe.

Dieselbe ID ergibt immer dieselbe Grafik, der Nutzer erkennt eine Karte also
wieder. Gespeichert wird nichts.

Das löst drei Probleme gleichzeitig:

- **Rechtlich.** Pressefotos sind separat lizenziert, `og:image`-Hotlinking ist
  heikel. Selbst erzeugte Vektoren gehören uns.
- **Kosten.** Null Bytes Speicher, null Bandbreite, kein CDN. Bei 100 Karten
  pro Tag wären echte Bilder das erste, was das Supabase-Freikontingent sprengt.
- **Optik.** Konsistent technisch statt zusammengewürfelt — das genaue
  Gegenteil vom Stock-Foto-Look, den jede zweite News-App hat.

Der `Media`-Typ kann trotzdem echte Bilder aufnehmen (`visual.kind: 'image'`),
falls später eine Quelle wirklich freie Bilder liefert.

---

## 2 · Ton — geplant für v0.5, aber nicht kostenlos

Mode A aus deinem Konzept: KI-Stimme liest vor, Untertitel leuchten
wortweise mit.

**Der technische Weg steht fest.** Google Cloud TTS akzeptiert SSML mit
`<mark>`-Tags und liefert im selben Aufruf die **Zeitpunkte jedes Wortes**
zurück. Damit brauchen wir kein Forced Alignment — die Untertitel sind
frame-genau, ohne zweite Verarbeitungsstufe. Das Feld `media.audio.marks` im
Typ ist genau dafür da.

**Was es kostet, ehrlich gerechnet:**

| Posten | Rechnung |
|---|---|
| Erzeugung | ~600 Zeichen pro Karte, Google TTS Freikontingent ~1 Mio Zeichen/Monat → ~1.600 Karten gratis, danach Cent-Beträge |
| Speicher | ~250 KB MP3 pro Karte. **1.000 Karten = 250 MB** — das Supabase-Freikontingent liegt bei 1 GB |
| Bandbreite | jede Wiedergabe lädt die Datei. Supabase Free: 5 GB Egress/Monat = ~20.000 Abspielvorgänge |

**Die Konsequenz:** Ton geht nicht auf Supabase Storage, sondern auf
**Cloudflare R2** (10 GB frei, **keine Egress-Kosten**). Das ist der Moment,
an dem R2 aus der „später"-Liste in die „jetzt"-Liste rückt — nicht früher.

ElevenLabs ist übrigens raus: Der Free Tier reicht für rund 15 Karten und
erlaubt keine kommerzielle Nutzung.

---

## 3 · Video — meine Empfehlung: gar nicht

Hier widerspreche ich dem ursprünglichen Konzept, und zwar deutlich.

**Warum Video die schlechteste Investition wäre:**

- **Teuerster Posten überhaupt.** Ein 15-Sekunden-Clip wiegt 3–8 MB. Dreißig
  Videos verbrauchen mehr Speicher als zehntausend Textkarten. Die Bandbreite
  killt jedes Freikontingent innerhalb von Tagen.
- **Produktion skaliert nicht.** Text und Quiz erzeugt die Pipeline
  automatisch. Video nicht — jedes einzelne wäre Handarbeit. Nach dreißig
  Stück wäre Schluss, und der Feed hätte wieder nur Text.
- **Es ist genau das Feld, auf dem du nicht gewinnen kannst.** TikTok hat
  Milliarden in Videoinfrastruktur und Millionen Produzenten. Ein Schülerprojekt
  gewinnt dort nicht — und muss es auch nicht.
- **KI-generiertes Video ist derzeit der sicherste Weg zum Slop-Vorwurf.** Genau
  der Look, den du im Konzept selbst ausgeschlossen hast.

**Was stattdessen das „Video-Gefühl" erzeugt, für 0 €:**

`kinetic` — animierte Typografie. Wörter fahren rein, Zahlen zählen hoch,
Diagrammlinien zeichnen sich, der Hintergrund driftet leicht. Läuft mit
Reanimated auf der UI-Thread mit 120 FPS, wiegt null Bytes, und weil es
Vektoren sind, ist es auf jedem Display gestochen scharf.

Genau das machen Brilliant und Duolingo. Deren „Videos" sind keine Videos.

**Wenn du Video trotzdem willst:** dann als eingebettetes YouTube-Video einer
fremden Quelle (kein eigener Speicher, keine eigene Bandbreite, keine
Produktion) — und erst, wenn alles andere steht.

---

## Empfohlene Reihenfolge

1. ✅ **Generative Grafik** — gebaut, jede Karte hat ihr eigenes Bild
2. ✅ **Interaktive Karten** — 2 von 10 Templates gebaut
3. 🔲 **Die restlichen 8 Templates** — größter Effekt pro Aufwand
4. 🔲 **`kinetic`** — Video-Gefühl ohne Video
5. 🔲 **`voice` + R2** — erst wenn Nutzer da sind, die es hören wollen
6. ❌ **Eigenes Video** — nicht empfohlen

Die Reihenfolge folgt einem einzigen Kriterium: **Wirkung geteilt durch
laufende Kosten.** Interaktion gewinnt dort mit Abstand, Video verliert
mit Abstand.
