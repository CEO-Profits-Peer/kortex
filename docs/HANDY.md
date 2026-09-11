# App aufs Handy bekommen

Reihenfolge: erst die schnellste Lösung probieren, dann die nächste.

---

## Wenn der QR-Code nicht lädt

Das ist fast immer das Netzwerk, nicht der Code. Expo Go holt den Code über
dein WLAN direkt vom PC — viele Netze verbieten genau das.

### 1. Tunnel (löst 90 % der Fälle)

```bash
npm run tunnel
```

Beim ersten Mal fragt Expo, ob `@expo/ngrok` installiert werden soll → **ja**.
Der Code läuft dann über Expos Server statt direkt durchs WLAN. Funktioniert
auch, wenn Handy und PC in verschiedenen Netzen sind, hinter einem VPN, oder
wenn das WLAN Geräte gegeneinander abschottet (Schulen, Hotels, Gäste-WLAN).

Etwas langsamer beim Nachladen, sonst identisch.

### 2. Windows-Firewall

Wenn du bei `npm start` nie einen Firewall-Dialog gesehen hast, blockt Windows
Node vermutlich still:

```
Windows-Sicherheit → Firewall & Netzwerkschutz → App durch Firewall zulassen
→ Node.js suchen → Haken bei "Privat"
```

### 3. Gleiches WLAN?

Handy im Mobilfunknetz statt WLAN ist der häufigste Trivialfall. Auch: PC am
LAN-Kabel, Handy im WLAN eines anderen Routers.

### 4. Expo Go aktuell?

Expo Go unterstützt immer nur die neuesten SDK-Versionen. Dieses Projekt läuft
auf **SDK 57**. Im App Store bzw. Play Store nach Updates schauen.

---

## Was du bei einem Fehler brauchst

Wenn es weiter nicht geht, schick mir bitte:

1. Was **genau** passiert — QR-Code wird nicht erkannt? Lädt und bleibt weiß?
   Rote Fehlerseite mit Text?
2. Die letzten Zeilen aus dem Terminal, in dem `npm start` läuft.
3. Ob `w` (Browser) funktioniert. Wenn ja, ist es sicher das Netzwerk.

---

## Ohne Expo Go: eigene App-Datei

Das eigentliche Ziel — ein Icon auf dem Startbildschirm, kein QR-Code, kein
laufendes Terminal. Deine Mitschüler bekommen einfach einen Download-Link.

**Voraussetzung:** Expo-Account (kostenlos).

```bash
npx expo login
```

```bash
npm i -g eas-cli
```

```bash
cd app && eas build --platform android --profile preview
```

Der Build läuft in Expos Cloud (~15 Minuten, Free Tier). Danach bekommst du
einen Link zur `.apk`. Auf dem Android-Handy öffnen, „Installation aus
unbekannten Quellen" einmal erlauben, fertig.

Ab dann brauchst du dein Terminal nur noch für **Code-Änderungen** — und die
kannst du sogar ohne neuen Build ausrollen:

```bash
cd app && eas update --branch preview
```

Das schiebt neuen JavaScript-Code direkt in die installierte App. Nur wenn
sich native Abhängigkeiten ändern, ist ein neuer Build nötig.

**iPhone:** braucht den Apple Developer Account (99 €/Jahr) und TestFlight.
Bis dahin bleibt es dort bei Expo Go.

> `eas.json` fehlt noch — sag Bescheid, dann lege ich sie an und führe dich
> durch den ersten Build.
