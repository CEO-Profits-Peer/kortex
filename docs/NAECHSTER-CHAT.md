# Start für den nächsten Chat (Stand 20. September 2026)

In den neuen Chat einfügen:

> Lies `docs/HANDOFF.md` und `docs/NAECHSTER-CHAT.md` im Repo `CEO-Profits-Peer/kortex` (ElyCic).
> Die Entscheidungen unten sind getroffen — bau direkt weiter, frag nicht nach, was hier schon steht.

---

## Wo wir stehen (Version 2.6)

**Datenbank:** Migrationen bis **0126** eingespielt, jede mit Selbsttest und Rollback.
**Web:** `elycic.pages.dev`, ich darf selbst deployen (`npm run deploy:web`).
**Pipeline:** läuft alle 3 h (GitHub Actions). Kurse 2×/Tag, Übersetzungen 3×/Tag à 4 Karten.

### Seit dem letzten Handover gebaut
- **Lernen:** Prüfungsmodus (0110), Lernpfade (0112, 14 kuratierte Pfade), Lernpartner (0114),
  Klassen-Überblick im Gruppen-Stapel (0113), Themenwünsche mit Freigabe im Kontrollzentrum
  (0111/0120), Frage an die Community + beste Antwort (0115/0116), Monats-Abzeichen (0117),
  Jahresrückblick (0118), lokale Karten je Bundesland (0119), Audio-Modus `/hoeren`.
- **Karten-Übersetzung (0121/0122):** `pipeline/uebersetzen.py` übersetzt fertige Karten; Prüfung auf
  Struktur, Antwortreihenfolge und alle Zahlen. Feed und „Dazu passt“ filtern über `familie` —
  **niemand bekommt dieselbe Karte zweimal in zwei Sprachen.** Keine News, keine Kurslektionen.
- **Karten-Umbau (20.09.):** Leiste = Vorlesen, Like, Kommentar, Teilen, drei Punkte. Menü liegt
  IN der Karte (kein Modal, scrollbar, hält nichts an). Tippen hält an/weiter (`lib/kartenTakt.ts`),
  langer Druck auf „Hören“ startet den Audio-Modus, „Rechnen“ links unten.
- **Gesten (einschaltbar, Einstellungen › Dieses Gerät):** Kartenrückseite statt Menü, Ring bei
  langem Druck (Vorschlag einmalig nach 50 gelesenen Karten), Wischen nach links = andere
  Sprachfassung (0126 findet sie in beide Richtungen). Karte als Bild im Menü.
- **Rahmen:** sieben Ornamente (Ranke, Flechtband, Beschlag, Filigran, Krone, Siegel, Knoten) je
  Thema vergeben; Farbe frei wählbar mit PRO (0124), drei PRO-Rahmen Onyx/Aurum/Prisma, Farbe auch
  im öffentlichen Profil (0125).
- **PRO:** eigene Lernpfade (0123), Jahresrückblick als Bild, Gold-Kante am Monats-Abzeichen.
- **Englische Oberfläche:** ~650 Texte. **Muster:** `T('deutscher Satz')` aus `lib/sprache.ts`,
  Wörterbuch `locales/ui-en.json` (deutscher Text = Schlüssel), Datum über `lokale()`.
  **Jeder neue sichtbare Text gehört in T() und ins Wörterbuch.**

---

## Was als Nächstes ansteht

1. **Handy-Test durch den Nutzer** (nur er kann das): Menü, Ring, Wischen nach links, Rückseite,
   Audio-Modus bei gesperrtem Bildschirm. Beißt sich das Wischen mit dem Scrollen?
2. **Rest der Übersetzung:** LAB-Werkzeuge (`features/lab/rechnen.ts`, großer Block) und die Texte,
   die der Server schickt (Push-Nachrichten, Fehlermeldungen aus SQL).
3. **Offen beim Nutzer:** Notiz durch Markieren im Text (Idee 5), Menüpunkte per Ziehen umsortieren
   („höchstens“), Punkt 8 der Feature-Liste („Fertig für heute“).
4. **Vor dem Release:** Quiz-Antworten nicht mehr an den Client (Warteliste seit 14.09.),
   Test-Schalter „Neue Animationen“ an oder aus, Namen festlegen (ElyCic ist Platzhalter).
5. **Nur der Nutzer:** GitHub-Token für den Pipeline-Anstoß, PostHog- und Sentry-Schlüssel,
   RevenueCat für den echten PRO-Kauf.
6. **LAB 3.0** wird als eigener großer Eintrag in `lib/updates.ts` vermarktet, sobald es fertig ist.

---

## Regeln, die weiter gelten

- Kein Geheimnis ausgeben (pipeline/.env, Admin-PIN).
- Der Client schreibt nie XP, Mastery, Level, Streak oder PRO.
- Eine eingespielte Migration nie ändern — immer eine neue anlegen.
- SQL-Funktionen nur nach Lesen der **vollständigen** aktuellen Fassung neu schreiben
  (am 20.09. einmal verletzt und sofort aufgefallen: `meisterwege()` aus dem Gedächtnis).
- Knöpfe mit einem Wort beschriften. Commits auf Deutsch.
- Vor größeren Design-Änderungen erst reden.
- Teilen bleibt **sichtbar** auf der Karte und kommt nicht ins Menü (ausdrücklich entschieden).
