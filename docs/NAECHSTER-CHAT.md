# Start für den nächsten Chat (Stand 2026-09-19)

In den neuen Chat einfügen:

> Lies `docs/HANDOFF.md` und `docs/NAECHSTER-CHAT.md` im Repo `CEO-Profits-Peer/kortex` (ElyCic).
> Die Entscheidungen unten sind getroffen, du kannst direkt mit Schritt 1 bauen.

## Wo wir stehen
- **Design 2.0 (V2.2)** ist per Schalter unter Einstellungen > Design aktiv:
  - Bordeaux und Gold, Gold sparsam eingesetzt.
  - Eckige Tab-Leiste; das Sechseck auf dem aktiven Tab ist wählbar als Stein oder Flach.
  - Hinweise in `color.akzent`, Auswahl über `gewaehlt()`.
  - Keine Serifenschrift (abgelehnt).
- **Neues App-Icon:** Bordeaux-Stein mit goldenem Knoten.
- **Profilbilder:** regelmäßige Sechsecke mit Waben-Editor (Format v2, `lib/avatarWaben.ts`).
- **PRO** ist echt und wird vom Server durchgesetzt (0091):
  - Grenzen in `create_post`
  - Anpinnen 1 / 3
  - Profilbild-Stile Metall und Glas plus 4 Gründe
  - Abzeichen
  - Codes über `scripts/pro_code.py`
  - PRO-Fenster `zeigeProSperre`
- **Noch kein Kauf:** RevenueCat ist geplant.
- **Werkstatt `/atelier`:** ohne Konto erreichbar. Die Reiter `design` und `pro` zeigen die Bausteine.

## Vom Nutzer gewünscht (18.09.), noch NICHT gebaut
1. **Quiz:** bis 5 Antworten mit PRO (kostenlos 3).
2. **PRO-Freischalt-Animation:** aufwendig, danach eine Vorstellung der Features.
3. **„PRO werden"-Banner** ausblenden, wenn PRO aktiv ist.
4. **Optische PRO-Aufwertung**, z. B. dezente Gold-Dreiecke im Hintergrund.
5. **Restliche PRO-Features:**
   - Profil-Themes
   - Statistik
   - Beiträge planen
   - Ligen
   - LAB-Szenarien
   - Export
   - Stimmen
   - Streak-Schutz
   - Saison-Rahmen
   - animierter Stein
