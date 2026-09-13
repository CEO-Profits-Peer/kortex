# Handoff prompt for a fresh session

Copy everything below the line into a new chat.

---

I'm building **ElyCic**, a TikTok-style short-form learning app. You are the
implementing engineer. Read this, then confirm you've understood before
starting the task at the bottom.

## What it is

A vertical swipe feed of short knowledge cards instead of entertainment
clips. Each card is one idea — a fact, a mechanism, a number that changes how
you see something — plus a quiz question. Swipe up, next card. Spaced
repetition brings cards back after three days.

**Audience:** teenagers and young adults, German-speaking (Austria focus) and
English-speaking (Canada focus). Both languages are first-class, not
translations of each other: the German side covers AMS, Mietrecht,
Pflichtschule; the English side covers TFSA, RRSP, provinces.

**Vision:** the feed people open instead of TikTok when they want to feel
like they got something out of the ten minutes. That means it has to be
genuinely entertaining first and educational second — not a textbook with
swipe gestures. It also has to be *trustworthy*: every card traces to a real
source document, and nothing is generated from model memory.

## Tech

- **App** — Expo SDK 57, React 19, React Native 0.86, TypeScript,
  expo-router. Ships as a PWA to Cloudflare Pages (`elycic.pages.dev`).
  Native build exists but web is the live target.
- **Backend** — Supabase (Postgres + RLS + SECURITY DEFINER RPCs + Storage +
  Auth + Edge Functions). 69 migrations, 0065-0069 still to be applied.
- **Pipeline** — Python. Pulls RSS feeds and Wikipedia articles, asks Gemini
  for a card with structured output, validates deterministically, writes to
  Supabase. Runs in GitHub Actions every 3 hours.

## Layout

```
app/src/
  app/            expo-router routes
  features/       auth comments courses daily feed interactions kinetic
                  onboarding profile quiz review search settings social
  components/     ContentCard, Avatar, CardBlock, FitBox, …
  lib/            supabase.ts (all API calls), push.ts, avatarDesign.ts,
                  contentState.ts, eventBuffer.ts
pipeline/
  run.py          news ingestion
  evergreen.py    Wikipedia → evergreen cards
  push.py         notification fallback sender
  topics.py       292 curated Wikipedia topics (123 de / 169 en)
  check_topics.py validates the topic list without any model call
  sources/        feeds.py, wikipedia.py
  transform/      generate.py (cards), kinetic.py (animated "specials")
  validate/       checks.py, relevance.py, overclaim.py
supabase/
  migrations/     0001–0069, each with a long header explaining WHY
  functions/push/ Edge Function, delivers notifications in ~3 s
docs/             ARCHITECTURE, CONTENT-SOURCING, SETUP, DEPLOY, SMTP,
                  GOOGLE-LOGIN, PRODUKT-IDEEN
```

**The migration headers are the real documentation.** Most of them explain a
bug and why the obvious fix was wrong. Read the relevant one before touching
an area.

## Card types

- **news** — from RSS. Ages in ranking but never expires; older than 14 days
  the app labels it "NICHT AKTUELL" with the date.
- **knowledge** — evergreen. No decay, no expiry.
- **interactive** — quiz/task cards, marked with a coloured frame.
- **specials / kinetic** — animated, narrated cards built from a beat script
  (`kinetic_script`). These are the best thing in the feed. Seven picture
  kinds: `statement`, `table`, `bars`, `timeline`, `quantity`, `steps`,
  `compare`, `scale`, `guess`, `figure` — see migration 0027 (format), 0058
  and 0061 (the six later ones).
  A special loops: after the last beat it pauses a second and starts over.

## Current state

| | |
|---|---|
| Approved cards | 229 (119 de / 110 en) |
| Specials (kinetic) | 114 = **50 %** (de 55/119 = 46 %, en 59/110 = 54 %) |
| Leaf categories with no card | 10 of 45 (was 20 before the scarcity ordering) |
| Evergreen topics | 382, all lemmas API-verified; ~280 never attempted |
| Active sources | 31 with a feed, 21 of them full-text |
| Categories | 53 (8 top-level) |

Measure it, don't trust this table — it ages with every scheduled run:
`db.presentation_counts()` for the share, `db.card_counts()` for the
per-category/per-language distribution.

## Hard rules

1. **Never print or echo any secret.** `pipeline/.env` holds
   `SUPABASE_SERVICE_ROLE_KEY`, five `GEMINI_API_KEY*` and `VAPID_PRIVATE_KEY`.
   Read them in code, never display them, never put them in a migration or
   commit. `app/.env` is public — it ships in the bundle.
2. **The client never writes XP, mastery, level or streak.** Those exist only
   server-side. Quiz `correct_index` is never sent before answering.
3. **Licence classes are law, not preference** (`docs/CONTENT-SOURCING.md`).
   `link_only` sources (ORF, BBC, Zeit, Standard, Nature) must not get
   full-text cards. This is why ~60 % of fetched articles are discarded and
   why Wikipedia (`cc`) carries the evergreen path.
