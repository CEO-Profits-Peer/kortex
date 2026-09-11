import * as Expo from 'expo-haptics';

import { getPrefs } from './prefs';

/**
 * Haptik-Huelle.
 *
 * Existiert aus einem einzigen Grund: der Schalter in den Einstellungen soll
 * tatsaechlich etwas bewirken. Wuerden die Komponenten expo-haptics direkt
 * aufrufen, waere die Einstellung eine Attrappe.
 *
 * Zweiter Nutzen: Auf Web gibt es keine Taptic Engine. Die Aufrufe laufen
 * dort ins Leere statt zu werfen.
 */

function on(): boolean {
  return getPrefs().haptics;
}

export const haptics = {
  light() {
    if (on()) void Expo.impactAsync(Expo.ImpactFeedbackStyle.Light);
  },
  medium() {
    if (on()) void Expo.impactAsync(Expo.ImpactFeedbackStyle.Medium);
  },
  select() {
    if (on()) void Expo.selectionAsync();
  },
  success() {
    if (on()) void Expo.notificationAsync(Expo.NotificationFeedbackType.Success);
  },
  warning() {
    if (on()) void Expo.notificationAsync(Expo.NotificationFeedbackType.Warning);
  },
  /** Fuer Aufrufe aus einem Reanimated-Worklet ueber runOnJS. */
  selectFromWorklet() {
    if (on()) void Expo.selectionAsync();
  },
};
