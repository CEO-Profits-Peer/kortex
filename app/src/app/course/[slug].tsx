import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { CourseDetailScreen } from '@/features/courses/CourseDetailScreen';

export default function CourseRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  if (!slug) return null;
  return <CourseDetailScreen slug={decodeURIComponent(slug)} />;
}