4. **Never generate a card from model memory.** Every card is built against a
   concrete reference document and validated against it.
5. **Never rewrite an SQL function from a partial view of it.** Read the whole
   current definition first. Postgres has no partial replace, and silently
   dropping half a function is the worst class of bug here — it doesn't fail,
   it just stops awarding XP.
6. **An applied migration is frozen.** Editing it does nothing (`db push`
   skips it) and diverges from a fresh database. Always add a new file.

## Style

Comments and commit messages in German, code and identifiers in English.
Comments explain **why**, especially why an obvious alternative was rejected —
including mistakes made along the way. Don't write comments that restate the
code. The user reads commit messages carefully and values being told plainly
when something didn't work or when a previous decision was wrong.

## Gotchas already paid for

- Gemini free tier: **20 requests per day per model per project**. Hence 9
  models in a fallback chain × 5 API keys from 5 projects = ~900/day. A 429
  with `PerDay` in it means switch model immediately, don't back off.
- **A `limit` behind an aggregate limits nothing.** `select jsonb_agg(x) from
  t where ... limit 24` returns one row, so the limit is always satisfied and
  every row ends up inside the JSON. It cost months of a profile screen that
  never stopped scrolling (see 0065).
- **Dwell time only reached the server on swipe-away**, and even then it sat
  in the event buffer until ten events had piled up. Any server-side check
  against `user_content_state` for the card the user is *currently looking
  at* therefore saw nothing — that, not the threshold, is why the repost
  button never worked. `reportSeenNow()` in `useDwellTracking.ts` now flushes
  the elapsed remainder on demand.
- `set search_path = ''` resolves types by OID but **operators by search
  path** — pgvector's `<=>` needs `operator(public.<=>)`.
- pg_net lives in schema `net`, not `extensions.net`.
- `~` and `||` have equal precedence in Postgres; always parenthesise a
  concatenated regex.
- Wikipedia's API returns **one** full-text extract per request regardless of
  `exlimit`; only intros can be batched.
- `expo-image-picker` on web loses the user gesture before opening the file
  dialog — the web path uses a hand-rolled `<input type=file>`.
- **`maxItems` in a `response_schema` can kill every model at once.** With
  `maxItems: 8` on the beats array, all eight models answered
  400 INVALID_ARGUMENT — `minItems` alone is fine, and `CARD_SCHEMA` carries
  `maxItems` in three places without trouble. The API builds a decoding
  grammar from the schema and has to unroll the beat object eight times;
  with ten picture kinds that is too large. Upper bounds belong in the
  prompt and in our own validation, not in the schema.
- **`speechSynthesis.cancel()` immediately followed by `speak()`** hands you
  back your own utterance as `error: interrupted` after 7–22 ms. Everything
  that speaks goes through `stopThenSpeak()` in `lib/speech.ts`, which puts
  60 ms between the two.
- A card-generation error text that only reports `type(exc).__name__` is
  worse than no error line at all: an exhausted quota and a rejected request
  look identical and mean the opposite (wait vs. fix).

## What was just done (specials, 18 % → 50 %)

The old handoff guessed that the pre-filter in `transform/kinetic.py` (three
distinct multi-digit numbers) was the bottleneck. **It was not.** Measured
over 60 Wikipedia articles it stopped 2 of them. The loss was the model
itself: 12 of 20 attempts came back `"suitable": false` — and rightly so.
What it refused were "Scientific method", "Peer-Review", "Turing test",
"Evolution", "Impfung", "Plattentektonik", "Greenhouse effect". Those are the
*best* topics, they just have no series of numbers, and the prompt only
offered a table or bars.

Three more picture kinds fixed that — `timeline` (scaled time axis),
`quantity` (a grid of boxes filling up), `steps` (a process, **the only kind
that needs no numbers at all**). On the same 20 topics the yield went from
2/20 to 18/20.

Also changed: the token ceiling for a script (3000 was truncating long
tables — three of twenty came back as broken JSON), a rescue for truncated
JSON that keeps the complete beats instead of dropping the card, one repair
retry when validation finds a concrete shape error, and `make_script` now
returns *why* an attempt failed so the run summary separates "model said no"
from "validation said no". That distinction did not exist, which is why the
wrong bottleneck was assumed for so long.

`pipeline/kinetic_backfill.py` converts existing text cards: it refetches
the source document, builds a script against it and validates as usual. It
stops at `--target` (default 0.5) rather than converting everything —
`arrange.ts` caps specials at every second card, so the feed needs just as
many text cards. Every conversion is written to `pipeline/kinetic-backfill.log`
and `--revert` undoes the lot.

The cards also **loop** now: after the last beat, one second of silence, then
from the top, like a short video. There is no "Nochmal" button any more.

