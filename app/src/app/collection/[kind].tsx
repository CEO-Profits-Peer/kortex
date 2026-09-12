import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { CollectionScreen } from '@/features/profile/CollectionScreen';

export default function CollectionRoute() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  return <CollectionScreen kind={kind === 'likes' ? 'likes' : 'reposts'} />;
}
