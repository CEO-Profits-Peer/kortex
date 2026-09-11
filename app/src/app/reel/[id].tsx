import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { PersonFeedScreen } from '@/features/social/PersonFeedScreen';

export default function ReelRoute() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  if (!id) return null;
  return (
    <PersonFeedScreen
      startId={decodeURIComponent(id)}
      handle={from ? decodeURIComponent(from) : undefined}
    />
  );
}
