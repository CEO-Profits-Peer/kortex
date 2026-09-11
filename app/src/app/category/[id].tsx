import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { CategoryScreen } from '@/features/search/CategoryScreen';

export default function CategoryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <CategoryScreen categoryId={decodeURIComponent(id)} />;
}