6. **Fortschritt durch Lernen** („Battlepass"-Idee):
   - Freischalten je Themenbereich und Level: Rahmen, Namensfarbe, Profilbild-Farben.
   - Gewünscht sind auch schwarze und dunkle Farben, die zum Stil passen.

## ENTSCHIEDEN (18.09., Nutzer hat allen vier Punkten zugestimmt)
1. **Muster wählbar, nie automatisch:** Das Hintergrund-Muster „Gold-Dreiecke" (sehr dezent) und die Gold-Stein-Variante des Sechsecks (Tab- und Feed-Leiste, neben Stein und Flach) sind PRO-Optionen. Die App wird für PRO nicht automatisch umgefärbt.
2. **Meisterwege** (Name bestätigt, NICHT „Battlepass"):
   - Stufen je Hauptthema, die der Server aus der Mastery berechnet. Nicht kaufbar, nicht mogelbar.
   - Beispiel Wissenschaft: Stufe 2 Rahmen „Laborglas", Stufe 3 Namensfarbe, Stufe 5 besondere Profilbild-Farbe.
   - Namensfarben nur aus einer kleinen, lesbaren Design-2.0-Palette.
   - Dunkle Profilbild-Farben: Obsidian, Anthrazit, Tiefgrün, Nachtblau, Schwarz-Gold. Dazu helle Gründe: Elfenbein, Champagner, Sand.
   - PRO bekommt je Meisterweg eine Zusatzvariante, aber NIE schnelleren Fortschritt.
3. **Reihenfolge:**
   1. ✅ Quiz 5 Antworten mit PRO (kostenlos 3). Migration `0093_quiz_fuenf.sql` eingespielt (19.09.).
   2. ✅ Freischalt-Animation (`features/pro/ProWillkommen.tsx`, Vorschau: `/atelier` → design → „Willkommen“), etwa 5 s, jederzeit überspringbar:
      - Der Bildschirm wird Bordeaux, die sechs Facetten fliegen zum Sechseck, die Goldkante zeichnet sich, goldene Dreiecke sprühen, „Willkommen bei PRO".
      - Danach 3–4 Wischkarten (Profilbild-Stile, Stapel 50, Anpinnen, Abzeichen), jede mit Knopf „Ausprobieren".
      - Ruhige Version bei „Bewegung reduzieren".
   3. ✅ Das „PRO werden"-Banner verschwindet bei PRO ersatzlos.
   4. ✅ Meisterwege (19.09.): `0095_meisterwege.sql` (muss eingespielt werden), Seite `/meisterwege`, Rahmen am Profilbild, Namensfarbe, Meister-Farben im Editor. Stufen 50/150/400/800/1500 Mastery je Hauptthema.
   5. ✅ PRO-Features (19.09.), alle gebaut:
      - Streak-Schutz (0096)
      - Gold-Stein und Gold-Dreiecke (nur App)
      - Stapel-Export für Anki (nur App)
      - Vorlese-Tempo und Browser-Stimme (nur App)
      - LAB-Szenarien (nur App, gespeichert auf dem Gerät)
      - Beiträge planen (0097)
      - Profil-Themes (0098)
      - Reichweite und Lern-Heatmap (0099, zählt erst ab dem Einspielen)
      - private Ligen (0100)
   6. **Migrationen 0095–0100 müssen eingespielt werden** (`npx supabase db push --linked --yes`). Jede hat einen Selbsttest mit Rollback.
   7. Offen: PDF-Export; beim Gold-Profil-Theme fehlt die Kante an den abgeschrägten Ecken.
4. **Stimmen:** nur Tempo und Browser-Stimmen. Keine kostenpflichtigen Google-Stimmen, die Abrechnung bleibt aus.

## ENTSCHIEDEN (19.09., zweite Runde)
- **Neue Animationen: bleiben** ("Peak"), aber nur, wenn man sie sieht (umgesetzt: `lib/imBild.ts`).
- **Nach den neuen Features:**
  1. Karten-UI remastern – eine Karte darf nicht mit Knöpfen überladen werden (Rechnen, Notiz, …).
  2. Volle Übersetzung ins Englische.
- **Karten in die andere Sprache übersetzen** statt neu generieren (billiger). Dabei darf niemand dieselbe Karte in beiden Sprachen bekommen.
- **Feature-Liste**, ja zu:
  - 1 Erklär-es-mir-nochmal
  - 2 Prüfungsmodus, dazu **Themenwünsche**: gewünschte Themen lesen, die meistgewünschten als Kartenserie bauen
  - 3 Lernpfade
  - 4 Karten-Zusammenhänge
  - 5 Klassen-Modus
  - 6 Lernpartner
  - 7 Frage an die Community (wenn umsetzbar)
  - 9 Monats-Abzeichen
  - 10 Jahresrückblick
  - 12 Lokale Karten
  - 13 Audio-Modus
- **Gebaut (19.09.):**
  - 1 Erklär-es-nochmal und 4 „Dazu passt“ (0109)
  - 2 Prüfungsmodus `/pruefung` (0110)
  - Themenwünsche `/wuensche` (0111): Freigabe im Kontrollzentrum, Reiter „Wünsche“; Evergreen baut bis zu 4 Karten je Freigabe zuerst, danach Meldung an die Wünschenden
  - 3 Lernpfade (0112): 14 kuratierte Pfade, `courses.py` baut Stationen ohne Kurs zuerst (2 Kurse/Tag im Workflow)
  - 5 Klassen-Modus (0113): „Überblick“ im eigenen Gruppen-Stapel, anonym, Quote erst ab 3 Antworten
  - 6 Lernpartner (0114): `/lernpartner`, Wochenziel zu zweit, Anstupsen
- **Web-Deploy darf ich selbst** (`npm run deploy:web`).
- **Weiter mit:** 7 Community-Frage, 9 Monats-Abzeichen, 10 Jahresrückblick, 12 Lokale Karten, 13 Audio-Modus.
- **Noch offen:**
  - 8 „Fertig für heute“ – überlegt er noch.
  - 11 Karten vorschlagen – beliebte Themen entweder ihm zur Freigabe vorlegen oder die Pipeline muss Unangemessenes erkennen. Erst besprechen.
- **Später:** Quiz-Antworten auf dem Server, Namen ändern, USA, RevenueCat.

## Regeln, die weiter gelten
- Kein Geheimnis ausgeben.
- Der Client schreibt nie XP, Mastery, Level, Streak oder PRO.
- Eine eingespielte Migration nie ändern, sondern immer eine neue anlegen.
- SQL-Funktionen nur nach Lesen der vollständigen aktuellen Fassung neu schreiben.
- Knöpfe mit einem Wort beschriften.
- Commits auf Deutsch.
- Vor größeren Design-Änderungen erst reden.