`/kinetic-demo` is a route that plays a hand-written script of each new kind.
It is not linked anywhere and exists to look at the picture kinds without
waiting for the pipeline.

### Why the picture kinds were so lopsided (and what actually fixed it)

Measured over all 114 specials: `steps` in 55 cards, `table` 32,
`timeline` 27, `compare` 5, `bars` 4 — and `quantity`, `scale`, `guess` in
**none**. Two wrong guesses preceded the answer, both mine:

1. "The prompt is too weak." It wasn't. Checked against 40 articles from
   the topic list without a single model call: two contain percentages that
   add up to a whole, none contain values spanning a factor of 1000. **The
   material was missing, not the instruction.** A Wikipedia intro about
   photosynthesis describes a process, not a split — so `steps` wins, and
   another line of prompt would have been another plea.
2. `guess` was forbidden by a rule of my own: "stay on ONE moving picture
   per script, one `statement` beat to open". A `guess` opener *is* a second
   picture. The kind was in the prompt and disallowed at the same time.

What followed: 29 topics chosen for their data *shape* (Erdatmosphäre,
Blut, Wasserverbrauch, Umsatzsteuer for shares; Lichtjahr, Zehnerpotenz,
Byte for magnitudes), an explicit exception for a `guess` opening pair, and
two of our own checks relaxed — `total: 100` no longer has to appear
verbatim in the source (it is the definition of percent, not a claim), and
a raster may hold six groups instead of four (verified in the renderer at
375×812, not assumed). The first ever `quantity` card came right after.

`scale` still fails validation when the source writes "9,46 Billionen km"
and the model writes `9460000000000`: the digit string is not in the text.
Deliberately not relaxed — checking only the mantissa would make
"9.46 million" and "9.46 trillion" indistinguishable.

- 32 of the remaining text cards can never be converted: the article URL is
  gone or returns too little text (`Quelle nicht mehr da`). The share only
  moves further through *new* cards.
- The share is a quota over the **stock**, so every new text card lowers it.
  `kinetic_backfill.py` therefore runs inside the scheduled workflow (last
  step, once a day at 06:17 UTC, on whatever daily quota is left).

## Backlog after that

- **More courses** (multi-card structured sequences; `features/courses`).
- **LAB tab** — users try things like a compound-interest calculator with
  more variables, then share a result as an info card visible as a reel on
  their own profile. This is the first feature where users *create*.
- **UI pass** — the design system is sound; what's inconsistent is everything
  around the card (four hand-rolled "back" headers, settings screens that are
  form lists rather than designed screens).
- **Account requirement** — at what point must someone register? Undecided.
- **PRO / monetisation** — ideas only so far, see `docs/PRODUKT-IDEEN.md`.

## Open items for the user (not you)

- **Five migrations are written but not applied.** There is no Supabase CLI
  and no psql in this environment, so DDL has to be pasted into the SQL
  editor by hand, in this order:
  - `0065_profile_lists.sql` — `get_my_social()` sends EVERY repost and like.
    The `limit 24` in 0018 sits behind the `jsonb_agg` and therefore limits
    the one aggregate row, not the rows going into it. Valid SQL that does
    nothing. Also adds `get_my_collection()` for the "Alle ansehen" screen.
  - `0066_leaderboard_friends.sql` — friends become mutual follows; the view
    `public_profiles` gains `avatar_path`. **The first version of this file
    failed** with `cannot change name of view column "region_code" to
    "avatar_path"`: `create or replace view` may only APPEND columns. Fixed
    by putting `avatar_path` last.
  - `0067_likes_nudge_feed.sql` — at most +25 % score for likes, log-damped.
  - `0068_admin_people_categories.sql` — admin person search and the
    category table. Until it runs, those two tabs show an error.
  - `0069_duels.sql` — duels. Five cards, one minute, five questions; the
    clock is stamped and checked server-side. **Not yet verified against a
    real database** — there is no psql here, so it has only been read, not
    run. If it fails, the error message says where.
- **SMTP** — the one thing nobody but you can do. If "Enable custom SMTP" is
  on with empty fields, *no* auth mail goes out at all, not even through the
  built-in sender. Two options: fill it in (`docs/SMTP.md`, Brevo, ~10 min)
  or switch it back off, which immediately restores the built-in sender —
  rate-limited, but working. Off beats half-configured.
  It also cannot be tested from outside: GoTrue answers a request for an
  unknown address with HTTP 200 and an empty body without touching SMTP at
  all (anti-enumeration). A real mail only exists for a real account.
- Push notifications work end-to-end but have never been confirmed against a
  real browser — automation browsers refuse the permission.

**Google login is fine** — verified 2026-09-12 with `pipeline/check_auth.py`:
provider on, 302 to accounts.google.com, client_id set, `redirect_uri`
pointing at `/auth/v1/callback`. The reported `Gateway Timeout` was a
transient Supabase hiccup, not a misconfiguration. Run that script before
changing any auth setting — it answers in five seconds what a screenshot
cannot.
