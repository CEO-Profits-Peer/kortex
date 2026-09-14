import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { PostScreen } from '@/features/posts/PostScreen';

export default function PostRoute() {
  // `kommentar`: aus einem geteilten Kommentar-Link oder der Glocke (0080).
  const { id, kommentar } = useLocalSearchParams<{ id: string; kommentar?: string }>();
  if (!id) return null;
  return <PostScreen id={decodeURIComponent(id)} kommentarId={kommentar || undefined} />;
}
