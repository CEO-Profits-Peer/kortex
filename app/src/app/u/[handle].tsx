import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { PublicProfileScreen } from '@/features/social/PublicProfileScreen';

export default function PublicProfileRoute() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  if (!handle) return null;
  return <PublicProfileScreen handle={decodeURIComponent(handle)} />;
}
