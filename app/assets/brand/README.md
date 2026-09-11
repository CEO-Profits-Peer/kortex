# Hier kommt dein Logo rein

Leg **eine** Datei in diesen Ordner:

```
app/assets/brand/logo.png
```

Danach ein Befehl, und alle 14 benötigten Größen entstehen automatisch:

```bash
npm run icons
```

---

## Was die Datei können sollte

| | |
|---|---|
| **Format** | PNG mit Transparenz. SVG geht auch (`logo.svg`), dann brauche ich aber zusätzlich ein PNG als Rückfall. |
| **Größe** | Mindestens **1024 × 1024 px**, quadratisch. Größer ist egal, kleiner wird matschig. |
| **Rand** | Rundherum etwa 10 % Luft lassen. Android schneidet Icons rund oder als Squircle zu — was zu nah am Rand sitzt, wird abgeschnitten. |
| **Hintergrund** | Am besten transparent. Dann setze ich ihn je nach Verwendung selbst (dunkel fürs App-Icon, hell fürs Teilen-Bild). |

## Der 48-Pixel-Test

Das Icon erscheint auf dem Startbildschirm etwa 48 px groß. Halte deinen
Entwurf klein daneben: Wenn man dann noch erkennt, was es darstellt, ist es
gut. Feine Linien und Text verschwinden bei dieser Größe.

Das Raster auf deinem Bild ist dafür gut geeignet — grobe Striche, klare
Form. Ein einzelner Buchstabe darin wird bei 48 px allerdings kaum lesbar
sein.

## Eine Anmerkung zur Farbe

Dein Entwurf ist **cremeweiß mit blauen Strichen** — also hell. Die App ist
**Obsidian mit Cyan** — also dunkel.

Das ist kein Problem, sondern eine Entscheidung:

- **Icon hell, App dunkel** — funktioniert gut. Ein helles Icon sticht auf
  dem Startbildschirm zwischen dunklen Icons hervor, und der Bruch beim
  Öffnen ist normal (Notion und Things machen das genauso).
- **Beides angleichen** — dann würde ich entweder das Icon auf Obsidian mit
  Cyan umfärben, oder die Signalfarbe der App von `#00F0FF` auf dein Blau
  ändern.

Sag mir, was dir lieber ist. Ich kann beide Varianten erzeugen, dann siehst
du sie nebeneinander.

---

## Was daraus entsteht

`npm run icons` erzeugt in `app/assets/generated/`:

| Datei | Wofür |
|---|---|
| `icon.png` (1024) | iOS-App-Icon |
| `adaptive-icon.png` (1024) | Android, mit Sicherheitsabstand für den Zuschnitt |
| `splash.png` (1284) | Startbildschirm |
| `favicon.png` (48) | Browser-Tab |
| `pwa-192.png`, `pwa-512.png`, `pwa-512-maskable.png` | „Zum Home-Bildschirm" |
| `og-image.png` (1200 × 630) | Vorschaubild, wenn der Link in WhatsApp geteilt wird |

Alle werden von `app.json` und dem PWA-Manifest automatisch eingebunden.
