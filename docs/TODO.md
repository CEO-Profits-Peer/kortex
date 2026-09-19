# To-do — Stand 19. September 2026

Aufgeräumt am 19.09.: Alles vom 9. September, was inzwischen erledigt ist,
ist unten abgehakt. Jeder offene Punkt wurde gegen Code oder Server geprüft,
nicht aus dem Gedächtnis übernommen. Die alte Fassung liegt in der
Git-Geschichte (`git log -- docs/TODO.md`).

Was als Nächstes GEBAUT wird, steht in `docs/NAECHSTER-CHAT.md`. Hier steht,
was sonst noch offen ist — vor allem das, was nur du tun kannst.

---

## 🔴 Nur du kannst das tun

| # | Was | Warum | Wie |
|---|---|---|---|
| 1 | **Auf einem echten Handy testen** | Bis heute nur im Browser geprüft. Wischen, Tempo und Ton fühlen sich auf dem Handy anders an. | `elycic.pages.dev` am Handy öffnen, „Zum Startbildschirm“ |
| 2 | **GitHub-Token für den Pipeline-Anstoß** | Der Worker meldet am 19.09. weiterhin `{"token":"fehlt"}`. GitHubs eigener Zeitplan lässt Läufe aus. | Token anlegen (Actions read/write, nur Repo kortex), dann `npx wrangler secret put GITHUB_TOKEN --config workers/ingest-anstoss/wrangler.toml`. Danach sagst du mir Bescheid, ich prüfe und entferne dann die `schedule`-Zeile. |
| 3 | **PostHog (Region EU)** | Der Schlüssel in `app/.env` ist leer. Ohne ihn siehst du nicht, wo Leute abspringen. | posthog.com → EU → Project API Key nach `EXPO_PUBLIC_POSTHOG_KEY` |
| 4 | **Sentry** | Der DSN in `app/.env` ist leer. Testnutzer melden Abstürze nicht, sie hören einfach auf. | sentry.io → Projekt React Native → DSN nach `EXPO_PUBLIC_SENTRY_DSN` |
| 5 | **SMTP prüfen** | Ist „Custom SMTP“ an, aber leer, geht KEINE Anmelde-Mail raus. | `docs/SMTP.md` ausfüllen oder den Schalter aus |
| 6 | **Push im echten Browser bestätigen** | Automatische Browser verweigern die Erlaubnis, daher nie echt gesehen. | Glocke an, Benachrichtigung erlauben, jemand liked einen Beitrag |

## 🟡 Später anlegen, erst wenn es gebraucht wird

- **RevenueCat**: für den echten PRO-Kauf. Bis dahin gibt es PRO nur über Codes.
- **Google Play** (25 € einmalig) und **Apple Developer** (99 €/Jahr): erst,
  wenn die App in die Stores soll. Bei Apple vorher klären, ob eigene
  Einlöse-Codes erlaubt sind (Regel 3.1.1).
- **Cloudflare R2**: nur, falls Bilder oder Ton selbst gehostet werden.
- **Google Cloud TTS**: nein. Entschieden am 18.09.: nur Browser-Stimmen und
  Tempo, keine Abrechnung.

## 🟢 Ich baue (nach der Reihenfolge in NAECHSTER-CHAT)

1. **Meisterwege**: Stufen je Hauptthema aus der Mastery, Rahmen, Namensfarben, dunkle Profilbild-Farben
2. **PRO-Optik wählbar**: Gold-Dreiecke-Muster, Gold-Stein
3. **PRO-Features**: Streak-Schutz, Export (CSV/Anki), LAB-Szenarien, Profil-Themes, Planen, Statistik, Ligen
4. **LAB**: die drei Daten-Werkzeuge Inflation, Brutto → Netto, Wege & CO₂. Nur mit amtlichen, zitierten Tabellen.

## ⚪ Offen, aber ohne Termin

- **Namen ändern** (18.09.). `ElyCic` ist seit Anfang ein Platzhalter. Er
  steht in `app/src/lib/brand.ts`, `app.json`, im Web-Titel, in Texten und
  in `elycic.pages.dev`. Vorsicht beim Umbenennen:
  - Die Speicher-Schlüssel `elycic.*` im Browser (Design, Muster, Linse,
    PRO-Willkommen) NICHT umbenennen, sonst verlieren alle ihre Einstellungen.
  - Die Pages-Adresse und der Worker `elycic-ingest-anstoss` sind eigene
    Umzüge mit Weiterleitung, nicht nur ein Textersatz.
  - Erst den neuen Namen prüfen (Marke, Domain, App-Store), dann umbauen.
- **Quiz-Antworten nicht mehr an den Client schicken**: Die Feed-Funktionen
  liefern `correct_index` mit. Laut deiner Entscheidung vom 14.09. steht das
  auf der Warteliste. Es muss erledigt sein, bevor Rangliste und Duelle ernsthaft
  beworben werden.
- **Quizfrage direkt an jeder Karte**: aufgeschoben, du überlegst noch.
- **`hotspot_reveal`**: die letzte Kartenart. Sie braucht echte Diagramm-Dateien
  und damit einen Grafik-Ablauf. Bis dahin zeigt die Karte nur ihren Text.
- **Mehrere Quellen auf einer Karte**: Doppelte Meldungen erkennt die Pipeline
  schon über Embeddings. Ob die zweite Quelle dann als Abzeichen an der ersten
  Karte erscheint, statt verworfen zu werden, ist noch zu prüfen.
- **Stil**:
  - hochzählende Zahlen (XP, Statistik)
  - Rive-Animationen (Level-Up, Streak-Flamme)
  - zwei bis drei Karten-Layouts je Inhaltstyp
  - Übergänge zwischen Bildschirmen (bisher nur Überblenden)
- **Demo-Karten löschen**, sobald die Pipeline genug liefert:
  `delete from public.content_items where media->>'demo' = 'true';`
- **LAB-Baukasten im Kontrollzentrum**: später, so am 14.09. entschieden.
- **Übersetzung ins Englische**: erst nach dem Feinschliff.

---

## ✅ Erledigt seit dem 9. September (Auswahl)

- Migrationen 0001–0093 eingespielt, Seeds drin, anonyme Anmeldung an
- GitHub-Repo `CEO-Profits-Peer/kortex` mit laufender Geschichte
- Pipeline läuft automatisch: Nachrichten, Wikipedia-Evergreens, Kurse, Specials (~50 %)
- Push-Benachrichtigungen (Edge Function), Glocke, Erwähnungen
- Freunde einladen (0071), Duelle (0069/0072), Home, Beiträge, Explore, Statistik
- Studio mit Erstellen / Lernen, Umfrage, Quiz, Stapel, 7 LAB-Werkzeuge
- Animierte Karten (kinetic) mit zehn Bildarten
- E-Mail zum anonymen Konto sichern (Konto-Seite)
- Design 2.0, neues App-Icon, Waben-Profilbilder
- PRO: Status, Codes, Grenzen, Anpinnen, Profilbild-Stile, Abzeichen,
  Quiz bis 5, Willkommens-Animation
