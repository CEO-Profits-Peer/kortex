# Anmelden mit Google

## Die kurze Antwort auf „ohne dass ich was machen muss"

Fast. Der Code ist fertig — Knopf, Ablauf, Übernahme von Name und Bild,
Erhalt des bisherigen Fortschritts. **Ein Schritt bleibt aber unvermeidbar**,
und zwar aus einem guten Grund:

> Google gibt eine Client-ID und ein Client-Secret **nur an den Inhaber des
> Projekts** aus, und Supabase braucht beides, um sich bei Google als „diese
> App" auszuweisen. Diese zwei Werte kann niemand außer dir einsetzen — sonst
> könnte sich jeder als deine App ausgeben.

Das sind zwei Felder, einmalig, danach nie wieder. Alles andere läuft.

---

## Der eine Schritt

### 1. In der Google Cloud Console

`APIs und Dienste` → `Anmeldedaten` → deine **OAuth-2.0-Client-ID** (Typ
*Webanwendung*).

Unter **Autorisierte Weiterleitungs-URIs** muss genau das hier stehen:

```
https://fjnljjsgdigrbsqoewvi.supabase.co/auth/v1/callback
```

Nichts anderes. Nicht die Adresse der App — Google spricht mit Supabase,
nicht mit der App.

Dann rechts oben **Client-ID** und **Client-Schlüssel** kopieren.

### 2. Im Supabase-Dashboard

`Authentication` → `Sign In / Providers` → **Google**

- Einschalten
- Client ID einfügen
- Client Secret einfügen
- Speichern

**Fertig.** Der Knopf in der App funktioniert ab diesem Moment.

### 3. Pflicht, nicht optional: die Rückkehr-Adressen

Hier stand vorher „nur wenn du eigene Adressen benutzt". Das war falsch und
hat genau den Fehler verursacht, der als *„Google Account has some problems
getting you to the right side back"* gemeldet wurde.

`Authentication` → `URL Configuration`:

| Feld | Wert |
|---|---|
| **Site URL** | `https://elycic.pages.dev` |
| **Redirect URLs** | die Liste unten |

```
https://elycic.pages.dev/**
http://localhost:8081/**
https://<deine-domain>/**
elycic://**
```

Warum der Platzhalter `/**` nötig ist: Seit der Behebung schickt die App
Google auf **die Seite zurück, auf der der Knopf stand** — wer sein Konto
unter „Konto" verknüpft, kommt auch dort wieder heraus und sieht sofort, ob
es geklappt hat. Vorher landete jeder im Feed und musste sich
zurückklicken. Damit gibt es aber nicht mehr eine einzige Rückkehr-Adresse,
sondern eine pro Bildschirm.

Steht eine Adresse nicht in der Liste, lehnt Supabase sie nicht etwa ab —
es nimmt **stillschweigend die Site URL**. Ist die noch `localhost`, landet
jeder nach dem Anmelden auf einer toten Seite. Genau das meldet die App
jetzt im Klartext (`app/src/lib/oauthReturn.ts`), statt wortlos auf den
Startbildschirm zurückzufallen.

Das `elycic://` ist für die spätere App auf dem Handy — im Browser wird es
nicht gebraucht.

### 4. Wenn E-Mail benutzt wird: eigener Mailversand

Das gehört streng genommen nicht zu Google, steht aber im selben
Dashboard-Bereich und fällt sonst erst im Betrieb auf.

Der eingebaute Mailversand von Supabase ist **auf wenige Mails pro Stunde
begrenzt** und ausdrücklich nur zum Ausprobieren gedacht. Beim Testen
kommt nach dem dritten Versuch:

```
over_email_send_rate_limit
```

Für echte Nutzer: `Project Settings` → `Authentication` → **SMTP Settings**
und einen eigenen Absender eintragen (Resend, Postmark, Brevo — alle haben
ein kostenloses Kontingent, das für den Anfang reicht).

---

## Was der Code schon macht

### Der Fortschritt bleibt erhalten

Das ist der Teil, der leicht schiefgeht und den man erst bemerkt, wenn es
jemandem passiert ist.

Wer die App zwei Wochen anonym benutzt und sich dann mit Google anmeldet,
würde bei der naheliegenden Umsetzung (`signInWithOAuth`) einen **neuen**
Nutzer bekommen — Punkte weg, Serie weg, Wiederholungen weg.

Deshalb versucht `app/src/features/auth/googleSignIn.ts` zuerst
`linkIdentity`: Google wird an das bestehende Konto **angehängt**. Nur wenn
das nicht geht, wird normal angemeldet.

### Name und Bild kommen mit

Google liefert den Namen mit. Zwei Wege, zwei Stellen:

| Fall | Was passiert | Wo |
|---|---|---|
| Neues Konto | Der Datenbank-Trigger nimmt `full_name` gleich mit | `handle_new_user()` in `0021` |
| Anonymes Konto verknüpft | Kein neuer Nutzer, also feuert kein Trigger — die App ruft danach `adopt_identity_profile()` | `0021`, aufgerufen aus `useSession.ts` |

Der zweite Fall ist der, den man vergisst. Ohne ihn heißt jeder verknüpfte
Nutzer weiter `grid7f3a91`.

`adopt_identity_profile()` ist absichtlich zurückhaltend: Es füllt nur, was
leer ist. Ein selbst gewählter Anzeigename wird **nicht** von Google
überschrieben, und das Handle wird nur ersetzt, solange es noch der
generierte Platzhalter ist.

---

## Wenn es nicht geht

| Meldung | Bedeutung |
|---|---|
| „Google ist im Supabase-Projekt noch nicht eingeschaltet" | Schritt 2 fehlt. Die App sagt das im Klartext statt eine technische Meldung zu zeigen. |
| `redirect_uri_mismatch` bei Google | Schritt 1 — die Callback-Adresse stimmt nicht auf das Zeichen genau. |
| Anmeldung klappt, landet aber auf einer Fehlerseite | Schritt 3 — die Adresse der App steht nicht in den Redirect URLs. |
| „Dieses Google-Konto ist schon mit einem anderen Profil verbunden" | Genau das. Mit dem anderen Konto abmelden oder ein anderes Google-Konto nehmen. |
