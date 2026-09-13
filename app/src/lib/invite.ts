import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { api } from './supabase';

/**
 * Der Einladungslink: `https://elycic.pages.dev/?einladung=CODE`.
 *
 * Warum der Code gespeichert und nicht nur aus der Adresse gelesen wird
 * --------------------------------------------------------------------
 * Zwischen dem Klick auf den Link und dem Moment, in dem es ein Konto gibt,
 * kann eine Anmeldung ueber Google liegen. Google schickt zurueck auf die
 * Startadresse - ohne `?einladung=`. Wer den Code nur aus der Adresse liest,
 * verliert genau die Einladungen, bei denen jemand sich gleich richtig
 * anmeldet, also die wertvollsten.
 *
 * Deshalb: beim Laden des Moduls aus der Adresse lesen, im Geraet merken, und
 * erst einloesen, wenn ein Profil existiert (Aufruf im Root-Layout nach dem
 * Profil-Laden).
 *
 * Der Code bleibt in der Adresse stehen. Die erste Fassung hat ihn per
 * history.replaceState entfernt - im Browser nachgesehen: expo-router
 * schreibt beim Start seine eigene Adresse zurueck, der Code stand danach
 * wieder da. Entfernen muss man ihn aber auch nicht. Wer den Link samt Code
 * weitergibt, laedt die naechste Person unter derselben Einladung ein - das
 * ist der Sinn des Links -, und eingeloest werden kann ohnehin nur einmal
 * und nur in den ersten sieben Tagen eines Kontos (0071).
 *
 * Eingeloest wird genau einmal. Jede endgueltige Antwort des Servers - auch
 * "ungueltig" oder "schon eingeladen" - loescht den Code. Nur ein Netzfehler
 * laesst ihn liegen; dann klappt es beim naechsten Start.
 */

const KEY = 'einladung_v1';
const CODE_FORM = /^[A-Za-z0-9]{7}$/;

let ausAdresse: string | null = null;

function ausDerAdresseLesen() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location) return;
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('einladung') ?? url.searchParams.get('ref');
    if (!code || !CODE_FORM.test(code)) return;
    ausAdresse = code.toUpperCase();
    void AsyncStorage.setItem(KEY, ausAdresse).catch(() => {});
  } catch {
    // Eine kaputte Adresse ist kein Grund, die App nicht zu starten.
  }
}

ausDerAdresseLesen();

/** Gibt es einen noch nicht eingeloesten Code? */
export async function offeneEinladung(): Promise<string | null> {
  if (ausAdresse) return ausAdresse;
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

let laeuft = false;

/**
 * Den gemerkten Code einloesen - still, einmal, nach dem Profil-Laden.
 *
 * Gibt den Status zurueck ('ok', 'ungueltig', ...) oder 'keine', wenn nichts
 * zu tun war. Die App zeigt davon nichts an: das Ergebnis sieht man daran,
 * dass die einladende Person unter "Deine Leute" steht.
 */
export async function einladungEinloesen(): Promise<string> {
  if (laeuft) return 'keine';
  laeuft = true;
  try {
    const code = await offeneEinladung();
    if (!code) return 'keine';
    const res = await api.redeemInvite(code);
    ausAdresse = null;
    await AsyncStorage.removeItem(KEY).catch(() => {});
    return res.status;
  } catch {
    // Netz weg oder Migration noch nicht eingespielt: Code behalten, beim
    // naechsten Start nochmal.
    return 'keine';
  } finally {
    laeuft = false;
  }
}
