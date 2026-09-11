import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { useFonts } from 'expo-font';

/**
 * Die Schriften.
 *
 * Der größte einzelne Hebel gegen den Baukasten-Eindruck. Systemschrift —
 * San Francisco auf iOS, Roboto auf Android — sagt dem Auge sofort
 * "Standard-App". Zwei eigene Familien sagen: hier hat jemand entschieden.
 *
 * Space Grotesk: eine Grotesk mit eckigen, technisch wirkenden Details
 * (offenes g, schmales r, kantiges a). Passt zum Blaupausen-Raster und
 * bleibt bei 60 bis 90 Wörtern pro Karte gut lesbar — für ein ganzes Buch
 * wäre sie zu eigenwillig, für eine Karte genau richtig.
 *
 * JetBrains Mono: für Zahlen, Codes, Messwerte. Der Kontrast zwischen
 * proportionaler und dicktengleicher Schrift ist das, was technische
 * Oberflächen absichtsvoll aussehen lässt.
 *
 * Beide sind unter der SIL Open Font License frei nutzbar, auch kommerziell.
 */

export const font = {
  regular: 'SpaceGrotesk_400Regular',
  medium: 'SpaceGrotesk_500Medium',
  bold: 'SpaceGrotesk_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
} as const;

export function useAppFonts() {
  const [loaded, error] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });
  // Bei einem Ladefehler soll die App mit Systemschrift starten statt gar
  // nicht. Eine hässliche App ist besser als ein weißer Bildschirm.
  return loaded || Boolean(error);
}
