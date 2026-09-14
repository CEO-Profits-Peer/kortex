import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { PublicProfileScreen } from '@/features/social/PublicProfileScreen';

export default function PublicProfileRoute() {
  // `von` und `post` sagen, woher man kommt - wer hier folgt, zaehlt in der
  // Statistik fuer diese Stelle (follow_events, 0080).
  const { handle, von, post } = useLocalSearchParams<{ handle: string; von?: string; post?: string }>();
  if (!handle) return null;
  return (
    <PublicProfileScreen
      handle={decodeURIComponent(handle)}
      herkunft={von === 'beitrag' && post ? { quelle: 'beitrag', post } : von === 'suche' ? { quelle: 'suche' } : undefined}
    />
  );
}
