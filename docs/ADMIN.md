# Kontrollzentrum

Eine Seite unter `/admin`, die den Zustand des ganzen Systems zeigt:
Betrieb, Bestand, Nutzung, Aufmerksamkeit, Inhalt. Nirgends verlinkt.

## Warum es so gebaut ist

Alle Zahlen, die bisher in Chatnachrichten standen, wurden mit dem
`service_role`-Schlüssel gezogen. Der umgeht **jede** Regel dieser
Datenbank und darf nie in einen Browser. Also liegt die Auswertung in
einer `SECURITY DEFINER`-Funktion (`admin_overview`, Migration 0064), die
vor jeder Antwort prüft, wer fragt.

**Zwei Schlösser, absichtlich verschiedene:**

1. `profiles.is_admin` — wer es nicht hat, bekommt nichts.
2. Eine PIN als bcrypt-Hash am Profil, die bei **jedem** Aufruf
   mitgeschickt werden muss.

Das zweite ist nicht doppelt gemoppelt. Das erste hängt an der Sitzung:
wer das entsperrte Telefon in der Hand hält, ist angemeldet. Das zweite
hängt an etwas, das man wissen muss.

Die Sperre steckt **nicht** im Bildschirm. Eine Sperre in JavaScript ist
eine Sperre auf einem fremden Gerät; `app/src/app/admin.tsx` kann nichts
anzeigen, was die Funktion nicht herausgibt.

Alle drei Fehlerfälle — nicht angemeldet, kein Admin, falsche PIN — melden
denselben Satz. „Admin ja, PIN falsch" wäre die Auskunft, dass sich
Weiterprobieren lohnt.

## Einrichten

Migration `0064_admin_overview.sql` einspielen, dann **eine** Zeile im
Supabase-SQL-Editor ausführen. Handle und PIN einsetzen:

```sql
update public.profiles
   set is_admin       = true,
       admin_pin_hash = extensions.crypt('DEINE-PIN', extensions.gen_salt('bf'))
 where handle = 'DEIN-HANDLE';
```

Das steht hier mit Platzhaltern, und das ist Absicht: das Repo ist
öffentlich. Weder die PIN noch der Name des einzigen Kontos mit Zugang
gehören hinein.

Die PIN wird als bcrypt-Hash gespeichert — aus der Datenbank ist sie nicht
zurückzurechnen. Vergessen heißt: dieselbe Zeile mit einer neuen PIN
nochmal ausführen.

**Zugang wieder entziehen:**

```sql
update public.profiles
   set is_admin = false, admin_pin_hash = null
 where handle = 'DEIN-HANDLE';
```

## Drei Reiter

**Übersicht** · Betrieb, Bestand, Nutzung, Aufmerksamkeit, Inhalt.
**Kategorien** · alle Unterkategorien mit Bestand, Sprachaufteilung,
Lesequote und Interesse; sortierbar nach Bestand, Lesequote, Interesse und
Lücken.
**Personen** · Suche nach `@handle` oder Name, ohne Eingabe die zuletzt
Aktiven; ein Tipp öffnet die Einzelansicht.

Die PIN liegt beim Öffnen in einer Ref und bleibt dort, solange der
Bildschirm offen ist — mit drei Reitern müsste man sie sonst vor jedem Klick
neu tippen. Sie landet **nicht** im Gerätespeicher: eine PIN, die einen
Neustart überlebt, ist keine zweite Sperre mehr, sondern ein zweiter
Schlüssel unter der Fußmatte. „Sperren" oben rechts wirft alles weg.

## Was es zeigt

| Feld | Frage |
|---|---|
| **Betrieb** | Läuft die Maschine? Neue Karten heute, wartende Freigaben, Quellen mit Fehler, längst stille Quelle, Größe der Datenbank. |
| **Bestand** | Was ist da? Freigegeben, Anteil Erklärkarten, je Sprache, leere Kategorien. |
| **Nutzung** | Kommt jemand wieder? Aktive Konten in 15 Minuten / 24 Stunden / 7 / 30 Tagen, neue Konten, Ereignisse nach Art. |
| **Aufmerksamkeit** | Gelesen oder gewischt? Lesequote, Wischquote, Likequote, Verweildauer (Median und oberstes Zehntel). |
| **Inhalt** | Was funktioniert? Beliebteste Karten, am häufigsten weggewischte, Lesequote je Kategorie, „zu leicht" / „zu schwer". |

