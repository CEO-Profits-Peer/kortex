# kortex *(Arbeitstitel)*

Kurzform-Wissens- und News-App. Vertikaler Feed wie TikTok, aber was hängen
bleibt, wird drei Tage später noch einmal abgefragt.

## Was hier schon steht

```
docs/ARCHITECTURE.md      Stack, Entscheidungen, Ordner, Konnektoren, Roadmap
docs/CONTENT-SOURCING.md  Welche Quelle was darf - und warum Quellen zeigen ein Feature ist
supabase/migrations/      Vollständiges Schema (0001), RLS (0002), Spiel-Logik (0003)
supabase/seed/            10 Interaktions-Templates, Config, 33 Kategorien, 22 Quellen
```

## Setup

```bash
npm i -g supabase
supabase login
supabase link --project-ref <ref>
supabase db push
```

Danach die Seeds einspielen (Reihenfolge zählt):

```bash
psql "$SUPABASE_DB_URL" -f supabase/seed/0001_interaction_templates.sql -f supabase/seed/0002_config_and_categories.sql
```

## Die vier Regeln, die nicht verhandelbar sind

1. **Der Client schreibt keine Zustände.** XP, Mastery, Level und Streak entstehen
   ausschließlich in `SECURITY DEFINER`-Funktionen. Die Spalten-Grants in
   `0002_rls.sql` sind kein Detail — ohne sie ist das Leaderboard wertlos.
2. **`license_class` entscheidet, was gespeichert werden darf.** Eine
   `link_only`-Quelle mit gefülltem `body_blocks` ist ein Bug.
3. **Quiz-Antworten werden serverseitig geprüft.** Der Client bekommt
   `correct_index` erst *nach* dem Absenden zurück.
4. **Das Leaderboard läuft über `mastery_total`, nie über `xp_total`.**

## Nächster Schritt

Expo-App aufsetzen: Theme-Tokens (Blueprint), Feed-Shell mit FlashList,
Event-Buffer, `get_feed()` anbinden.
