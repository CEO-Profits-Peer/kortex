# To-do — Stand 9. September 2026

Alles, was noch offen ist, in einer Liste. Abhaken von oben nach unten.

> **Achtung:** Teil A bis D unten sind vom 9. September und großteils überholt
> (Migrationen, Seeds, Anmeldung, GitHub sind längst erledigt). Aktuell ist
> der Abschnitt „Für später“ direkt hier und `docs/NAECHSTER-CHAT.md`.

## 📌 Für später (vom Nutzer gemerkt)

- **Namen ändern** (18.09.) — `ElyCic` ist seit Anfang ein Platzhalter.
  Er steht in `app/src/lib/brand.ts`, `app.json`, im Titel der Web-App, in
  Texten und in der Adresse `elycic.pages.dev`. Vorsicht beim Umbenennen:
  - Die Speicher-Schlüssel `elycic.*` im Browser (Design, Muster, Linse,
    PRO-Willkommen) NICHT umbenennen, sonst verlieren alle ihre Einstellungen.
  - Die Pages-Adresse und der Worker `elycic-ingest-anstoss` sind eigene
    Umzüge mit Weiterleitung, nicht nur ein Textersatz.
  - Erst den neuen Namen prüfen (Marke, Domain, App-Store) — dann umbauen.

---

## ✅ Erledigt (von mir, du musst nichts tun)

- Datenbankschema, RLS, Rechte, komplette Spiel-Logik — 7 Migrationen
- App-Gerüst: Login → Onboarding → Feed → Batch-Checkpoint mit Quiz → Profil
- Blueprint-Designsystem, eigene Tab-Leiste, Wissens-Radar
- Zweisprachig (de/en) angelegt
- 18 Demo-Karten, damit der Feed nicht leer ist
- TypeScript kompiliert fehlerfrei, Web-Bundle baut durch
- `node_modules` installiert

---

## 🔲 Teil A · Damit der Prototyp läuft (~15 Min)

### A1 — Migrationen pushen ⚠️ **neu bis 0019**

```
npx supabase@latest db push
```

Bei Fehler: Meldung hierher kopieren.

### A2 — Seeds einspielen

Dashboard → **SQL Editor** → *New query*, drei Dateien nacheinander:

| # | Datei | Inhalt |
|---|---|---|
| 1 | `supabase/seed/0001_interaction_templates.sql` | 10 Interaktions-Templates |
| 2 | `supabase/seed/0002_config_and_categories.sql` | Config, 34 Kategorien, 30 Quellen |
| 3 | `supabase/seed/0003_demo_content.sql` | 18 Demo-Karten |
| 4 | `supabase/seed/0004_demo_interactive.sql` | 6 interaktive Karten |
| 5 | `supabase/seed/0005_demo_course.sql` | Demo-Kurs mit 5 Lektionen |
| 6 | `supabase/seed/0006_demo_templates.sql` | 7 Karten, je eine pro neuem Template |

> Reihenfolge beachten: **erst `db:push`** (Migration 0009 repariert den
> Index auf `content_hash`), **dann** Seed 3. Andersherum kommt der Fehler
> "no unique or exclusion constraint matching the ON CONFLICT specification".

Kontrolle:

```sql
select (select count(*) from public.categories)            as kategorien,
       (select count(*) from public.sources)               as quellen,
       (select count(*) from public.interaction_templates) as templates,
       (select count(*) from public.app_config)            as config,
       (select count(*) from public.content_items)         as karten;
```

Erwartet: **34 · 30 · 10 · 7 · 36** (plus 1 Kurs)

### A3 — Anonyme Anmeldung aktivieren

Dashboard → **Authentication** → **Sign In / Providers** → **Anonymous Sign-Ins** einschalten.

Ohne das kommst du nicht am Startbildschirm vorbei.

### A4 — Anon Key eintragen

Dashboard → **Project Settings** → **API Keys** → den **öffentlichen** Key
(`publishable` bzw. `anon`) nach `app/.env`.

### A5 — Starten

Ab jetzt aus dem **Wurzelverzeichnis** (nicht mehr `cd app`):

