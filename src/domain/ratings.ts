import type { Rating } from '../types'

const normalizedRatings: Record<string, Rating> = {
  excellent: 'Excellent',
  good: 'Good',
  okay: 'Okay',
  ok: 'Okay',
  'needs to improve': 'Needs to Improve',
  'needs improvement': 'Needs to Improve',
}

export function normalizeGrade(value: string | null | undefined): Rating {
  if (!value?.trim()) return 'Not rated'
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  return normalizedRatings[normalized] ?? 'Not rated'
}

export function ratingClass(rating: Rating): string {
  return `rating-${rating.toLowerCase().replaceAll(' ', '-')}`
}
