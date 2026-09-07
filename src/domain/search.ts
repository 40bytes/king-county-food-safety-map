import { normalizeGrade } from './ratings'
import type { Facility, Rating } from '../types'

function searchableFields(facility: Facility): string[] {
  return [
    facility.name,
    facility.programIdentifier,
    facility.address,
    facility.city,
    facility.zip,
    facility.recordId,
  ].map((value) => value.toLocaleLowerCase())
}

export function searchScore(facility: Facility, query: string): number | null {
  const term = query.trim().toLocaleLowerCase()
  if (!term) return 0

  const fields = searchableFields(facility)
  const name = fields[0] ?? ''
  if (name === term) return 1000
  if (name.startsWith(term)) return 800
  if (name.split(/\s+/).some((word) => word.startsWith(term))) return 650

  const exactFieldIndex = fields.findIndex((field) => field === term)
  if (exactFieldIndex >= 0) return 550 - exactFieldIndex

  const prefixFieldIndex = fields.findIndex((field) => field.startsWith(term))
  if (prefixFieldIndex >= 0) return 400 - prefixFieldIndex

  const substringFieldIndex = fields.findIndex((field) => field.includes(term))
  return substringFieldIndex >= 0 ? 200 - substringFieldIndex : null
}

export function filterAndRankFacilities(
  facilities: Facility[],
  query: string,
  enabledRatings: ReadonlySet<Rating>,
): Facility[] {
  return facilities
    .map((facility) => ({ facility, score: searchScore(facility, query) }))
    .filter(
      (entry): entry is { facility: Facility; score: number } =>
        entry.score !== null && enabledRatings.has(normalizeGrade(entry.facility.grade)),
    )
    .sort((left, right) => right.score - left.score || left.facility.name.localeCompare(right.facility.name))
    .map(({ facility }) => facility)
}
