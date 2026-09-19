# Start für den nächsten Chat (Stand 2026-09-18)

In den neuen Chat einfügen:

> Lies `docs/HANDOFF.md` und `docs/NAECHSTER-CHAT.md` im Repo `CEO-Profits-Peer/kortex` (ElyCic).
> Wir besprechen zuerst die offenen Entscheidungen unten, dann baust du.

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

## Vorschläge aus dem Gespräch (noch zu entscheiden)
Siehe die Antwort im alten Chat. Kurz:
- **Punkt 1–3:** einfach, zuerst machen.
- **Punkt 4:** nicht erzwingen. Als wählbares PRO-Muster („Gold-Dreiecke") und als Gold-Stein-Variante für den Tab umsetzen.
- **Punkt 5, Reihenfolge nach Aufwand:**
  1. Streak-Schutz
  2. Export (CSV/Anki)
  3. LAB-Szenarien
  4. Profil-Themes
  5. Planen
  6. Statistik (braucht Aufruf-Zählung)
  7. Ligen
  - **Stimmen:** kostenpflichtige Google-Stimmen gehen NICHT, weil die Abrechnung aus bleiben muss. Nur Tempo und Browser-Stimmen.
- **Punkt 6:** kostenlos erlernbar, berechnet vom Server aus Mastery je Hauptthema. Kein bezahlter Pass.

## Regeln, die weiter gelten
- Kein Geheimnis ausgeben.
- Der Client schreibt nie XP, Mastery, Level, Streak oder PRO.
- Eine eingespielte Migration nie ändern, sondern immer eine neue anlegen.
- SQL-Funktionen nur nach Lesen der vollständigen aktuellen Fassung neu schreiben.
- Knöpfe mit einem Wort beschriften.
- Commits auf Deutsch.
- Vor größeren Design-Änderungen erst reden.
