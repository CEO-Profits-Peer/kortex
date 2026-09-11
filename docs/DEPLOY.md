# Online stellen

Ein Link, den du in jede WhatsApp-Gruppe schicken kannst. Erreicht Android
**und** iPhone, kostet nichts, braucht keinen Store.

---

## Einmalig: Cloudflare verbinden (3 Minuten)

Du hast den Account schon. Es fehlt nur die Verbindung vom Terminal aus.

### 1. Anmelden

```bash
npx wrangler login
```

Der Browser öffnet sich, du bestätigst mit *Allow*. Das war's — der Zugang
wird lokal gespeichert, das musst du nie wieder machen.

### 2. Projekt anlegen

```bash
npx wrangler pages project create elycic --production-branch main
```

Falls gefragt wird, ob ein Git-Repository verbunden werden soll: **nein**.
Wir laden direkt hoch, das ist für den Anfang einfacher und schneller.

---

## Jedes Mal: veröffentlichen

```bash
npm run deploy:web
```

Das macht in einem Rutsch:

1. Web-Bundle bauen (`expo export`)
2. `index.html` um Manifest, Icons und Teilen-Vorschau ergänzen
3. Nach Cloudflare Pages hochladen

Am Ende steht die URL im Terminal, ungefähr so:

```
https://elycic.pages.dev
```

Dauert nach dem ersten Mal etwa eine Minute.

---

## Was deine Tester machen

Link öffnen. Dann, **damit es sich wie eine App anfühlt**:

**Android (Chrome)** — Menü ⋮ → *App installieren* oder *Zum Startbildschirm
hinzufügen*

**iPhone (Safari)** — Teilen-Symbol → *Zum Home-Bildschirm*

Danach liegt das Icon zwischen den anderen Apps, startet im Vollbild ohne
Adressleiste, und Updates kommen automatisch beim nächsten Öffnen.

> Auf dem iPhone geht das **nur in Safari**, nicht in Chrome. Das ist eine
> Apple-Einschränkung, kein Fehler bei uns. Schreib es dazu, wenn du den Link
> verteilst — sonst probieren es die Hälfte in Chrome und es klappt nicht.

---

## Was im Web fehlt

Ehrlich, damit du es nicht als Fehler diagnostizierst:

| | |
|---|---|
| **Kein haptisches Feedback** | Der iOS-Browser kennt keine Vibration. Die Aufrufe laufen ins Leere. |
| **Wischen etwas weniger direkt** | Der Browser reicht Gesten mit minimaler Verzögerung durch. Auf günstigen Geräten spürbar. |
| **Push nur auf Android** | Auf iPhone braucht es dafür die installierte PWA und iOS 16.4+. |

Für die Frage *„lesen die Leute das, macht das Quiz Spaß"* reicht das
vollkommen. Für *„fühlt es sich butterweich an"* brauchst du später die
native Version.

---

## Danach: Samsung / Android nativ

Du hast einen Samsung-Entwickleraccount — das ist der **Galaxy Store**, ein
eigener Weg neben Google Play. Funktioniert, erreicht aber nur
Samsung-Geräte.

Reihenfolge, die ich empfehle:

1. **Jetzt:** PWA über Cloudflare. Erreicht jeden.
2. **Dann:** APK über EAS Build für die Leute, bei denen das Gefühl zählt.
   Braucht nur den Expo-Account.
3. **Wenn es läuft:** Google Play Internal Testing (25 € einmalig).
   Installiert ohne Warnung, bis zu 100 Tester, automatische Updates. Das
   ist die saubere Version für einen echten Klassentest — nicht die APK.
4. **Optional:** Galaxy Store, falls deine Testgruppe überwiegend Samsung ist.
5. **Zuletzt:** Apple, 99 €/Jahr. Erst wenn iPhone-Nutzer wirklich verlangen,
   dass die PWA nicht reicht.
