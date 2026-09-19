import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Ist dieses Element gerade (zu einem guten Teil) auf dem Bildschirm?
 *
 * Wunsch 19.09.: Animationen sollen laufen, wenn man sie SIEHT - nicht beim
 * Laden weit unterhalb im Home, wo sie niemand mitbekommt. Einmal im Bild,
 * bleibt der Wert true: eine Animation soll sich nicht bei jedem Scrollen
 * wiederholen.
 *
 * Im Browser ueber IntersectionObserver (der View-Ref von react-native-web
 * ist ein echtes DOM-Element). Auf dem Handy gibt es das nicht; dort gilt
 * sofort true - lieber zu frueh abgespielt als gar nicht.
 */
export function useImBild<T = unknown>(anteil = 0.5) {
  const ref = useRef<T>(null);
  const [imBild, setImBild] = useState(Platform.OS !== 'web' || typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (imBild) return;
    const el = ref.current as unknown as Element | null;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setImBild(true);
      return;
    }
    const beob = new IntersectionObserver(
      (eintraege) => {
        if (eintraege.some((e) => e.isIntersecting)) {
          setImBild(true);
          beob.disconnect();
        }
      },
      { threshold: anteil },
    );
    beob.observe(el);
    return () => beob.disconnect();
  }, [imBild, anteil]);

  return { ref, imBild };
}
