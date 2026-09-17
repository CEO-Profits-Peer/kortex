import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Appear } from '@/components/Appear';
import { Icon } from '@/components/Icon';
import { haptics } from '@/lib/haptics';
import { promptInstall, useInstallState } from '@/lib/install';
import { BRAND } from '@/lib/brand';
import { flaeche } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * "Als App benutzen".
 *
 * Erscheint nur im Browser und nur, solange nicht installiert ist. In der
 * installierten App und in der echten Handy-App ist er weg - das ist die
 * ganze Anforderung, und sie steckt in useInstallState().
 *
 * Zwei Wege, weil Apple keinen dritten laesst:
 *
 *   Chrome, Edge, Samsung Internet  ein Tipp, der Browser fragt nach
 *   Safari auf dem iPhone           geht nur von Hand, also erklaert
 *
 * Die Anleitung fuer Safari steht ausgeschrieben da und nicht hinter einem
 * "mehr erfahren". Wer sie braucht, braucht sie genau jetzt.
 */
export function InstallBanner() {
  const state = useInstallState();
  const [manual, setManual] = useState(false);

  if (state.kind === 'hidden') return null;

  const showSteps = state.kind === 'manual' || manual;
  const ios = state.kind === 'manual' ? state.ios : false;

  return (
    <Appear distance={6}>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.mark}>
            <Icon name="plus" size={17} color={color.akzent} />
          </View>

          <View style={styles.body}>
            <Text style={styles.title}>{BRAND.name} als App</Text>
            <Text style={styles.sub}>
              Eigenes Symbol, kein Browser drumherum, startet schneller.
            </Text>
          </View>

          {!showSteps ? (
            <Pressable
              onPress={async () => {
                haptics.medium();
                const started = await promptInstall();
                // Der Browser hat abgelehnt oder die Gelegenheit ist
                // verfallen: dann bleibt der Weg von Hand.
                if (!started) setManual(true);
              }}
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.ctaText}>Hinzufügen</Text>
            </Pressable>
          ) : null}
        </View>

        {showSteps ? (
          <View style={styles.steps}>
            {ios ? (
              <>
                <Step n="1" text="Unten im Browser auf Teilen tippen" />
                <Step n="2" text={'„Zum Home-Bildschirm“ wählen'} />
                <Step n="3" text="Hinzufügen bestätigen" />
              </>
            ) : (
              <>
                <Step n="1" text="Browser-Menü öffnen (drei Punkte)" />
                <Step n="2" text={'„App installieren“ oder „Zum Startbildschirm“'} />
                <Step n="3" text="Bestätigen" />
              </>
            )}
          </View>
        ) : null}
      </View>
    </Appear>
  );
}

function Step({ n, text }: { n: string; text: string }) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepN}>{n}</Text>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(10),
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  mark: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.akzent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  title: { ...type.label, fontSize: 15, color: color.ink.max },
  sub: { ...type.meta, color: color.ink.low },

  cta: {
    paddingHorizontal: space.lg,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: color.signal.primary,
  },
  ctaText: { ...type.label, fontSize: 13, color: color.bg },

  steps: { gap: space.sm, paddingLeft: 2 },
  step: { flexDirection: 'row', alignItems: 'baseline', gap: space.md },
  stepN: { ...type.mono, fontSize: 11, color: color.akzent, width: 12 },
  stepText: { ...type.body, fontSize: 14, color: color.ink.mid, flex: 1 },
});
