import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { RewardLayer } from '@/components/RewardLayer';
/**
 * Nur wegen der Nebenwirkung geladen, und die ist wichtig: das Modul
 * haengt sich an `beforeinstallprompt`. Chrome meldet die
 * Installierbarkeit einmalig und kurz nach dem Start - wer da noch nicht
 * zuhoert, bekommt keinen zweiten Versuch, und der Knopf "Als App
 * benutzen" bliebe fuer immer aus.
 *
 * Wuerde das Modul erst beim Oeffnen des Profils geladen, waere genau das
 * der Normalfall.
 */
import '@/lib/install';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GridBackground } from '@/components/GridBackground';
import { WelcomeScreen } from '@/features/auth/WelcomeScreen';
import { OnboardingFlow } from '@/features/onboarding/OnboardingFlow';
import { WhatsNew, useWhatsNew } from '@/features/whatsnew/WhatsNew';
import { analytics } from '@/lib/analytics';
import { eventBuffer } from '@/lib/eventBuffer';
import { loadPrefs } from '@/lib/prefs';
import '@/lib/i18n';
import { api, configError } from '@/lib/supabase';
import { useSession } from '@/lib/useSession';
import { useAppFonts } from '@/theme/fonts';
import { color, space, type } from '@/theme/tokens';

function Gate() {
  const { session, ready } = useSession();
  const whatsNew = useWhatsNew();
  // null = noch nicht geladen, true/false = Onboarding erledigt?
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  const refreshProfile = useCallback(async () => {
    try {
      const p = await api.getMyProfile();
      // Nur die UUID plus Region und Sprache - nichts Personenbezogenes.
      if (p) analytics.identify(p.id, { region: p.region_code, language: p.language });
      setOnboarded(Boolean(p?.onboarding_completed_at));
    } catch {
      // Profil nicht ladbar (kein Netz, Migration fehlt): den Nutzer nicht
      // aussperren - lieber in den Feed lassen, der zeigt den Fehler selbst.
      setOnboarded(true);
    }
  }, []);

  useEffect(() => {
    if (!session) {
      setOnboarded(null);
      return;
    }
    void refreshProfile();
  }, [session, refreshProfile]);

  // Fehlende .env-Werte zuerst: sonst sieht man nur eine gescheiterte
  // Anmeldung und sucht an der falschen Stelle.
  if (configError) {
    return (
      <GridBackground>
        <View style={styles.center}>
          <Text style={styles.title}>Konfiguration fehlt</Text>
          <Text style={styles.body}>{configError}</Text>
        </View>
      </GridBackground>
    );
  }

  if (!ready) {
    return (
      <GridBackground>
        <View style={styles.center}>
          <ActivityIndicator color={color.signal.primary} />
        </View>
      </GridBackground>
    );
  }

  if (!session) return <WelcomeScreen />;

  if (onboarded === null) {
    return (
      <GridBackground>
        <View style={styles.center}>
          <ActivityIndicator color={color.signal.primary} />
        </View>
      </GridBackground>
    );
  }

  if (!onboarded) return <OnboardingFlow onDone={() => setOnboarded(true)} />;

  // Nach dem Onboarding, vor dem Feed: die Neuerungen. Nur bei geaenderter
  // Version, nur einmal, und nie beim allerersten Start.
  if (whatsNew.ready && whatsNew.show) {
    return <WhatsNew onDone={() => void whatsNew.dismiss()} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.bg },
        animation: 'fade',
      }}
    />
  );
}

// Splash haelt, bis die Schriften da sind - sonst blitzt fuer einen Moment
// die Systemschrift auf und alles springt.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const fontsReady = useAppFonts();

  useEffect(() => {
    if (fontsReady) void SplashScreen.hideAsync();
  }, [fontsReady]);

  useEffect(() => {
    // Holt Lesezeit nach, die beim letzten Beenden nicht mehr rausging.
    void eventBuffer.init();
    // Geraete-Einstellungen (Haptik, Bewegung) vor dem ersten Tippen laden.
    void loadPrefs();
    analytics.init();
    analytics.appOpened();
    return () => eventBuffer.dispose();
  }, []);

  if (!fontsReady) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Gate />
        {/* Liegt ueber allem und faengt jede Belohnung ab, egal von welchem
            Bildschirm sie kommt. Siehe lib/rewards.ts. */}
        <RewardLayer />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: space.xl,
  },
  title: { ...type.title, color: color.ink.max },
  body: { ...type.body, color: color.ink.mid, textAlign: 'center' },
});
