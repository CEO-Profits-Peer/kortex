import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { LabScreen } from '@/features/lab/LabScreen';

export default function LabRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <LabScreen id={decodeURIComponent(id)} />;
}