„Gerade da" heißt: ein Ereignis in den letzten fünfzehn Minuten. Eine
echte Präsenzanzeige gibt es nicht, und für die Frage „ist jemand da"
braucht es sie auch nicht.

## Personen — die Begründung

In der ersten Fassung stand hier: keine Einzelpersonen, und wer das braucht,
baut es als eigene Funktion mit eigener Begründung. Das ist mit Migration
0068 passiert, und die Begründung ist: ohne das ist keine Unterstützung
möglich. „Mein Feed ist nur auf Deutsch", „ich bekomme keine
Wiederholungen", „meine Strähne ist weg" — auf keine dieser Fragen gibt es
eine Antwort aus Summen über alle Konten. Die Alternative wäre, mit dem
`service_role`-Schlüssel in die Tabellen zu greifen, und der umgeht **jede**
Regel dieser Datenbank. Eine enge Funktion mit PIN davor ist der kleinere
Zugriff, nicht der größere.

**Was auch dort nicht steht:**

- **Keine Kartentitel.** Statt einer Leseliste die *Verteilung* der letzten
  100 gesehenen Karten auf Kategorien. Das beantwortet „warum sehe ich nur
  Politik" genauso gut, ohne jemandem über die Schulter zu lesen. Wer die
  Titel wirklich braucht, ändert genau eine Unterabfrage in 0068 — und
  schreibt in den Kopf, warum.
- Keine Kommentartexte, keine Likes auf einzelne Karten.
- Kein `admin_pin_hash`, auch nicht der eigene.

## Wer war auf der Seite? (Cloudflare)

Das Kontrollzentrum zählt, was **in** der App passiert — also nur von Leuten,
die ein Konto haben. Wer die Seite geöffnet und wieder zugemacht hat, kommt
darin nicht vor. Diese Frage beantwortet Cloudflare.

**Cloudflare Web Analytics** ist kostenlos, setzt kein Cookie und erkennt
niemanden wieder. Es zeigt: Seitenaufrufe, Besuche, Länder, woher der Link
kam, Browser, Gerätetyp und Ladezeiten. Es zeigt **keine Personen** — keine
IP-Adresse, keine Wiedererkennung, keinen einzelnen Besucher. „Wer" heißt
hier „aus welchem Land, über welchen Link", nicht „welcher Mensch". Für alles
darüber hinaus bräuchte es Tracking, und das wäre bei einer teils
minderjährigen Zielgruppe die falsche Entscheidung.

Einschalten:

1. Cloudflare-Dashboard → **Analytics & Logs** → **Web Analytics** → *Add a
   site* → `elycic.pages.dev` → **Update**. Cloudflare zeigt danach ein
   JS-Schnipsel mit einem **Token** darin.
2. Das Schnipsel (oder nur den Token) in `app/.env` schreiben — die Datei
   steht in `.gitignore`:

```
CF_BEACON_TOKEN=<Token oder das ganze Schnipsel>
```

Das war es. Jedes `npm run deploy:web` baut den Zähler von da an mit ein.
Ohne den Eintrag enthält der Build keine Zeile davon.

Der Token ist übrigens **kein Geheimnis** — er steht anschließend im
Quelltext jeder ausgelieferten Seite. Er gehört trotzdem nicht ins Repo: was
nicht drinsteht, muss man auch nicht zurückziehen.

Für einen einmaligen Lauf geht auch eine Umgebungsvariable. **PowerShell:**

```
$env:CF_BEACON_TOKEN="dein-token"; npm run deploy:web
```
Das steckt in `scripts/finish_web.py`; absichtlich dort und nicht in einem
Dashboard-Schalter: eine Zeile, die eine fremde Domain in jede Seite lädt,
gehört dorthin, wo man sie im Repo sieht.

Nicht verwechseln mit **PostHog**, das schon läuft: das beantwortet die
andere Frage — was jemand *in* der App tut, verknüpft über die Konto-UUID.
Cloudflare endet an der Tür, PostHog fängt dahinter an.

## Ansehen ohne Anmeldung

`/atelier`, Reiter **kontrolle**, zeigt alle drei Ansichten mit erfundenen
Zahlen — samt der Fälle, die im Echtbetrieb zufällig gerade nie dastehen:
leere Kategorie, Quelle mit Fehler, Konto, das einmal da war und nie wieder. Dafür ist die Darstellung (`features/admin/AdminOverview.tsx`)
vom Holen und Absichern (`app/admin.tsx`) getrennt: eine Gestaltung, die
man nur im Echtbetrieb sehen kann, wird nicht gestaltet, sondern vermutet.
