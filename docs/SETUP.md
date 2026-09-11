# Setup — Schritt für Schritt

Reihenfolge einhalten. Schritt 1 ist der einzige, der sich später nicht mehr
korrigieren lässt.

---

## Schritt 1 · Supabase-Projekt anlegen

Auf dem offenen Formular genau diese vier Dinge:

| Feld | Wert | Warum |
|---|---|---|
| **Region** | **Central EU (Frankfurt)** — nicht Americas | **Nicht änderbar.** Latenz Wien→Frankfurt ~20 ms, Wien→Virginia ~110 ms. Das ist bei einem Swipe-Feed spürbar. Und: personenbezogene Daten von Minderjährigen gehören in die EU. |
| **Enable Data API** | ✅ **an lassen** | `supabase-js` spricht darüber. Ohne das geht nichts. |
| **Automatically expose new tables** | ❌ **ausschalten** | Supabase empfiehlt das selbst. Neue Tabellen sind dann standardmäßig unsichtbar. `0004_grants.sql` gibt gezielt frei, was freigegeben gehört. Vergessener Grant = 404. Vergessener Revoke wäre ein Datenleck. |
| **Enable automatic RLS** | ✅ **einschalten** | Sicherheitsnetz. Die Migrationen aktivieren RLS ohnehin überall — aber eine Tabelle, die du später schnell im Dashboard anlegst, ist damit nicht versehentlich öffentlich. |

**Projektname:** `kortex-prod` (oder dein finaler Name).

**Datenbank-Passwort:** in deinen Passwort-Manager kopieren, bevor du auf
*Create* klickst. Es wird danach nicht mehr angezeigt. Nicht in eine Datei im
Projektordner schreiben.

Dann *Create new project* und ~2 Minuten warten.

---

## Schritt 2 · Zugangsdaten notieren

Dashboard → **Project Settings → API**. Drei Werte:

| Wert | Wohin | Geheim? |
|---|---|---|
| **Project URL** (`https://xxxx.supabase.co`) | `.env` | nein |
| **anon / publishable key** | `.env` | nein — der gehört in die App, RLS schützt dahinter |
| **service_role key** | **nur** GitHub Actions Secret | **JA.** Umgeht jede RLS. Niemals in die App, niemals ins Repo, niemals in eine Chat-Nachricht. |
| **Project Ref** (`xxxx` aus der URL) | für `supabase link` | nein |

---

## Schritt 3 · Repo aufsetzen

```powershell
cd "C:\Users\Admin1\Documents\Privat\CODING\Project TikTok lernApp"; git init; git branch -M main
```

Dann auf github.com ein **privates** Repo `kortex` anlegen und verbinden:

```powershell
git remote add origin https://github.com/<dein-user>/kortex.git
```

`.gitignore` und `.env.example` lege ich an — sag einfach Bescheid.

---

## Schritt 4 · Migrationen einspielen

Supabase CLI wird **nicht** global via npm installiert (offiziell nicht
unterstützt). `npx` reicht:

```powershell
npx supabase@latest login
```

```powershell
npx supabase@latest link --project-ref <dein-project-ref>
```

```powershell
npx supabase@latest db push
```

Das spielt `0001` bis `0005` in Reihenfolge ein. Wenn dabei ein Fehler kommt:
Meldung hierher kopieren, ich korrigiere die Migration. Beim ersten Durchlauf
gegen eine echte Instanz ist ein Syntaxfehler normal.

---

## Schritt 5 · Seeds einspielen

Kein `psql` nötig. Dashboard → **SQL Editor** → *New query*, und nacheinander
den Inhalt dieser zwei Dateien einfügen und ausführen:

1. `supabase/seed/0001_interaction_templates.sql`
2. `supabase/seed/0002_config_and_categories.sql`

Danach zur Kontrolle im SQL Editor:

