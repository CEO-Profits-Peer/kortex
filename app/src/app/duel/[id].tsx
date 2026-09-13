import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { DuelScreen } from '@/features/duel/DuelScreen';

export default function DuelRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <DuelScreen duelId={id} />;
}
