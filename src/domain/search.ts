import { normalizeGrade } from './ratings'
import type { Facility, Rating } from '../types'

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function searchableFields(facility: Facility): string[] {
  return [
    facility.name,
    facility.programIdentifier,
    facility.address,
    facility.city,
    facility.zip,
    facility.recordId,
  ].map(normalizeSearchText)
}

export function searchScore(facility: Facility, query: string): number | null {
  const term = normalizeSearchText(query)
  if (!term) return 0

  const fields = searchableFields(facility)
  const name = fields[0] ?? ''
  if (name === term) return 10_000
  if (name.startsWith(term)) return 8_000

  const tokens = [...new Set(term.split(' '))]
  if (!tokens.every((token) => fields.some((field) => field.includes(token)))) return null

  const nameWords = name.split(' ')
  let score = 0
  for (const token of tokens) {
    if (nameWords.includes(token)) score += 700
    else if (nameWords.some((word) => word.startsWith(token))) score += 550
    else if (name.includes(token)) score += 400
    else {
      const fieldIndex = fields.findIndex((field) => field.split(' ').includes(token))
      score += fieldIndex >= 0 ? 250 - fieldIndex : 100
    }
  }
  if (nameWords.slice(0, tokens.length).every((word, index) => word?.startsWith(tokens[index] ?? ''))) score += 1_000
  return score
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
