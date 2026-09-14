import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { StapelScreen } from '@/features/posts/StapelScreen';

export default function StapelRoute() {
  const { id, start } = useLocalSearchParams<{ id: string; start?: string }>();
  if (!id) return null;
  const s = Number(start);
  return <StapelScreen postId={decodeURIComponent(id)} start={Number.isInteger(s) && s > 0 ? s : 0} />;
}
