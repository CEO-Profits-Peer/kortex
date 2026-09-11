import { Tabs } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { BlueprintTabBar, type TabBarProps } from '@/components/BlueprintTabBar';
import { color } from '@/theme/tokens';

/**
 * Reihenfolge: Kurse · Feed · Suche · Profil.
 *
 * Feed steht auf Position 2 und ist gleichzeitig die Startroute (index).
 * Zwei Gruende: bei vier Tabs sind die mittleren Positionen am
 * daumenfreundlichsten, und "Kurse" ganz links sagt beim ersten Oeffnen,
 * dass das hier eine Lern-App ist und nicht noch ein Feed.
 *
 * Die Leiste selbst kommt aus BlueprintTabBar - die Standard-Tab-Bar wuerde
 * die App sofort nach Baukasten aussehen lassen.
 */
export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      // expo-router und @react-navigation fuehren getrennte Kopien derselben
      // Typen. Die Werte passen zur Laufzeit, nur die Deklarationen nicht.
      tabBar={(props) => <BlueprintTabBar {...(props as unknown as TabBarProps)} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bg } }}
    >
      <Tabs.Screen name="courses" options={{ title: t('tabs.courses') }} />
      <Tabs.Screen name="index" options={{ title: t('tabs.feed') }} />
      <Tabs.Screen name="search" options={{ title: t('tabs.search') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
