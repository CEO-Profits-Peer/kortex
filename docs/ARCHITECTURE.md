# Architektur & Entscheidungen

Arbeitstitel im Code: **kortex**. Ein Find-and-Replace, wenn der Name steht.
Alle Anzeigenamen liegen in `app/src/lib/brand.ts`, nirgendwo sonst.

---

## 1. Der Stack (Free-Tier-Start, wie entschieden)

| Schicht | Wahl | Free-Tier-Grenze | Wo es kippt |
|---|---|---|---|
| App | Expo (React Native) + TypeScript | — | — |
| Feed | `@shopify/flash-list` + `pagingEnabled` | — | *(nicht masonry-list — das ist für Pinterest-Grids)* |
| Gesten/Animation | `react-native-reanimated` + `react-native-gesture-handler` | — | — |
| Micro-Animation | `@rive-app/react-native` | Runtime kostenlos | Editor-Freeplan begrenzt |
| In-App-Browser | `expo-web-browser` | — | *(nicht inappbrowser-reborn — läuft nicht in Expo Go)* |
| DB / Auth / Storage | Supabase | 500 MB DB · 1 GB Storage · 5 GB Egress · Pause nach 7 Tagen Inaktivität | Storage zuerst (Audio) |
| Cron / Pipeline | **GitHub Actions** | ~2000 Min/Monat privat | ~ bei stündlich × 3 Min: passt |
| Media-CDN | **Cloudflare R2** | 10 GB · **kein Egress-Kosten** | weit weg |
| KI | Gemini Flash (Structured Output) + `text-embedding-004` | RPM/RPD-Limits | ab ~500 Cards/Tag |
| TTS | Google Cloud TTS (SSML `<mark>` → Timepoints) | großzügig, Billing-Konto nötig | — |
| Analytics + A/B | PostHog Cloud | 1 Mio Events/Monat | weit weg |
| Crashes | Sentry | 5k Events/Monat | — |
| Push | `expo-notifications` + Expo Push | kostenlos | — |
| Builds / OTA | EAS Build + EAS Update | begrenzte Build-Credits | — |

### Die zwei Korrekturen am ursprünglichen Plan

**Render/Vercel → GitHub Actions.** Render-Cron ist kostenpflichtig, Vercel-Hobby
erlaubt nur 1 Cron/Tag, hat 10 s Timeout und **verbietet kommerzielle Nutzung**
(Sponsor-Cards!). GitHub Actions ist ein kostenloser Scheduler mit 6 h Laufzeit
pro Job. Die Pipeline ist ein Batch-Job, kein Webserver — Actions ist exakt das
richtige Werkzeug und löst Cron, Timeout und Cold Start auf einmal.

**Supabase Storage → Cloudflare R2 für Media.** Siehe nächster Abschnitt.

---

## 2. „Mehrere Supabase-Konten als DB A, B, C?"

**Nein — und es ist auch nicht nötig.** Drei Gründe:

1. **Es löst das falsche Problem.** Eine Text-Card wiegt ~1,5 KB. 100.000 Cards
   ≈ 150 MB. Die 500-MB-Datenbank reicht jahrelang. Was tatsächlich knapp wird,
   ist **Storage (1 GB)** für Audio/Bilder und **Egress (5 GB)** — beides löst
   Cloudflare R2 (10 GB, kein Egress-Preis) für 0 €, ohne einen zweiten Account.
2. **Es kostet extrem viel Komplexität.** Keine Joins über Projekte hinweg, keine
   RLS über Projekte hinweg, Auth lebt in genau einem Projekt. `get_feed()` würde
   zu einem handgeschriebenen Federations-Layer. Das ist Wochen Arbeit für ein
   Problem, das wir nicht haben.
3. **Mehrere Gratis-Accounts zur Umgehung von Limits verstoßen gegen die AGB.**
   Ein Account-Ban wäre der teuerste denkbare Ausgang.

**Die legitime Aufteilung** — später, falls nötig, und nach *Funktion* statt
nach Shard: ein Projekt `app` (Auth + Nutzerdaten) und eins `content`
(Pipeline-Staging, unveröffentlichte Items), einseitig synchronisiert.
Erst ab echtem Bedarf. Bis dahin: **ein Projekt.**

