# Mailversand einrichten

Supabase verschickt Bestätigungs- und Anmeldelinks. Der eingebaute Versand
ist auf **wenige Mails pro Stunde** begrenzt und laut Supabase
ausdrücklich nur zum Ausprobieren gedacht — beim Testen bin ich selbst in
`over_email_send_rate_limit` gelaufen.

> ⚠️ **Zuerst prüfen:** Wenn „Enable custom SMTP" schon **an** steht, die
> Felder aber leer sind, geht **gar keine** Mail mehr raus — auch nicht
> über den eingebauten Versand, denn der ist damit abgeschaltet. Halb
> eingerichtet ist schlechter als gar nicht. Entweder fertig machen oder
> den Schalter zurück auf aus.

---

## Welcher Anbieter

| | Frei | Eigene Domain nötig? |
|---|---|---|
| **Brevo** ← Empfehlung | 300 Mails/Tag | **Nein** — eine einzelne Absenderadresse reicht |
| Resend | 3 000/Monat | **Ja** — ohne Domain nur an dich selbst |
| Mailjet | 200/Tag | Nein |

Der Unterschied ist der Punkt: Resend lässt dich ohne eigene Domain nur an
die eigene Adresse schicken. Das merkt man erst, wenn der erste echte
Nutzer keine Mail bekommt. Brevo erlaubt es, eine **einzelne Adresse** zu
bestätigen — deine Gmail reicht.

---

## Brevo, Schritt für Schritt (~10 Minuten)

### 1. Konto

[brevo.com](https://www.brevo.com) → *Sign up free*. Keine Kreditkarte.

### 2. Absenderadresse bestätigen

Links unten auf deinen Namen → **Senders, Domains & Dedicated IPs** →
Reiter **Senders** → *Add a sender*

| Feld | Wert |
|---|---|
| From name | `ElyCic` |
| From email | deine echte Adresse |

Brevo schickt dorthin eine Mail mit einem Bestätigungslink. **Erst nach dem
Klick** funktioniert der Versand — das ist die Stelle, an der es sonst
kommentarlos scheitert.

### 3. SMTP-Zugangsdaten holen

Oben rechts **SMTP & API** → Reiter **SMTP** → *Generate a new SMTP key*

Du bekommst drei Werte:

```
Server   smtp-relay.brevo.com
Port     587
Login    9a1b2c001@smtp-brevo.com     ← NICHT deine Gmail
Password xsmtpsib-…                   ← nur einmal sichtbar
```

Das Passwort wird genau einmal angezeigt. Direkt in Supabase einfügen.

### 4. In Supabase eintragen

`Authentication` → `Emails` → Reiter **SMTP Settings**

| Feld | Wert |
|---|---|
| Enable custom SMTP | an |
| Sender email address | die in Schritt 2 bestätigte Adresse |
| Sender name | `ElyCic` |
| Host | `smtp-relay.brevo.com` |
| Port number | `587` — **nicht** die vorausgefüllte 465 |
| Username | der `…@smtp-brevo.com`-Login aus Schritt 3 |
| Password | der `xsmtpsib-…`-Key |

**Save**.

### 5. Das Limit hochsetzen — sonst war alles umsonst

`Authentication` → `Rate Limits` → **Rate limit for sending emails**

Steht nach wie vor auf dem alten Wert, auch mit eigenem SMTP. Auf `100`
pro Stunde stellen. Wer das vergisst, hat einen funktionierenden
Mailversand und dieselbe Sperre wie vorher.

### 6. Testen

In der App auf **Konto → Konto sichern**, deine Adresse eintragen. Kommt
binnen einer Minute nichts, in Brevo unter **Transactional → Logs**
nachsehen — dort steht, ob die Mail überhaupt angenommen wurde. Das trennt
„Supabase hat nicht geschickt" von „der Anbieter hat nicht zugestellt",
und ohne diese Trennung sucht man an der falschen Stelle.

---

## Was später noch fehlt

Solange als Absender eine `@gmail.com`-Adresse steht, kann Mail im
Spam-Ordner landen: Gmail sagt per DMARC-Eintrag, dass Mails in seinem
Namen von Google-Servern kommen sollten — und Brevo ist keiner. Zum Testen
geht das, für echte Nutzer nicht dauerhaft.

Die Lösung ist eine eigene Domain (rund 10 € im Jahr): Absender wird dann
`hallo@elycic.app`, in Brevo unter *Domains* eintragen, drei DNS-Einträge
setzen, fertig. Danach ist auch Resend eine Option.

Eine Domain brauchst du für die App ohnehin irgendwann — `elycic.pages.dev`
ist als Adresse zum Herzeigen nicht gedacht.
