import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { PostScreen } from '@/features/posts/PostScreen';

export default function PostRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <PostScreen id={decodeURIComponent(id)} />;
}