---

## 3. Datenmodell — die vier Entscheidungen, die alles tragen

**`sources.license_class` ist ein Feld, kein Merkblatt.** Die Pipeline liest es
und darf bei `link_only` gar keine Zusammenfassung schreiben. Recht wird zu Code.
→ `docs/CONTENT-SOURCING.md`

**XP ist ein Kontobuch, kein Zähler.** `xp_ledger` hat eine Zeile pro Punkt,
mit Unique-Index gegen Doppelbuchung. `profiles.xp_total` ist für den Client
**nicht beschreibbar** (Spalten-Grant entzogen). Ohne das setzt sich jeder mit
dem Anon-Key per `curl` auf Platz 1.

**Zwei Währungen.** `xp_total` = Konsum + Aktivität (Level, Streak, privat).
`mastery_total` = **ausschließlich** aus richtig gelösten Aufgaben und
Wiederholungen. Das Leaderboard läuft nur über Mastery — sonst gewinnt, wer am
meisten scrollt, und wir hätten genau die App gebaut, gegen die wir antreten.

**Kategorien sind Hashtag und Skill-Knoten in einem.** `categories.slug` ist das
`#` im Search-Tab, `user_categories.level` ist der Fortschritt darin.
`kind='news'` ist bewusst *nicht* levelbar: News hat Tiefe, keine Schwierigkeit.

---

## 4. Der Search-Tab (die Idee aus Runde 2)

Ein Suchfeld, vier Ergebnistypen, eine RPC (`search_all`, trigram-basiert):

```
"zins"      →  #zinseszins  (Kategorie, Level 3/10, 240 Cards)
"@standard" →  @derstandard (Quelle, 82 Cards)
"@lena"     →  @lena_k      (Freund:in, Mastery 1.840)
"python"    →  Kurs "Python von Null" · 15 Lektionen
```

Eine Kategorie zu öffnen startet einen **gefilterten Feed** derselben Komponente
wie der Hauptfeed — nicht eine zweite Ansicht. Deine Level-Idee bekommt damit
eine echte Schleife: `#zinseszins` antippen → Cards schauen → Test → Level steigt
→ die nächsten Cards in `#zinseszins` sind schwerer (`difficulty_pref`).

**Tabs:** `Feed` · `Suche` · `Kurse` · `Profil`. Freunde/Leaderboard leben im
Profil-Tab statt als eigener Tab — vier Tabs sind das Maximum, das sich noch
aufgeräumt anfühlt, und Social ist nicht der tägliche Einstiegspunkt.

---

## 5. Ordnerstruktur

```
app/                        Expo-App
  src/
    features/
      onboarding/           Auth, Region, Geburtsjahr, Interessen, Einstufungstest
      feed/                 FlashList-Feed, Card-Renderer, Dwell-Tracking
      interactions/         Die 10 Templates, je eine Komponente
      quiz/                 Batch-Checkpoint + Spaced Repetition
      search/               @ / # / Kurse
      courses/
      profile/              Stats, Wissens-Radar, Achievements, Freunde, Leaderboard
    components/             Card, GridBackground, Badge, Sheet, HapticPressable
    lib/                    supabase.ts, eventBuffer.ts, brand.ts, config.ts
    theme/                  Blueprint-Tokens (Farben, Raster, Typo, Motion)

pipeline/                   Python, läuft in GitHub Actions
  sources/                  Ein Adapter pro Quelle, liest license_class
  transform/                Gemini: Synthese, Quiz, Interaktions-JSON
  validate/                 Zahlen-/Namens-Check, Zwei-Modell-Prüfung, Dedup
  publish/                  Upsert nach Supabase mit status='pending'

supabase/
  migrations/               0001 Tabellen · 0002 RLS · 0003 Funktionen
  seed/                     Templates, Config, Kategorien, Quellen
  functions/                Edge Functions (später: TTS-Job, Achievement-Check)

.github/workflows/          ingest.yml (stündlich), quality.yml, eas-build.yml
docs/
```

---

## 6. Konnektoren — was wirklich Arbeit spart

