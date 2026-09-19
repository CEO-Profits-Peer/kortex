# Start für den nächsten Chat (Stand 2026-09-18)

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
   4. Meisterwege.
   5. PRO-Features: Streak-Schutz → Export (CSV/Anki, später PDF) → LAB-Szenarien → Profil-Themes → Planen → Statistik (braucht Aufruf-Zählung, nicht rückwirkend) → Ligen.
4. **Stimmen:** nur Tempo und Browser-Stimmen. Keine kostenpflichtigen Google-Stimmen, die Abrechnung bleibt aus.

## Regeln, die weiter gelten
- Kein Geheimnis ausgeben.
- Der Client schreibt nie XP, Mastery, Level, Streak oder PRO.
- Eine eingespielte Migration nie ändern, sondern immer eine neue anlegen.
- SQL-Funktionen nur nach Lesen der vollständigen aktuellen Fassung neu schreiben.
- Knöpfe mit einem Wort beschriften.
- Commits auf Deutsch.
- Vor größeren Design-Änderungen erst reden.
