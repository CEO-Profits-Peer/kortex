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

## Was es bewusst NICHT zeigt

**Einzelpersonen.** Keine Zeile sagt, was ein bestimmtes Konto gelesen
hat. Nicht weil es schwer wäre — es ist trivial —, sondern weil ein
Kontrollzentrum, das erst einmal alles anzeigt, nie wieder zurückgebaut
wird. Wer später eine einzelne Sitzung untersuchen muss, baut das als
eigene Funktion mit eigener Begründung.

## Ansehen ohne Anmeldung

`/atelier`, Reiter **kontrolle**, zeigt dieselbe Darstellung mit
erfundenen Zahlen. Dafür ist die Darstellung (`features/admin/AdminOverview.tsx`)
vom Holen und Absichern (`app/admin.tsx`) getrennt: eine Gestaltung, die
man nur im Echtbetrieb sehen kann, wird nicht gestaltet, sondern vermutet.