**Sofort einbauen:**
- **GitHub Actions** — der Scheduler. Ersetzt Render/Vercel-Cron komplett.
- **Supabase CLI** — Migrationen versioniert, `supabase db push` statt Klicken im Dashboard.
- **EAS Update (OTA)** — JS-Updates ohne Store-Review. Für einen Solo-Entwickler
  der Unterschied zwischen „Bugfix in 5 Minuten" und „in 3 Tagen".
- **PostHog** — Analytics *und* Feature Flags *und* A/B-Tests in einem. Deine
  Variance-Engine (Mode A/B/C-Gewichtung) fährt darauf, statt selbst gebaut zu werden.
- **Sentry** — sonst erfährst du von Abstürzen nur, wenn dir jemand schreibt.

**Bald:**
- **Cloudflare R2** — Media, sobald der erste Ton generiert wird.
- **Expo Push** — Streak-Reminder. Stärkster Retention-Hebel überhaupt.
- **Resend** — Transaktionsmails (Einladungen, Passwort).

**Wenn es Nutzer gibt:**
- **RevenueCat** — Pro-Abo, unter ~2.500 $/Monat Umsatz kostenlos.
- **Crowdin/Weblate** — Übersetzungen, sobald über DACH hinaus.

**In dieser Session verbunden, aber nicht autorisiert:** Notion, Figma, Canva,
Slack, HubSpot, Amplitude. Sinnvoll wären **Notion** (Redaktions-Board für die
`pending`-Warteschlange, statt eines eigenen Admin-UIs) und **Figma** (Design-
Tokens für das Blueprint-System). Beide brauchen eine OAuth-Freigabe, die in
dieser nicht-interaktiven Session nicht durchlaufen kann — das musst du in den
Connector-Einstellungen auf claude.ai bzw. per `/mcp` in einer interaktiven
Sitzung freigeben.

---

## 7. Roadmap

**v0.1 — MVP (4–6 Wochen).** Onboarding · Feed mit Text-Cards im Blueprint-Stil ·
Dwell-Tracking · Batch-Quiz · XP/Streak/Profil · Pipeline mit 8 `press_free`/`cc`-Quellen.
*Nicht drin:* TTS, Rive, Kurse, Freunde, Leaderboard, Sponsoren.

**v0.2.** Spaced Repetition · 3 Interaktions-Templates (`estimate_slider`,
`true_false_swipe`, `timeline_sort`) · Push-Reminder.

**v0.3.** Search-Tab · Kategorie-Level · restliche 7 Templates · Leaderboard (Mastery).

**v0.4.** Kurse · Einstufungstest · adaptive Schwierigkeit.

**v0.5.** Mode A (TTS + Word-Sync) · Rive-Micro-Animationen · Referral.

**v1.0.** Sponsor-Cards · Pro-Plan · Store-Launch.

**Testreihenfolge:** Expo Web nur für Inhalt und Quiz. Das *Gefühl* — und das
entscheidet laut deinem eigenen Fazit über alles — wird ausschließlich auf einem
Dev Build / APK auf einem **günstigen Android** validiert, nicht im Browser und
nicht auf dem besten Gerät im Raum.

---

## 8. Die ehrliche Version

Diese App kann auf zwei Arten enden: als Lernwerkzeug oder als eine weitere
Maschine, die Aufmerksamkeit in nichts verwandelt. Der Unterschied liegt nicht
in der Absicht, sondern in vier Designentscheidungen, die alle im Code stehen:

1. Das Leaderboard läuft über **Mastery**, nicht über Konsum.
2. Passives Lesen gibt 2 XP, eine richtige Wiederholung nach drei Tagen 15 XP
   plus 15 Mastery. Die App bezahlt für Behalten, nicht für Scrollen.
3. `enough_for_today_at: 60` — ab 60 Karten bietet die App aktiv das Aufhören an,
   mit dem, was hängengeblieben ist. Eine App, die selbst sagt „das reicht für
   heute", ist die einzige in diesem Feed-Format. Das ist gleichzeitig das
   ehrlichste und das am stärksten differenzierende Feature.
4. Kein Infinite Scroll ohne Haltepunkt: der Batch-Checkpoint alle 10 Karten ist
   strukturell eine Bremse, kein Zwischenbildschirm.

Wenn eine dieser vier Entscheidungen später „wegen Engagement" gekippt wird, ist
es eine andere App.