```sql
select (select count(*) from public.categories)            as kategorien,
       (select count(*) from public.sources)               as quellen,
       (select count(*) from public.interaction_templates) as templates,
       (select count(*) from public.app_config)            as config;
```

Erwartet: **34 · 30 · 10 · 7**

---

## Schritt 5b · `.env` ausfüllen

Es gibt **zwei** `.env`-Dateien, und die Trennung ist wichtig:

| Datei | Inhalt | Geheim? |
|---|---|---|
| `app/.env` | nur `EXPO_PUBLIC_*` — Supabase-URL, **anon key**, PostHog, Sentry | **Nein.** Alles darin landet im App-Bundle und ist im Klartext lesbar, sobald jemand die APK entpackt. Der anon key ist absichtlich öffentlich; geschützt wird die Zeile dahinter durch RLS. |
| `pipeline/.env` | **service_role key**, Gemini-Key, später TTS/R2 | **Ja.** Der service_role key umgeht jede RLS-Regel. Nur auf deinem Rechner und in GitHub Actions. |

Beide sind bereits angelegt (aus `.env.example` kopiert) und stehen in
`.gitignore`. Du musst nur die leeren Werte eintragen.

**Faustregel:** Wenn ein Wert in `app/.env` steht, betrachte ihn als
veröffentlicht. Es gibt keine geheimen Werte in einer Client-App — nur solche,
die geheim aussehen.

---

## Schritt 6 · Accounts, die du JETZT anlegen sollst

| Dienst | Wofür | Aufwand |
|---|---|---|
| **GitHub** | Repo + kostenloser Cron für die Pipeline | hast du wohl schon |
| **Google AI Studio** | Gemini API Key (Structured Output + Embeddings) | 2 Min |
| **Expo** | EAS Build + OTA-Updates + Push | 2 Min |
| **PostHog** (EU-Region wählen!) | Analytics, Feature Flags, A/B | 3 Min |
| **Sentry** | Crash-Reports | 3 Min |

## Accounts, die du JETZT NICHT anlegen sollst

| Dienst | Warum warten |
|---|---|
| Cloudflare R2 | erst wenn die erste Audiodatei entsteht (v0.5) |
| Google Cloud TTS | dito — braucht Billing-Konto |
| RevenueCat | erst wenn es einen Pro-Plan gibt |
| Apple Developer (99 €/Jahr) | erst wenn Android-Nutzer die App täglich benutzen |
| Google Play (25 € einmalig) | erst kurz vor dem echten Launch |

---

## Schritt 7 · Vercel

**Für die App brauchst du Vercel nicht.** Die Datenbank ist Supabase, die
Pipeline läuft in GitHub Actions, die App läuft auf dem Handy.

Zwei Warnungen zu dem Screenshot:

- **Die „Store"-Optionen (Postgres/KV/Blob) nicht anfassen.** Eine zweite
  Datenbank neben Supabase ist genau die Komplexität, die Solo-Projekte tötet.
- **Vercel Hobby erlaubt keine kommerzielle Nutzung.** Solange die App gratis
  ist, ist eine Landing Page dort okay. Sobald ein Sponsor zahlt oder ein
  Pro-Abo läuft, ist es ein AGB-Verstoß.

Für Landing Page + Impressum/Datenschutz + Referral-Links später:
**Cloudflare Pages** — kostenlos, keine Kommerz-Klausel, gleiches Ökosystem
wie R2. Das braucht aber erst v0.3.

---

## Schritt 8 · Und dann?

Sag mir, dass Schritt 5 durchgelaufen ist. Dann baue ich:

1. `.gitignore`, `.env.example`, TypeScript-Typen aus dem Schema generiert
2. Expo-App: Blueprint-Theme-Tokens, i18n-Setup (`de` + `en` ab Zeile 1)
3. Feed-Shell mit FlashList, Event-Buffer, `get_feed()` angebunden
4. Erste echte Card auf deinem Handy