```
npm start
```

Dann im Terminal:
- **`w`** → Browser auf `http://localhost:8081`
- **QR-Code scannen** → Expo Go am Handy (gleiches WLAN)
- **`a`** → direkt auf angeschlossenem Android-Gerät

Weitere Wurzel-Skripte: `npm run web` · `npm run android` · `npm run tunnel`
(falls WLAN blockt) · `npm run typecheck` · `npm run db:push` · `npm run pipeline`

Erwarteter Ablauf: Wortmarke → *Los geht's* → Onboarding (Region, Geburtsjahr,
Interessen) → Feed. Nach 10 gelesenen Karten hält der Feed an und bietet das
Quiz an.

---

## 🔲 Teil B · `.env` — was noch fehlt

### `app/.env` — landet im App-Bundle, also **nicht geheim**

| Variable | Status | Woher |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | ✅ eingetragen | — |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | ✅ eingetragen | — |
| `EXPO_PUBLIC_POSTHOG_KEY` | 🔲 optional | siehe C2 |
| `EXPO_PUBLIC_POSTHOG_HOST` | ✅ eingetragen | — |
| `EXPO_PUBLIC_SENTRY_DSN` | 🔲 optional | siehe C3 |
| `EXPO_PUBLIC_ENV` | ✅ `dev` | — |

### `pipeline/.env` — **echte Geheimnisse**, nie ins Repo, nie in die App

| Variable | Status | Woher |
|---|---|---|
| `SUPABASE_URL` | ✅ eingetragen | — |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔲 erst für die Pipeline | Project Settings → API Keys → **secret / service_role** |
| `GEMINI_API_KEY` | ✅ eingetragen | — |
| `GEMINI_MODEL` | ✅ | — |
| `MAX_ITEMS_PER_RUN` etc. | ✅ | Sicherheitsnetz gegen durchgedrehte Jobs |
| TTS / R2 | 🔲 erst v0.5 | — |

**Merksatz:** Alles in `app/.env` ist öffentlich, sobald jemand die APK
entpackt. Es gibt keine geheimen Werte in einer Client-App — nur solche, die
geheim aussehen.

---

## 🔲 Teil C · Accounts

### C1 — Expo · **jetzt** · 2 Min

