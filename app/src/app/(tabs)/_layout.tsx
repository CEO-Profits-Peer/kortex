import { Tabs } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { BlueprintTabBar, type TabBarProps } from '@/components/BlueprintTabBar';
import { color } from '@/theme/tokens';

/**
 * Reihenfolge: Home · Studio · Feed · Suche · Profil.
 *
 * Vorher vier Tabs mit "Kurse" ganz links. Kurse allein trugen keinen Tab
 * (es gab einen einzigen), und was die Leute machen, denen man folgt, lag
 * hinter einem Knopf im Profil. Jetzt:
 *
 *   Home    was deine Leute machen - der Anstoss, selbst mitzumachen
 *   Studio  wofuer man sich absichtlich hinsetzt: Kurse, Duelle, Wiederholung
 *   Feed    in der Mitte, wo der Daumen ohne Umgreifen hinkommt
 *
 * Gestartet wird weiter im Feed (`index`), nicht in Home: bei 29 Konten und
 * zwei gegenseitigen Follows ist Home fuer die meisten noch leer, und der
 * erste Bildschirm darf nicht leer sein. Die Reihenfolge der Tabs und die
 * Startroute sind zwei verschiedene Entscheidungen.
 *
 * Die Leiste selbst kommt aus BlueprintTabBar - die Standard-Tab-Bar wuerde
 * die App sofort nach Baukasten aussehen lassen.
 */
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      // expo-router und @react-navigation fuehren getrennte Kopien derselben
      // Typen. Die Werte passen zur Laufzeit, nur die Deklarationen nicht.
      tabBar={(props) => <BlueprintTabBar {...(props as unknown as TabBarProps)} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bg } }}
    >
      <Tabs.Screen name="home" options={{ title: t('tabs.home') }} />
      <Tabs.Screen name="studio" options={{ title: t('tabs.studio') }} />
      <Tabs.Screen name="index" options={{ title: t('tabs.feed') }} />
      <Tabs.Screen name="search" options={{ title: t('tabs.search') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
