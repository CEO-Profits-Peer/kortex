import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { PeopleListScreen } from '@/features/social/PeopleListScreen';

export default function PeopleRoute() {
  const { handle, mode } = useLocalSearchParams<{ handle: string; mode?: string }>();
  if (!handle) return null;
  return (
    <PeopleListScreen
      handle={decodeURIComponent(handle)}
      mode={mode === 'following' ? 'following' : 'followers'}
    />
  );
}
