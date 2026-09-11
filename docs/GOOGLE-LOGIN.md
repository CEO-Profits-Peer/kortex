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

### 3. Nur wenn du eigene Adressen benutzt

`Authentication` → `URL Configuration` → **Redirect URLs**. Dort gehören alle
Adressen hinein, unter denen die App läuft:

```
http://localhost:8081/**
https://elycic.pages.dev/**
https://<deine-domain>/**
elycic://**
```

Das `elycic://` ist für die spätere App auf dem Handy — im Browser wird es
nicht gebraucht.

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