1. [expo.dev](https://expo.dev) → *Sign Up*
2. Terminal: `npx expo login`

Wozu: Expo baut in der Cloud aus deinem Code eine echte `.apk` — du brauchst
kein Android Studio. Und später Updates ausrollen, ohne auf den Store-Review
zu warten.

### C2 — PostHog · **vor dem ersten Test mit Mitschülern** · 3 Min

1. [posthog.com](https://posthog.com) → *Get started free*
2. **Region „EU" wählen**, nicht US — deine Nutzer sind Minderjährige in der EU
3. *Project API Key* kopieren → `app/.env`

Wozu: zeigt dir, wo Leute abspringen. Ohne diese Daten kannst du den
Feed-Algorithmus nicht abstimmen, du würdest raten. Kann außerdem A/B-Tests —
damit müssen wir die Varianz-Engine für die Reel-Modi nicht selbst bauen.

### C3 — Sentry · **vor dem ersten Test** · 3 Min

1. [sentry.io](https://sentry.io) → *Sign up*
2. Neues Projekt → Plattform **React Native**
3. **DSN** kopieren → `app/.env`

Wozu: schickt dir Abstürze mit Stacktrace. Testnutzer melden Fehler fast nie —
sie hören einfach auf.

### C4 — Google AI Studio · ✅ **erledigt**

Key liegt in `pipeline/.env`. Wird benutzt, sobald die Pipeline gebaut ist.

### C5 — GitHub · Repo existiert, aber noch kein Commit

Remote ist gesetzt (`CEO-Profits-Peer/kortex`). Sag Bescheid, dann committe ich.

### Noch **nicht** anlegen

Cloudflare R2 · Google Cloud TTS · RevenueCat · Apple Developer (99 €/Jahr) ·
Google Play (25 € einmalig). Alle erst, wenn der jeweilige Teil dran ist.

### Mit mir verknüpfen

Nichts davon musst du mit mir verbinden — ich brauche keine deiner Keys. Ich
schreibe nur den Code, der sie ausliest.

Zwei Ausnahmen, die dir **Arbeit sparen** könnten, wenn du sie freischaltest
(claude.ai → Connector-Einstellungen; in dieser Sitzung kann ich den
Login-Vorgang nicht starten):

- **Notion** — Redaktions-Board für die `pending`-Warteschlange der Pipeline.
  Dann brauchen wir kein eigenes Admin-Interface.
- **Figma** — Design-Tokens für das Blueprint-System.

---

## 🔲 Teil E · Pipeline in Betrieb nehmen

Der Code steht und ist geprüft. Es fehlt genau ein Schlüssel.

### E0 — Feeds prüfen (braucht keine Schlüssel)

```
python pipeline/check_feeds.py
```

Muss **18 von 18** melden. Falls eine Quelle stirbt, sagt das Skript direkt,
welches SQL sie abschaltet. Lauf das alle paar Wochen — Pressestellen bauen
ihre Seiten um, ohne jemanden zu fragen.

### E1 — `SUPABASE_SERVICE_ROLE_KEY` eintragen

Dashboard → **Project Settings** → **API Keys** → der **secret / service_role**
Key nach `pipeline/.env`. Der umgeht jede RLS-Regel — nur hier, nie in der App.

### E2 — Python-Abhängigkeiten

```
pip install -r pipeline/requirements.txt
```

### E3 — Trockenlauf, schreibt nichts

```
npm run pipeline:dry
```

Zeigt pro Artikel: angenommen oder abgelehnt, mit Grund („Zahl steht nicht im
Quelltext", „Antwort nicht aus der Karte ableitbar").

### E4 — Echter Lauf

```
npm run pipeline
```

Karten landen auf `status = 'pending'`. Ansehen und freigeben:

```sql
select title, primary_category_id, language, created_at
  from public.content_items where status = 'pending'
 order by created_at desc;
```

```sql
update public.content_items set status = 'approved' where status = 'pending';
```

**Die 36 Demo-Karten bleiben unberührt** — die Pipeline fügt hinzu, ersetzt
nichts. Wenn du sie später doch loswerden willst:
`delete from public.content_items where media->>'demo' = 'true';`

### E5 — Automatisieren, kostenlos

Repo → **Settings** → **Secrets and variables** → **Actions** → drei Secrets:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`.

Danach läuft `.github/workflows/ingest.yml` alle 6 Stunden von selbst.

---

## 🔲 Teil D · Was ich als Nächstes baue

Alle vier Tabs sind jetzt echt — keine Platzhalter mehr.

1. **`hotspot_reveal`** — das letzte fehlende Template. Braucht als einziges
   echte Diagramm-Dateien und damit einen Grafik-Arbeitsablauf.
2. **Freunde einladen** — die Rangliste hat den Freunde-Filter schon, es
   fehlt das Hinzufügen.
3. **`kinetic`-Modus** — animierte Typografie, „Video-Gefühl" ohne Video
   (siehe [MEDIA.md](MEDIA.md)).
4. **Dedup über Embeddings** — dieselbe Meldung von fünf Agenturen zu einer
   Karte mit fünf Quellen-Badges.
5. **Push-Erinnerungen** — die Einstellung dafür steht schon, das Verschicken
   fehlt.
6. **E-Mail zum anonymen Konto** — damit Fortschritt einen Geräteverlust
   überlebt.

---

## 🔍 Prüf-Durchgang vom 9. September

**Real getestet** (Werkzeug, nicht Augenmaß):

| Prüfung | Ergebnis |
|---|---|
| TypeScript, 40 Dateien | ✅ fehlerfrei |
| Web-Bundle | ✅ baut durch, alle Screens nachweislich enthalten |
| RLS auf allen 20 Tabellen | ✅ lückenlos |
| `SECURITY DEFINER` ohne festen `search_path` | ✅ nur `search_all`, bewusst (per ALTER aus dem Katalog gesetzt) |
| Level-Kurve vs. ihre Umkehrung | ✅ stimmt an jeder Grenze exakt (Level 1–7 durchgerechnet) |
| Feed-Abruf + Textextraktion gegen NASA-Feed | ✅ 2 Artikel, sauberer Text |
| Halluzinations-Validator, 5 Fälle | ✅ saubere Karte durch, 4 Manipulationen abgelehnt |

**Nicht getestet:** Das SQL ist nie gegen eine laufende Datenbank gelaufen —
dafür bräuchte ich deinen service_role Key. Und auf einem echten Gerät hat
nichts davon je gestartet.

**Dabei gefunden und behoben** (alle in `0013_hardening_settings.sql`):

1. **XP-Lücke in `submit_quiz`.** Ein Client konnte beliebige Karten-IDs
   durchprobieren, ohne die Karte je gesehen zu haben: erster Versuch liefert
   die richtige Antwort zurück, zweiter kassiert sie. 25 XP + 10 Mastery pro
   Karte, ohne zu lesen. Jetzt Pflicht: `is_read_validated`.
2. **Zwei Lücken in `claim_batch_bonus`.** Der Client *behauptete*, ob alles
   richtig war — das ließ sich einfach mitsenden. Und mit einer einzigen
   gelesenen Karte war die Bedingung erfüllt, bei pro ID unterschiedlichem
   Dedupe-Schlüssel: 50 XP beliebig oft. Jetzt Mindestgröße aus `app_config`
   und „alles richtig" wird aus `user_content_state` hergeleitet.
3. **`get_category_detail` gab NULL** bei unbekannter Kategorie — die App
   wartete dann endlos auf einen Ladebalken. Jetzt klare Fehlermeldung.

Beide XP-Lücken hätten das Leaderboard wertlos gemacht, sobald ein einziger
Mitschüler die Netzwerk-Anfragen anschaut.

---

## 🎨 Stand beim Stil (ehrlich)

**Jetzt drin:** Eigene Schriften (Space Grotesk + JetBrains Mono) ·
scrollgekoppelte Parallaxe in drei Ebenen · Druck-Physik auf allen Knöpfen ·
gestaffeltes Einblenden von Titel/Deck/Blöcken · eigenes Piktogramm-Set
(25 Symbole, ein Raster, eine Strichstärke) · Doppeltipp-Like mit Raute ·
„Bewegung reduzieren" schaltet alles davon wirklich ab.

**Fehlt noch, damit es nicht mehr nach Baukasten aussieht:**

| | Wirkung |
|---|---|
| **App-Icon** | Platzhalter drin (Raster-Marke). Dein Logo nach `app/assets/brand/logo.png`, dann `npm run icons`. |
| **Bildschirm-Übergänge** | Screens erscheinen hart. Geteilte Elemente und Slide-Übergänge machen mehr aus als jede Karten-Animation. |
| **Layout-Abwechslung** | Jede Karte hat dieselbe Anordnung. Zwei bis drei Varianten je nach Inhaltstyp brechen die Monotonie. |
| **Zahlen-Animation** | Zahlen springen. Hochzählen ist ein Detail, das man nicht bemerkt — bis es fehlt. |
| **Rive-Micro-Animationen** | Level-Up, Streak-Flamme, das lebende Logo. |

---

## ⚠️ Was noch nicht gut ist

- **Auf keinem echten Gerät gelaufen.** Getestet ist nur: TypeScript
  kompiliert, Web-Bundle baut. Wie es sich anfühlt, weiß erst du.
- Die 24 Demo-Karten sind von Hand geschrieben, keine Pipeline-Ausgabe.
  Raus damit, sobald echte kommen:
  `delete from public.content_items where media->>'demo' = 'true';`
- Der Name `ElyCic` ist Platzhalter — steht in `app/src/lib/brand.ts` und
  `app.json`. `Grid` ist als *Einheit* gesetzt („40 Grids gelesen").
- Beurteile das Gefühl **nur auf dem Handy**. Im Browser wischt es sich
  deutlich schlechter, und aus Kanada kommt die Latenz nach Frankfurt dazu.
